export function nativeCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv = { ...env };
  delete childEnv.BB_CLI;
  delete childEnv.BB_CLI_REEXEC;
  return childEnv;
}
