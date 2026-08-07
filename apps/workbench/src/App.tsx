import { useState } from "react";
import { BbShell } from "@/components/BbShell";
import { MateOverlay } from "@/components/MateOverlay";
import { resolveCatalogSelection, surfaceCatalog } from "@/surface-catalog";
import type { SurfaceId } from "@/surface-catalog";

export function App() {
  const [surfaceId, setSurfaceId] = useState<SurfaceId>(surfaceCatalog[0].id);
  const [fixtureId, setFixtureId] = useState<string>(
    surfaceCatalog[0].fixtures[0].id,
  );
  const selection = resolveCatalogSelection(surfaceId, fixtureId);

  return (
    <>
      <BbShell selection={selection} />
      <MateOverlay
        selection={selection}
        onSurfaceChange={(nextSurfaceId) => {
          const next = resolveCatalogSelection(nextSurfaceId, "");
          setSurfaceId(next.surface.id);
          setFixtureId(next.fixture.id);
        }}
        onFixtureChange={setFixtureId}
      />
    </>
  );
}
