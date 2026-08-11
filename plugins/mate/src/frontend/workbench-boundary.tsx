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
            failed ? "Workbench unavailable" : "Finding development plugins"
          }
          description={
            failed
              ? "Plugin Studio could not read project data. No server details were exposed."
              : "Reading bb projects before the bounded plugin scan starts."
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
              : "Registered projects remain visible even when they have no plugins."}
          </p>
        </NativeSettingsSection>
      </div>
    </div>
  );
}
