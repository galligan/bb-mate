import { useState } from "react";
import { BbShell } from "@/components/BbShell";
import { MateOverlay } from "@/components/MateOverlay";
import { findScenario, scenarios } from "@/scenarios";

export function App() {
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const scenario = findScenario(scenarioId);

  return (
    <>
      <BbShell scenario={scenario} />
      <MateOverlay scenarioId={scenario.id} onScenarioChange={setScenarioId} />
    </>
  );
}
