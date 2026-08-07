import type { ProductFixture } from "./surface-fixture-types";
import {
  composerFixtures,
  contentScriptFixtures,
  fileOpenerFixtures,
  homepageFixtures,
  messageActionFixtures,
  messageDirectiveFixtures,
  navigationPanelFixtures,
  pendingInteractionFixtures,
  settingsFixtures,
  sidebarFooterFixtures,
  threadHeaderFixtures,
  threadPanelFixtures,
} from "./surface-fixtures";
import { threadListFixtures } from "./thread-list-fixtures";

export type SurfaceClassification =
  "plugin-component" | "host-action" | "mixed" | "content-script-lifecycle";
export type RenderingOwner = "bb" | "plugin";
export type RenderingKind = "chrome" | "component" | "interaction-outcome";

export interface SurfaceValidation {
  fixture: { claim: "deterministic-approximation"; visualAuthority: false };
  harness: { claim: "public-contract"; visualAuthority: false };
  live: { claim: "visual-authority"; visualAuthority: true };
}

const validation: SurfaceValidation = {
  fixture: { claim: "deterministic-approximation", visualAuthority: false },
  harness: { claim: "public-contract", visualAuthority: false },
  live: { claim: "visual-authority", visualAuthority: true },
};

interface SurfaceInput<
  Id extends string,
  Path extends string,
  Fixtures extends readonly ProductFixture<object, object>[],
> {
  id: Id;
  name: string;
  description: string;
  registrationPath: Path;
  classification: SurfaceClassification;
  previewPlacement?: "main" | "sidebar-list";
  fixtureSchema: string;
  fixtures: Fixtures;
  inputs: readonly string[];
  data?: readonly string[];
  actions?: readonly string[];
  rendering: readonly {
    part: string;
    owner: RenderingOwner;
    kind: RenderingKind;
  }[];
  exclusive?: boolean;
  security?: readonly string[];
  lifecycle?: Readonly<Record<string, string>>;
}

function defineSurface<
  const Id extends string,
  const Path extends string,
  const Fixtures extends readonly ProductFixture<object, object>[],
>(input: SurfaceInput<Id, Path, Fixtures>) {
  return {
    ...input,
    previewPlacement: input.previewPlacement ?? ("main" as const),
    publicContract: {
      inputs: input.inputs,
      data: input.data ?? [],
      actions: input.actions ?? [],
    },
    exclusive: input.exclusive ?? false,
    bbOwnedVisuals: input.rendering.some(({ owner }) => owner === "bb"),
    trust: "full-trust-local-code" as const,
    security: input.security ?? [
      "Plugin code executes as trusted same-origin local code.",
    ],
    lifecycle: input.lifecycle ?? { render: "host-activates-registration" },
    validation,
  };
}

const pluginComponent = [
  { part: "content", owner: "plugin", kind: "component" },
  { part: "surrounding-chrome", owner: "bb", kind: "chrome" },
] as const;
const hostAction = [
  { part: "control", owner: "bb", kind: "chrome" },
  { part: "callback-outcome", owner: "bb", kind: "interaction-outcome" },
] as const;

