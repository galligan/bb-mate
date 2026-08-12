# Project-first Plugin Workbench

Date: 2026-08-11
Status: Complete

## Outcome

Turn the native-styled Workbench from a runtime-admission form into a
project-first plugin browser. The root should foreground detected local bb
projects and their plugins, while runtime health becomes compact operational
metadata and public bb navigation owns thread and panel movement.

## Constraints

- Keep the existing v2 runtime admission and privacy contracts unchanged.
- Use only released bb 0.36 plugin SDK navigation/thread seams and the pinned
  component registry.
- Do not call private host routes or copy the host's Add Project dialog.
- Keep browser preview unavailable until the tracked browser-handoff capability
  can provide a real preview.
- Do not infer a thread-to-plugin association that bb does not actually store;
  show honest project threads instead.

## Work plan

1. [x] Replace the unsupported `Wrench` icon hint with bb's supported native
       `Toolbox` icon.
2. [x] Match Settings → Usage with a tooltip-backed, icon-only refresh control.
3. [x] Collapse runtime health into one compact status line rather than a
       dominant card.
4. [x] Replace the project select/admit form with detected project rows and an
       `Open` action; show detected plugins beneath the opened project.
5. [x] Add target-detail subroutes with public `toPluginPanel` navigation and a
       clear Back action.
6. [x] Show unarchived threads from the target's containing project and use the
       host's public open/new-thread actions.
7. [x] Remove the inert root-level preview section and explain the missing
       native Add Project seam where an empty project list needs recovery.
8. [x] Update unit, boundary, story, keyboard, screenshot, and axe coverage;
       rebuild/reload the existing path plugin and verify the live flow.

## Results

- The released bb host now shows the supported `Toolbox` icon instead of the
  host's fallback lightning bolt.
- Runtime health is one quiet metadata line with the exact Settings → Usage
  tooltip-backed refresh treatment.
- Eligible projects are the root resources. `Open` privately discovers a
  project's source plugins, which appear as nested navigable rows.
- Plugin rows open stable panel subroutes with `Back to projects`, an honest
  preview-unavailable state, and the containing project's unarchived threads.
- The released SDK provides thread navigation and new-thread actions, but not
  an Add Project dialog or persistent plugin/thread association. The UI points
  to bb's sidebar for project creation and labels threads as project-scoped.
- Live verification opened BB Mate, discovered Linear and Plugin Workbench,
  navigated into Plugin Workbench, rendered its BB Mate project thread, and
  returned through panel history without leaving the plugin surface.
- Verification passed 71 plugin tests, the complete workspace check and
  compatibility gate, formatting, diff validation, and all 14 Chromium
  screenshot/axe cases.

## Stop conditions

Stop before implementing a fake preview, private route navigation, path
scanning in the browser, automatic background runtime startup across every
project, target execution, or a persistent thread association without a real
host/runtime-owned contract.
