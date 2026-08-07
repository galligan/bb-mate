export type SurfaceStoryTheme = "light" | "dark";
export type SurfaceStoryViewport = "desktop" | "compact";

export interface SurfaceStoryArgs {
  fixtureId: string;
  theme: SurfaceStoryTheme;
  viewport: SurfaceStoryViewport;
}
