import { Button } from "../components/ui/button";
import { NativeSettingsSection } from "./native-settings";

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
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-6 pt-4 md:px-5 md:pb-8 md:pt-5">
        <NativeSettingsSection
          headingId="pw-boundary-heading"
          title={
            failed ? "Runtime status unavailable" : "Checking runtime status"
          }
          description={
            failed
              ? "Plugin Workbench could not read the runtime status. No server details were exposed."
              : "Reading the supervised runtime without starting it."
          }
          action={
            failed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
              >
                Check again
              </Button>
            ) : null
          }
        >
          <p className="text-xs text-subtle-foreground" aria-live="polite">
            {failed
              ? "The current status is unknown."
              : "The runtime remains idle until you open a project."}
          </p>
        </NativeSettingsSection>
      </div>
    </div>
  );
}
