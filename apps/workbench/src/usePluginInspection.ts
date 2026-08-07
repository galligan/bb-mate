import { useEffect, useState } from "react";
import type { PluginInspection } from "@/plugin-inspection";

interface InspectionResult {
  inspection: PluginInspection | null;
  error: string | null;
}

export function usePluginInspection(): InspectionResult {
  const [result, setResult] = useState<InspectionResult>({
    inspection: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/bb-mate-plugin.json", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Plugin inspection failed with HTTP ${response.status}`,
          );
        }
        return (await response.json()) as PluginInspection;
      })
      .then((inspection) => setResult({ inspection, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          inspection: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => controller.abort();
  }, []);

  return result;
}
