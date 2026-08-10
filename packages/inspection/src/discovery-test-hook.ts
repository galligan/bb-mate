export type DiscoveryTestHookPoint =
  "after-root-lstat" | "after-directory-read";

export interface DiscoveryTestHookEvent {
  readonly point: DiscoveryTestHookPoint;
  readonly path: string;
}

type DiscoveryTestHook = (
  event: DiscoveryTestHookEvent,
) => void | Promise<void>;

let activeHook: DiscoveryTestHook | null = null;

export async function runDiscoveryTestHook(
  event: DiscoveryTestHookEvent,
): Promise<void> {
  await activeHook?.(event);
}

export function installDiscoveryTestHookForTest(
  hook: DiscoveryTestHook,
): () => void {
  if (activeHook) throw new Error("a discovery test hook is already installed");
  activeHook = hook;
  return () => {
    if (activeHook === hook) activeHook = null;
  };
}
