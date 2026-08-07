import type { Story } from "@ladle/react";
import { findSurface, type SurfaceId } from "@/surface-catalog";
import { SurfaceLab } from "./SurfaceLab";
import type { SurfaceStoryArgs } from "./surface-story-contract";

export interface CatalogSurfaceStory extends Story<SurfaceStoryArgs> {
  surfaceId: SurfaceId;
}

export function createSurfaceStory(surfaceId: SurfaceId): CatalogSurfaceStory {
  const surface = findSurface(surfaceId);
  const fixtureIds = surface.fixtures.map(({ id }) => id);

  const story: CatalogSurfaceStory = (args) => (
    <SurfaceLab
      key={`${surfaceId}:${args.fixtureId}:${args.theme}:${args.viewport}`}
      surfaceId={surfaceId}
      fixtureId={args.fixtureId}
      theme={args.theme}
      viewport={args.viewport}
    />
  );

  story.storyName = "Catalog fixtures";
  story.surfaceId = surfaceId;
  story.args = {
    fixtureId: fixtureIds[0],
    theme: "light",
    viewport: "desktop",
  };
  story.argTypes = {
    fixtureId: {
      options: fixtureIds,
      control: { type: "select" },
      description: "Deterministic catalog fixture",
    },
    theme: {
      options: ["light", "dark"],
      control: { type: "inline-radio" },
      description: "Plugin-owned canvas theme",
    },
    viewport: {
      options: ["desktop", "compact"],
      control: { type: "inline-radio" },
      description: "Bounded surface viewport",
    },
  };

  return story;
}
