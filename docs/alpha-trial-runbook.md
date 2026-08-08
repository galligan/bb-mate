# Clean-room alpha trial runbook

This runbook reproduces the OS-637 source, package, and isolated native lanes
without a sibling bb checkout or normal bb state. It targets the verified macOS
arm64 environment. Use five unused loopback ports and keep every generated file
under one disposable root.

## 1. Export the candidate

Run this from the GitButler BB Mate checkout. Resolve the exact committed branch
head rather than GitButler's synthetic workspace commit, then export a Git-less
source tree:

```sh
candidate_branch="${BB_MATE_CANDIDATE_BRANCH:-os-637-run-a-clean-room-external-developer-bb-mate-alpha-trial}"
candidate="$(but status --json | jq -r --arg branch "$candidate_branch" \
  '[.stacks[].branches[] | select(.name == $branch) | .commits[0].commitId][0] // empty')"
test -n "$candidate"
git cat-file -e "$candidate^{commit}"
trial_root="$(mktemp -d "${TMPDIR:-/tmp}/bb-mate-alpha-trial.XXXXXX")"
source_dir="$trial_root/source"
profile="$trial_root/profile"
prefix="$trial_root/install"
plugin="$trial_root/plugin"
mkdir -p "$source_dir" "$profile" "$prefix" "$plugin"
git archive --format=tar "$candidate" | tar -xf - -C "$source_dir"
test ! -e "$source_dir/.git"
test ! -e "$source_dir/node_modules"
```

Save `trial_root`, `candidate`, and the five chosen ports in the trial notes. Do
not point any later variable at an existing plugin, home directory, or bb data
directory.

## 2. Enter an empty profile

Capture the directories containing both Bun and npm before starting a shell
that loads no user configuration:

```sh
bun_bin="$(dirname "$(command -v bun)")"
npm_bin="$(dirname "$(command -v npm)")"
env -i \
  USER="${USER:-trial}" \
  LOGNAME="${LOGNAME:-trial}" \
  SHELL=/bin/zsh \
  PATH="$bun_bin:$npm_bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TRIAL_ROOT="$trial_root" \
  CANDIDATE="$candidate" \
  /bin/zsh --no-rcs
```

Inside that shell, reconstruct only trial-local values:

```sh
trial_root="$TRIAL_ROOT"
candidate="$CANDIDATE"
source_dir="$trial_root/source"
profile="$trial_root/profile"
prefix="$trial_root/install"
plugin="$trial_root/plugin"
export HOME="$profile/home"
export XDG_CONFIG_HOME="$profile/config"
export XDG_CACHE_HOME="$profile/cache"
export XDG_STATE_HOME="$profile/state"
export XDG_DATA_HOME="$profile/data"
export TMPDIR="$profile/tmp"
export BUN_INSTALL_CACHE_DIR="$profile/cache/bun"
export npm_config_cache="$profile/cache/npm"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" \
  "$XDG_STATE_HOME" "$XDG_DATA_HOME" "$TMPDIR"
unset BB_CLI BB_CLI_REEXEC BB_SERVER_URL BB_DATA_DIR
command -v bun npm git tar shasum curl perl >/dev/null
```

The empty shell must not contain saved credentials, dotenv values, or a path to
a sibling bb checkout.

## 3. Verify source Fixture mode

```sh
cd "$source_dir"
time bun install --frozen-lockfile
bun --filter @bb-mate/workbench stories --host 127.0.0.1 --port 61047 \
  >"$profile/source-stories.log" 2>&1 &
source_stories_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:61047/meta.json \
    >"$profile/source-meta.json" && break
  test "$attempt" -lt 10 || exit 1
  sleep 0.5
done
test "$(jq '.stories | length' "$profile/source-meta.json")" -eq 13
```

Open the printed URL and confirm `meta.json` exposes 13 stories. Inspect a
plugin component, host action, mixed/bb-owned seam, and content-script story.
The content-script fixture must remain inert. To prove HMR, copy
`apps/workbench/src/thread-list-fixtures.ts`, change the deterministic
`Agent focus` label, observe the browser update without restarting, and restore
the copied file:

```sh
fixture="$source_dir/apps/workbench/src/thread-list-fixtures.ts"
cp "$fixture" "$fixture.trial-backup"
perl -pi -e 's/Agent focus/Agent focus trial/' "$fixture"
# Observe "Agent focus trial" in the open browser without restarting Vite.
mv "$fixture.trial-backup" "$fixture"
kill -INT "$source_stories_pid" 2>/dev/null || true
wait "$source_stories_pid" || true
```

## 4. Build and install the artifact

```sh
cd "$source_dir"
bun run compatibility:check
bun run package:artifact
artifact="$source_dir/artifacts/bb-mate-0.1.0-alpha.0.tgz"
shasum -a 256 "$artifact"
npm install --prefix "$prefix" --no-save --package-lock=false "$artifact"
mate="$prefix/node_modules/.bin/bb-mate"
"$mate" --help
```