export const surfaceCatalog = [
  defineSurface({
    id: "homepage-section",
    name: "Homepage section",
    description: "Plugin content on the compose homepage.",
    registrationPath: "slots.homepageSection",
    classification: "plugin-component",
    fixtureSchema: "homepage-section/v1",
    fixtures: homepageFixtures,
    inputs: ["id", "title", "component"],
    data: ["projectId"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "settings-section",
    name: "Settings section",
    description: "Plugin-owned settings content inside host settings.",
    registrationPath: "slots.settingsSection",
    classification: "plugin-component",
    fixtureSchema: "settings-section/v1",
    fixtures: settingsFixtures,
    inputs: ["id", "title?", "description?", "component"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "navigation-panel",
    name: "Navigation panel",
    description: "A plugin-owned route reached through host navigation.",
    registrationPath: "slots.navPanel",
    classification: "plugin-component",
    fixtureSchema: "navigation-panel/v1",
    fixtures: navigationPanelFixtures,
    inputs: ["id", "title", "icon", "path", "component", "headerContent?"],
    data: ["subPath"],
    actions: ["navigate"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "thread-panel-action",
    name: "Thread panel action",
    description: "A host launcher that opens plugin panel content.",
    registrationPath: "slots.threadPanelAction",
    classification: "mixed",
    fixtureSchema: "thread-panel-action/v1",
    fixtures: threadPanelFixtures,
    inputs: ["id", "title", "icon?", "component", "layout?", "run?"],
    data: ["threadId", "params"],
    actions: ["openPanel"],
    rendering: [
      { part: "launcher", owner: "bb", kind: "chrome" },
      { part: "panel-content", owner: "plugin", kind: "component" },
      { part: "open-outcome", owner: "bb", kind: "interaction-outcome" },
    ],
  }),
  defineSurface({
    id: "pending-interaction",
    name: "Pending interaction",
    description: "Plugin rendering for a typed user-input request.",
    registrationPath: "slots.pendingInteraction",
    classification: "plugin-component",
    fixtureSchema: "pending-interaction/v1",
    fixtures: pendingInteractionFixtures,
    inputs: ["id", "component"],
    data: ["interaction"],
    actions: ["submit", "cancel"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "sidebar-footer-action",
    name: "Sidebar footer action",
    description: "Host-rendered footer control backed by a plugin callback.",
    registrationPath: "slots.sidebarFooterAction",
    classification: "host-action",
    fixtureSchema: "sidebar-footer-action/v1",
    fixtures: sidebarFooterFixtures,
    inputs: ["id", "title", "icon", "run"],
    actions: ["openSettings"],
    rendering: hostAction,
  }),
  defineSurface({
    id: "thread-list",
    name: "Sidebar thread list",
    description: "One plugin-selected replacement for the scrolling list.",
    registrationPath: "slots.experimental_threadList",
    classification: "plugin-component",
    previewPlacement: "sidebar-list",
    fixtureSchema: "sidebar-thread-list/v1",
    fixtures: threadListFixtures,
    inputs: ["id", "title", "description?", "component"],
    data: ["route state", "viewport", "search", "projects", "threads"],
    actions: [
      "open",
      "openNewThread",
      "onNavigate",
      "setPinned",
      "setRead",
      "rename",
      "archive",
      "requestDelete",
    ],
    rendering: [
      { part: "scrolling-list", owner: "plugin", kind: "component" },
      { part: "sidebar-chrome", owner: "bb", kind: "chrome" },
    ],
    exclusive: true,
    lifecycle: {
      selection: "user-selects-one-provider-per-client",
      fallback: "host-restores-built-in-list-when-unavailable",
    },
  }),
  defineSurface({
    id: "thread-header-action",
    name: "Thread header action",
    description: "A compact plugin control in each visible thread header.",
    registrationPath: "slots.experimental_threadHeaderAction",
    classification: "plugin-component",
    fixtureSchema: "thread-header-action/v1",
    fixtures: threadHeaderFixtures,
    inputs: ["id", "title", "component"],
    data: ["threadId", "projectId", "isCompactViewport"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "file-opener",
    name: "File opener",
    description: "Plugin viewer or editor for selected file extensions.",
    registrationPath: "slots.fileOpener",
    classification: "plugin-component",
    fixtureSchema: "file-opener/v1",
    fixtures: fileOpenerFixtures,
    inputs: ["id", "title", "extensions", "component"],
    data: ["path", "source"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "message-directive",
    name: "Message directive",
    description: "Plugin content parsed from an assistant message directive.",
    registrationPath: "slots.messageDirective",
    classification: "plugin-component",
    fixtureSchema: "message-directive/v1",
    fixtures: messageDirectiveFixtures,
    inputs: ["id", "component"],
    data: ["attributes", "source", "message"],
    actions: ["openWorkspaceFile"],
    rendering: pluginComponent,
  }),
  defineSurface({
    id: "message-action",
    name: "Message action",
    description: "Host-rendered message control backed by a plugin callback.",
    registrationPath: "slots.messageAction",
    classification: "host-action",
    fixtureSchema: "message-action/v1",
    fixtures: messageActionFixtures,
    inputs: ["id", "title", "icon?", "run"],
    data: ["threadId", "message", "selectedText?"],
    actions: ["openPanel"],
    rendering: hostAction,
  }),
  defineSurface({
    id: "composer-customization",
    name: "Composer customization",
    description: "Plugin components and behavior inside host composer chrome.",
    registrationPath: "composer.customize",
    classification: "mixed",
    fixtureSchema: "composer-customization/v1",
    fixtures: composerFixtures,
    inputs: ["id", "scopes?", "actions?", "banners?", "plusMenu?", "richText?"],
    data: ["scope", "layout", "draft", "run"],
    actions: ["composer API", "plus-menu callback", "rich-text match"],
    rendering: [
      { part: "composer-chrome", owner: "bb", kind: "chrome" },
      { part: "actions-and-banners", owner: "plugin", kind: "component" },
      { part: "plus-menu-row", owner: "bb", kind: "chrome" },
      { part: "menu-callback", owner: "bb", kind: "interaction-outcome" },
    ],
  }),
  defineSurface({
    id: "content-script",
    name: "Content script",
    description: "Trusted shell behavior with an explicit host lifecycle.",
    registrationPath: "contentScripts.register",
    classification: "content-script-lifecycle",
    fixtureSchema: "content-script-lifecycle/v1",
    fixtures: contentScriptFixtures,
    inputs: ["id", "mount"],
    data: ["pluginId", "generation", "AbortSignal"],
    actions: ["experimental_setThreadRowStatus?", "disposer"],
    rendering: [
      { part: "mount-and-dispose", owner: "bb", kind: "interaction-outcome" },
    ],
    security: [
      "Never mount content scripts during discovery or fixture preview.",
      "The host contains failures and owns abort and cleanup ordering.",
    ],
    lifecycle: {
      discovery: "never-mount",
      activation: "host-mounts-once-per-generation",
      replacement: "host-aborts-then-disposes-exactly-once",
    },
  }),
] as const;

export type CatalogEntry = (typeof surfaceCatalog)[number];
export type SurfaceId = CatalogEntry["id"];
export type SurfaceRegistrationPath = CatalogEntry["registrationPath"];

export function findSurface<Id extends SurfaceId>(id: Id) {
  return surfaceCatalog.find((surface) => surface.id === id) as Extract<
    CatalogEntry,
    { id: Id }
  >;
}

type SelectionFor<Surface extends CatalogEntry> = Surface extends CatalogEntry
  ? { surface: Surface; fixture: Surface["fixtures"][number] }
  : never;
export type CatalogSelection = SelectionFor<CatalogEntry>;

export function resolveCatalogSelection(surfaceId: string, fixtureId: string) {
  const surface =
    surfaceCatalog.find(({ id }) => id === surfaceId) ?? surfaceCatalog[0];
  const fixtures = surface.fixtures as readonly ProductFixture<
    object,
    object
  >[];
  const fixture = fixtures.find(({ id }) => id === fixtureId) ?? fixtures[0];
  return { surface, fixture } as CatalogSelection;
}

export function isThreadListSelection(
  selection: CatalogSelection,
): selection is SelectionFor<Extract<CatalogEntry, { id: "thread-list" }>> {
  return selection.surface.id === "thread-list";
}
