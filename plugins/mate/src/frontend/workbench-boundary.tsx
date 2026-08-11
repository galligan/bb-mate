export interface PluginWorkbenchBoundaryProps {
  state: "pending" | "failed";
  onRetry(): void;
}

export function PluginWorkbenchBoundary({
  state,
  onRetry,
}: PluginWorkbenchBoundaryProps) {
  const failed = state === "failed";
  return (
    <div className="pw-shell pw-shell--boundary">
      <section aria-labelledby="pw-boundary-heading" aria-live="polite">
        <p className="pw-eyebrow">Supervised runtime</p>
        <h2 id="pw-boundary-heading">
          {failed ? "Runtime status unavailable" : "Checking runtime status"}
        </h2>
        <p>
          {failed
            ? "Plugin Workbench could not read the runtime status. No server details were exposed."
            : "Reading the supervised runtime without starting it."}
        </p>
        {failed ? (
          <button type="button" onClick={onRetry}>
            Check again
          </button>
        ) : null}
      </section>
    </div>
  );
}