For the OS-637 candidate, the archive contains 40 files and 13 stories. Record
the checksum rather than assuming it matches an earlier candidate.

## 5. Create the disposable plugin

Create these three files under the empty `plugin` directory:

```sh
cat >"$plugin/package.json" <<'JSON'
{
  "name": "bb-plugin-alpha-trial",
  "version": "1.0.0",
  "private": true,
  "engines": { "bb": ">=0.35.1", "bbPluginSdk": ">=0.4.1" },
  "dependencies": { "@bb/plugin-sdk": "^0.4.1" },
  "bb": {
    "name": "Alpha Trial",
    "description": "Disposable clean-room plugin",
    "branding": { "icon": "Puzzle" },
    "server": "./server.ts",
    "app": "./app.tsx"
  }
}
JSON
```

Use the same inert entrypoint for the server and app:

```sh
printf 'export default {};\n' >"$plugin/server.ts"
printf 'export default {};\n' >"$plugin/app.tsx"
```

Fixture mode can inspect this manifest without the unpublished SDK. Native bb
owns the later build and writes only disposable plugin output.

## 6. Start isolated native bb

Provision the trusted native prerequisite separately. Its install scripts are
required for the native SQLite binding; this is not an install script from the
BB Mate archive.

```sh
npm install --prefix "$prefix" --no-save --package-lock=false \
  bb-app@0.35.1 "$artifact"
bb="$prefix/node_modules/.bin/bb"
bb_app="$prefix/node_modules/.bin/bb-app"
bb_data="$profile/bb-data"
server_port=49286
daemon_port=49287
test -x "$bb" && test -x "$bb_app"
```

Choose different unused ports when either example port is occupied. Start the
combined server and host daemon under the disposable profile, retain its PID,
and capture its logs:

```sh
"$bb_app" --data-dir "$bb_data" \
  --server-port "$server_port" \
  --host-daemon-port "$daemon_port" \
  >"$profile/bb-app.log" 2>&1 &
bb_app_pid=$!
```

Bind every native command to that process and wait for the isolated inventory:

```sh
export BB_CLI="$bb"
export BB_CLI_REEXEC=1
export BB_SERVER_URL="http://127.0.0.1:$server_port"
export BB_DATA_DIR="$bb_data"
"$bb" --version
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  "$bb" plugin list --json && break
  test "$attempt" -lt 10 || exit 1
  sleep 0.5
done
"$bb" connect status --json
```

The version must be 0.35.1, the inventory must contain builtins only, and
Connect must be unpaired. Stop if any normal plugin or paired Connect state is
visible.

## 7. Exercise source and packaged native handoffs

From the source archive, verify that both terminal and browser inspection use
the isolated bb instance:

```sh
cd "$source_dir"
bun run bb-mate dev "$plugin" --host 127.0.0.1 --port 61048 \
  >"$profile/source-dev.log" 2>&1 &
source_dev_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:61048/bb-mate-session.json \
    >"$profile/source-session.json" && break
  test "$attempt" -lt 10 || exit 1
  sleep 0.5
done
jq '{bbVersion:.inspection.native.bbVersion, connect:.inspection.native.connect.paired}' \
  "$profile/source-session.json"
kill -INT "$source_dev_pid" 2>/dev/null || true
wait "$source_dev_pid" || true
```

The session JSON must report bb 0.35.1 and unpaired Connect. Stop the source
server, then exercise the installed artifact:

```sh
"$mate" inspect "$plugin"
"$mate" check "$plugin"
"$mate" live "$plugin"
"$mate" dev "$plugin" --host 127.0.0.1 --port 61049 \
  >"$profile/package-dev.log" 2>&1 &
package_dev_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:61049/meta.json \
    >"$profile/package-meta.json" && break
  test "$attempt" -lt 10 || exit 1
  sleep 0.5
done
jq '.stories | length' "$profile/package-meta.json"
kill -INT "$package_dev_pid" 2>/dev/null || true
wait "$package_dev_pid" || true
```

`check` must delegate `bb plugin build .` and refresh metadata. Because the
plugin was intentionally not installed, `live` must exit 1 and print the exact
`bb plugin install <path> --yes` handoff without running it. The packaged dev
server must expose all 13 static stories.

## 8. Uninstall and teardown

```sh
kill -INT "$bb_app_pid"
wait "$bb_app_pid"
npm uninstall --prefix "$prefix" --no-save --package-lock=false bb-mate
test ! -e "$prefix/node_modules/bb-mate"
test ! -e "$prefix/node_modules/.bin/bb-mate"
test ! -e "$prefix/package.json"
test ! -e "$prefix/package-lock.json"
if test -e "$prefix/node_modules/.package-lock.json"; then
  ! grep -F 'node_modules/bb-mate' "$prefix/node_modules/.package-lock.json"
fi
```

Verify all five chosen ports are closed and review the trial root before
removing that exact temporary directory. The only plugin mutation should be
`plugin/dist` from the native build. Do not install the plugin, pair or expose
Connect, publish the artifact, or reuse normal bb state during this trial.
