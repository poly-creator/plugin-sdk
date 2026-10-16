/**
 * Plugin SDK contract — the types a third-party plugin author programs
 * against. Mirrors the Extension-Points platform in the design spec
 * (docs/superpowers/specs/2026-07-31-plugin-system-design.md): a Plugin is a
 * container of typed extension points contributed from `onload()` against a
 * `PluginHost` (`app.*`).
 *
 * All host subsystems (ui, canvas, node, system, workspace, storage, history,
 * agent, workflow, asset, template, provider, logger) are wired in the runtime
 * `createPluginHost` (apps/desktop/src/plugins/host.ts). `manifest.trust:
 * "safe"` swaps the runtime object for `SafePluginHost`, which structurally
 * omits `system`, `provider`, and `workspace` and rejects canvas mutation at
 * runtime; the SDK exports both interfaces so `safe` plugins can declare their
 * `app` against the narrower one and get compile-time enforcement.
 */
import type { JSONSchema, Message, TextResult, ToolCall, ToolDeclaration } from "./ai.ts";
import type { SettingTab } from "./settings.ts";
import type { NodeDefinition } from "./node-v2.ts";
import type { NodePromptBarDef, NodeToolbarItem } from "./node-ui.ts";
import type { Modal } from "./modal.ts";

/** Trust tier. `trusted` gets the full host; `safe` gets `SafePluginHost`. */
export type PluginTrust = "trusted" | "safe";

/** Which extension-point families a plugin contributes (display + future gating). */
export type PluginCategory =
	| "node"
	| "provider"
	| "agent"
	| "workflow"
	| "asset"
	| "template"
	| "storage"
	| "history"
	| "ui"
	| "script";

/** Known permission gates a plugin may request. Display-only in V1; trusted-
    tier access is structurally enforced (omitted fields on SafePluginHost).
    Plugins SHOULD list every permission their `onload()` requires — the host
    surfaces a warning banner at install time when the declared set diverges
    from what's actually used. */
export type PluginPermission =
	| "canvas.read"
	| "canvas.write"
	| "canvas.registerNodeDef"
	| "canvas.addNode"
	| "node.register"
	| "ui.register"
	| "ui.registerCommand"
	| "ui.registerContextMenu"
	| "provider.register"
	| "ai.enqueueJob"
	| "ai.generateText"
	| "ai.generateImage"
	| "ai.generateVideo"
	| "ai.generateAudio"
	| "project.read"
	| "project.write"
	| "scripts.read"
	| "scripts.parse"
	| "storyboard.read"
	| "storyboard.write"
	| "assets.uploadFile"
	| "assets.read";

/** `manifest.json` — Plane-1 metadata + entry points. Pure data; safe to parse from disk. */
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	author?: string;
	description?: string;
	/** Minimum PolyCreator version that can run this plugin (semver). */
	minAppVersion?: string;
	/** Renderer entry: built ESM bundle, served via `polycreator-plugin://<id>/<main>`. */
	main: string;
	/** Optional main-process entry for provider/job backends (V1.2). */
	nodeEntry?: string;
	trust?: PluginTrust;
	/** Display-only in V1; enforced structurally in V2 safe-tier. */
	permissions?: PluginPermission[];
	categories?: PluginCategory[];
}

/** A named plugin store (created by `registerStore`). Same shape as the default store. */
export interface PluginStore {
	load<T = unknown>(): Promise<T | null>;
	save(data: unknown): Promise<void>;
}

/** Per-plugin persistent state. V1.0: in-memory; durable backing lands in V1.4. */
export interface PluginStorage extends PluginStore {
	/**
	 * Create (or open) a named store under this plugin's namespace. Backed by
	 * `userData/plugin-data/<pluginId>/<storeId>.json` (Obsidian multi-store
	 * parity). The default `load`/`save` use the root store; named stores are
	 * separate files. `schema` is display-only in V1 (not enforced).
	 */
	registerStore(id: string, schema?: unknown): PluginStore;
}

/** A canvas cleanup callback registered by a plugin; auto-run on unload. */
export type CleanupFn = () => void;

/** Unsubscribe handle returned by host event subscriptions. */
export type Unsubscribe = () => void;

/**
 * PluginHost — the `app.*` surface passed to a plugin. The full 9-subsystem
 * contract is declared here so SDK types are complete; V1.0 `createPluginHost`
 * fills the implemented subset and stubs the rest (see host.ts).
 */
export interface PluginHost {
	readonly pluginId: string;
	readonly manifest: PluginManifest;

	/** Register a cleanup callback — auto-run on disable/hot-reload/quit. */
	registerCleanup(fn: CleanupFn): void;

	/**
	 * B1: register floating toolbar / prompt bar for one or more node types.
	 * The host renders them in its own overlay so plugin types look exactly like
	 * the built-in image/video/audio nodes. Last registration wins for a given
	 * `type`.
	 */
	registerNodeUI(
		types: Iterable<string>,
		contribution: {
			toolbar?: NodeToolbarItem[];
			promptBar?: NodePromptBarDef;
		},
	): void;

	/** Per-plugin persistent storage (Obsidian loadData/saveData parity). */
	storage: PluginStorage;

	/** UI subsystem: toasts + future command/panel/context/settings/style (V1.1). */
	ui: {
		notify(message: string, type?: "info" | "success" | "warning" | "error"): void;
		/** Register a command — appears in the command palette (Cmd+K). */
		registerCommand(command: UICommand): void;
		/** Inject a global stylesheet (scoped by id; re-register replaces). */
		registerStyle(id: string, css: string): void;
		/** Register a toolbar button (appended to the canvas toolbar). */
		registerToolbarButton(button: UIToolbarButton): void;
		/** Register a panel (side-panel slot). */
		registerPanel(panel: UIPanel): void;
		/** Register a canvas right-click context menu item. */
		registerContextMenu(item: UIContextMenuItem): void;
		/**
		 * Register a settings tab (appended to the Settings Modal sidebar).
		 *
		 * Two forms, both accepted:
		 * - a {@link UISettingsTab} — `{ id, label, render }`, the plugin owns
		 *   the whole tab body (V1.1 form, still supported);
		 * - a {@link SettingTab} instance (normally a `PluginSettingTab`) — the
		 *   host renders its `getSettingDefinitions()` declaratively and binds
		 *   storage through the tab's `getControlValue`/`setControlValue`.
		 *
		 * Prefer `PolycreatorPlugin.addSettingTab`, which fills id/label from the
		 * manifest and prefixes the id for you.
		 */
		registerSettingsTab(tab: UISettingsTabInput): void;
		/** Register a global keyboard shortcut (fired on the canvas window; ignored while typing in inputs). */
		registerShortcut(shortcut: UIShortcut): void;
		/** Open a modal dialog with a custom body. */
		/**
		 * Open a modal dialog.
		 *
		 * Accepts either the V1.1 `{ title, render }` options object, or a
		 * {@link Modal} subclass instance — the host mounts its `contentEl` and
		 * drives `onOpen`/`onClose`. Only one plugin modal shows at a time.
		 */
		openModal(options: UIModalInput): void;
		/** Close whichever plugin modal is currently showing. */
		closeModal(): void;

		/**
		 * Look up a host-provided React UI primitive by name (matches a key on
		 * `window.PolyCreator.HostComponents`). The returned component renders with
		 * the host's theme + Tailwind tokens so plugins don't have to ship
		 * their own Button/Card/Progress. Throws when `name` is not registered
		 * — list the valid names with `app.ui.components()`.
		 *
		 * Currently exposed: `Button`, `Card`, `Progress`, `Dialog`, `Alert`,
		 * `Badge`. The set is forward-compatible: more will land as the host
		 * grows.
		 */
		component(name: string): unknown;
		/** List the names a plugin can hand to `app.ui.component(name)`. */
		components(): string[];
	};

	/** Logging (renderer console + main logger via tipc). */
	logger: {
		info(message: string): void;
		warn(message: string): void;
		error(message: string): void;
	};

	/**
	 * Cross-plugin message bus (module-level: every plugin shares one bus,
	 * so plugins can talk to each other without knowing each other).
	 * `emit` fans out synchronously to all current subscribers of `event`;
	 * the `on` handle unsubscribes. Available in both trust tiers.
	 */
	bus: {
		on(event: string, cb: (payload?: unknown) => void): Unsubscribe;
		emit(event: string, payload?: unknown): void;
	};

	// — Subsystems filled in later phases. Declared so the SDK contract is
	//   complete; the V1.0 host throws "not wired" until the owning task lands.
	//   Mutable (not readonly) so the runtime can wire them post-construction. —

	/** Canvas + selection (V1.0 task 3/6). */
	canvas: CanvasHost;
	/** Node runtime: execute/cancel/progress (V1.0 task 5). */
	node: NodeHost;
	/** Trusted-tier escape hatches: fs/exec/ipc (V1.2+; omitted in safe-tier). */
	system: SystemHost;
	/** Workspace: read-only multi-project index + active-project change events. */
	workspace: WorkspaceHost;
	/** Provider extension point: register third-party compute (node-entry.cjs) + list configured providers/models for pickers. */
	provider: ProviderHost;
	/** Project state read/write (script doc, storyboard overrides, project assets, schema metadata). Trusted-only. */
	project: ProjectHost;
	/** Script-row read access + AI parse trigger. Trusted-only. */
	scripts: ScriptsHost;
	/** Storyboard KV state — frames, variants, slot order, plus shot-production backfill events. Trusted-only. */
	storyboard: StoryboardHost;
	/** Host-owned storyboard React components (ShotsPane / AssetsPane / BreakdownRail / providers). Trusted-only. */
	storyboardComponents: StoryboardComponentsHost;
	/** Agent extension point (V1.3). */
	agent: AgentHost;
	/** Workflow extension point (V1.3). */
	workflow: WorkflowHost;
	/** Template extension point - reusable authored artifacts (spec §4). */
	template: TemplateHost;
	/** History extension point - node gen history + canvas snapshots (spec §4). */
	history: HistoryHost;
	/** Asset extension point (V1.3). */
	assets: AssetHost;
	/**
	 * AI generation surface (V1.1). Exposes direct image/video/text generation
	 * and job enqueueing to trusted-tier plugins; mirrors the renderer-facing
	 * `tipc.ai.*` IPC but scoped to the plugin context. The Node Runtime wraps
	 * `enqueueJob` internally for schema-driven nodes; this surface lets a
	 * plugin trigger generation from commands, toolbar buttons, etc.
	 */
	/**
	 * Read-only host skills registry (the same skills the built-in picker
	 * lists) — lets a plugin offer its own skill picker and pass the chosen
	 * ids to `enqueueJob` (input.skills).
	 */
	skills: {
		list(): Promise<Array<{ id: string; name: string; description: string; modality: string }>>;
	};

	/**
	 * Style library (read-only) — the same preset catalog the built-in `style`
	 * node / style gallery read (`tipc.styles.list`). A plugin style node lists
	 * presets to let the user pick a style in place (the built-in opens the
	 * style gallery; a plugin renders its own picker from this list). Preset shape
	 * mirrors the host `StylePreset` (features/styles/types.ts).
	 */
	styles: {
		list(): Promise<
			Array<{
				id: string;
				name: string;
				nameEn?: string;
				description?: string;
				category: string;
				positivePrompt?: string;
				negativePrompt?: string;
				coverAssetUrl?: string;
				refAssetUrls?: string[];
				useCoverAsRef?: boolean;
				tags?: string[];
				isRecommended?: boolean;
				builtin?: boolean;
			}>
		>;
	};

	ai: AIHost;

	/**
	 * Video post-production surface (V1.4). Wraps `tipc.merge.*` (video_composite
	 * N→1 grid/concat) + `tipc.video.*` (single-clip trim/crop/audio_split,
	 * analyze, asset save). Both backends are engine-bypass sync jobs
	 * (`recordSyncJob` — the returned `jobId` is for the records panel, not for
	 * polling). Available in both trust tiers: video editing is purely a
	 * data-plane function (system ffmpeg + vision model), no BYOK keys or
	 * filesystem escape hatches.
	 */
	video: VideoHost;

	/**
	 * Gen subsystem (V1.4) — compositing / multi-ref image generation paths
	 * that don't fit the single-asset `ai.generateImage` shape. Wraps
	 * `tipc.gen.ngridImage` (N upstream image refs → 1 image via the
	 * image_gen multi-ref path). Available in both trust tiers: the route
	 * reads the same provider catalog as `ai.generateImage` and returns a
	 * jobId + assetUrl pair, no BYOK secrets to gate.
	 */
	gen: GenHost;

	/**
	 * Cloud object-storage extension point (V1.4). Mirrors `tipc.storage.*`
	 * IPC scoped to the plugin context — list configs (BYOK keys redacted),
	 * queue batches (paths extracted from `File` via `webUtils.getPathForFile`),
	 * subscribe to byte-level transfer events, and sign GET URLs for stored
	 * objects. Trusted-tier only: touching the user's BYOK secrets +
	 * filesystem paths is structurally equivalent to `system.fs`.
	 */
	cloudStorage: CloudStorageHost;

	/**
	 * Publish surface — the account center + platform publishing.
	 *
	 * Accounts live in `userData/publish-accounts.json` (metadata only); each
	 * account's login session lives in its own Chromium partition, so two
	 * accounts of the same platform never share cookies. `run` opens a visible
	 * window per target account, loads the platform's publish page, injects a
	 * DOM-automation adapter that fills the form, and submits it. Running means
	 * publishing — there is no fill-only mode.
	 *
	 * Trusted-tier only: this opens windows, drives platform logins, and ships
	 * the user's media to third-party sites.
	 */
	publish: {
		/** Registered adapters (no function bodies — display metadata only). */
		adapters(): Promise<
			Array<{
				key: string;
				platform: string;
				kind: "video" | "dynamic";
				homeUrl: string;
				hasLoginCheck: boolean;
			}>
		>;
		listAccounts(): Promise<
			Array<{
				id: string;
				platform: string;
				label: string;
				tags: string[];
				status: "logged_out" | "logged_in" | "unchecked";
				profile?: {
					username?: string;
					avatarUrl?: string;
					profileUrl?: string;
					accountId?: string;
				};
			}>
		>;
		addAccount(input: {
			platform: string;
			label: string;
			tags?: string[];
		}): Promise<{ id: string }>;
		updateAccount(input: { id: string; label?: string; tags?: string[] }): Promise<unknown>;
		removeAccount(id: string): Promise<{ success: boolean }>;
		/**
		 * Tags currently in use across accounts, with their resolved colors.
		 * `color` is the explicit annotation when set, otherwise a stable color
		 * derived from the tag name; `onColor` is the readable foreground for
		 * `color` (computed once, in the host) — render `color` as the pill
		 * background and `onColor` as its text. `description` (when annotated) is
		 * the human note about what the tag means — a tooltip, not a label.
		 */
		listTags(): Promise<
			Array<{ name: string; color: string; onColor: string; auto: boolean; description?: string }>
		>;
		/** Annotate one tag's color (`#rrggbb`). */
		setTagColor(name: string, color: string): Promise<unknown>;
		/** Annotate one tag's description; an empty string clears it. */
		setTagDescription(name: string, description: string): Promise<unknown>;
		/** Drop the annotation — back to the derived color. */
		clearTagColor(name: string): Promise<unknown>;
		/** Create (when `accountId` is absent) and open the platform's login window. */
		openLogin(input: {
			platform: string;
			label?: string;
			tags?: string[];
			accountId?: string;
		}): Promise<{ accountId: string }>;
		checkLogin(accountId: string): Promise<{ status: string; profile?: Record<string, unknown> }>;
		run(input: {
			nodeId?: string;
			targets: Array<{ accountId: string; adapterKey: string }>;
			data: Record<string, unknown>;
			adapters?: Record<
				string,
				{
					platform: string;
					kind: "video" | "dynamic";
					homeUrl: string;
					injectUrl: string;
					fnSource: string;
					loginCheckSource?: string;
					loginCheckUrl?: string;
				}
			>;
		}): Promise<{ jobId: string; result: Record<string, { ok: boolean; error?: string }> }>;
		/** Per-account progress events (hot stream — no replay for late subscribers). */
		subscribe(cb: (event: unknown) => void): Unsubscribe;
	};
}

/** Cloud-storage config (renderer-facing redacted shape, mirrors `tipc.storage.listConfigs`). */
export interface CloudStorageConfig {
	id: string;
	kind: string; // "tos" | "cos" | "oss" — kept open for forward-compat
	name: string;
	region: string;
	endpoint: string;
	bucket: string;
	cdnBase?: string;
	rootPrefix: string;
	mediaProcessing: boolean;
	/** Masked access key id, e.g. "AKLT****9c2f". */
	accessKeyIdMasked: string;
	hasSecret: boolean;
	enabled: boolean;
	isDefault: boolean;
	updatedAt: string;
}

/** Result of `cloudStorage.upload`. Mirrors `tipc.storage.upload` (EnqueueResult). */
export interface CloudUploadResult {
	batchId: string;
	uploads: Array<{ uploadId: string; name: string; key: string }>;
	/** Files that failed pre-flight (not absolute, symlink, non-regular, >5GB). */
	skipped: Array<{ path: string; message: string }>;
}

/** One transfer event from `cloudStorage.subscribeTransfers`. Mirrors `uploads.ts` TransferEvent. */
export type CloudTransferEvent =
	| { kind: "queued"; uploadId: string; batchId: string; name: string; key: string; total: number }
	| { kind: "progress"; uploadId: string; batchId: string; loaded: number; total: number }
	| { kind: "done"; uploadId: string; batchId: string; key: string; size: number; etag: string }
	| { kind: "error"; uploadId: string; batchId: string; message: string }
	| { kind: "cancelled"; uploadId: string; batchId: string }
	| { kind: "batch-done"; batchId: string; ok: number; failed: number };

/** Input for `cloudStorage.upload`. Host extracts absolute paths from `File`
 *  via Electron's `webUtils.getPathForFile` (the plugin renderer has no direct
 *  fs access — passing paths instead is also supported but unusual). */
export interface CloudStorageUploadInput {
	files: File[];
	configId?: string;
	prefix?: string;
}

/** Cloud object-storage extension point. Trusted-tier only. */
export interface CloudStorageHost {
	/** List configured cloud configs (secrets redacted). */
	listConfigs(): Promise<CloudStorageConfig[]>;
	/**
	 * Queue a batch of files for upload. Resolves as soon as the batch is
	 * queued; byte-level progress / done / error events arrive via
	 * `subscribeTransfers`. Files >5 GB are rejected pre-flight (mirrors
	 * the built-in `storage.upload` cap).
	 */
	upload(input: CloudStorageUploadInput): Promise<CloudUploadResult>;
	/** Subscribe to transfer events for the current window. */
	subscribeTransfers(cb: (event: CloudTransferEvent) => void): Unsubscribe;
	/** Sign a time-limited GET URL for a stored object key. */
	signGet(input: { configId: string; key: string }): Promise<{ url: string }>;
}

/**
 * Safe-tier PluginHost (V2). The runtime structurally omits the trusted-tier
 * escape hatches — `system` (fs/exec/openExternal), `provider` (third-party
 * compute + BYOK key registration), `workspace` (cross-canvas ipc), and
 * `cloudStorage` (BYOK cloud-storage keys + filesystem paths) — when the
 * plugin declares `manifest.trust: "safe"`. Plugins targeting safe-tier
 * should program against this interface (it is a structural subset of
 * `PluginHost`) so the compiler catches any attempt to touch the missing
 * surfaces. The runtime value is built by `createPluginHost(manifest, opts)`
 * and is typed as `PluginHost | SafePluginHost`.
 */
/**
 * Visual-only fields a safe-tier plugin may set on a node via
 * {@link SafeCanvasHost.setNodeVisual}. Anything outside this set — position,
 * size, type, data, edges, schema — requires trusted-tier `updateNode`. The
 * whitelist is a security boundary (per-spec safe-tier is read-only over the
 * graph) and matches the fields `InfiniteCanvasHost.tsx` already paints from
 * `node.<field>` without going through a special API.
 */
export type VisualNodeField = "color" | "label" | "icon" | "description";
export type VisualNodeFields = Partial<Record<VisualNodeField, string>>;

/**
 * Safe-tier CanvasHost. Omits every mutator that could escape the safe
 * perimeter (add/move/reshape/connect/reparent/schema) and replaces
 * `updateNode` with a narrow {@link setNodeVisual} that whitelists visual
 * fields. Reads, viewport fit/zoom, export, event subscription, and selection
 * all pass through.
 *
 * The runtime builds this wrapper from a real `CanvasHost` via the wire step
 * (`apps/desktop/src/plugins/host.ts` `wrapCanvasForSafeTier`) when
 * `manifest.trust: "safe"`. Plugins that target safe-tier should program
 * against this interface directly to get a compile-time error on any escape
 * hatch (structural narrowing — see `SafePluginHost`).
 */
export type SafeCanvasHost = Omit<
	CanvasHost,
	| "addNode"
	| "updateNode"
	| "deleteNode"
	| "addEdge"
	| "deleteEdge"
	| "setViewport"
	| "executeAutoLayout"
	| "runAtomic"
> & {
	/**
	 * Apply visual-only fields to a node. Throws on any field outside
	 * {@link VisualNodeField} (the rejected keys are listed in the error so
	 * the author can fix it). Empty fields is a no-op. Backed by the wired
	 * real impl's `updateNode` — only the field filter is added; rest is
	 * pass-through.
	 */
	setNodeVisual(nodeId: string, fields: VisualNodeFields): void;
};

export type SafePluginHost = Omit<
	PluginHost,
	"system" | "provider" | "workspace" | "cloudStorage"
> & {
	/** Canvas host (safe-tier variant — see {@link SafeCanvasHost}). */
	canvas: SafeCanvasHost;
};

/**
 * Canvas lifecycle event names — the string keys passed to
 * `app.canvas.on(event, cb)`. The runtime emits these **post-commit** by
 * diffing the previous vs current canvas state, so a change from ANY source
 * fires: plugin/agent ops, user drag/connect/drop, paste, duplicate,
 * undo/redo, and collab sync.
 *
 * Listener callbacks receive the affected entity:
 * - `node:created` → `(node)`
 * - `node:updated` → `({ id, before, after })` (any tracked field changed:
 *   pos/size/label/description/color/type/icon/layer/data; `before`/`after`
 *   are the previous and current node so listeners can compute the delta)
 * - `node:deleted` → `(nodeId)`
 * - `edge:created` → `(edge)`
 * - `edge:updated` → `({ id, before, after })` (any tracked field changed:
 *   source/target ports, label, color, style, animated, width; `before`/
 *   `after` are the previous and current edge so listeners can compute
 *   the delta)
 * - `edge:deleted` → `(edgeId)`
 * - `layer:created` → `(layer)`
 * - `layer:updated` → `({ id, before, after })` (name/visible/locked/color
 *   change; `before`/`after` are the previous and current layer)
 * - `layer:deleted` → `(layerId)`
 * - `viewport:changed` → `({ before, after })` (any pan/zoom change; `after`
 *   is the new `{x, y, zoom}`, `before` the previous viewport)
 * - `selection:changed` → `(nodeIds: string[])` (fires when the selected
 *   node id set changes, including to an empty selection)
 * - `graph:changed` → `({ nodes, edges })` (coarse catch-all, fires on any
 *   node/edge reference change)
 *
 * Caveats:
 * - Events fire only in the window that owns the canvas (CanvasStudio). Other
 *   windows (asset library, agent chat) never wire the canvas host slot.
 * - A listener that re-mutates the canvas (e.g. `app.canvas.addNode`) can
 *   cause a self-feedback loop — guard with your own state.
 * - A board/project switch emits mass `node:deleted` (old board) +
 *   `node:created` (new board); semantically correct but potentially noisy.
 */
export const CANVAS_EVENTS = {
	nodeCreated: "node:created",
	nodeUpdated: "node:updated",
	nodeDeleted: "node:deleted",
	edgeCreated: "edge:created",
	edgeUpdated: "edge:updated",
	edgeDeleted: "edge:deleted",
	layerCreated: "layer:created",
	layerUpdated: "layer:updated",
	layerDeleted: "layer:deleted",
	viewportChanged: "viewport:changed",
	selectionChanged: "selection:changed",
	graphChanged: "graph:changed",
} as const;

/** A known canvas event name (use `CANVAS_EVENTS` for the literal values). */
export type CanvasEventName = (typeof CANVAS_EVENTS)[keyof typeof CANVAS_EVENTS];

/**
 * A typed input port on a schema-driven node. `type` determines which widget
 * the host's SchemaNodeBody renders. Additional fields (`options`, `default`,
 * `min`/`max`/`step` for sliders) configure the widget. Unknown keys pass
 * through to custom bodies.
 */
export interface NodeInputPort {
	name: string;
	type: "text" | "textarea" | "select" | "number" | "boolean" | "color" | "slider";
	label?: string;
	multiline?: boolean;
	options?: Array<{ value: string; label?: string }>;
	default?: unknown;
	min?: number;
	max?: number;
	step?: number;
	[k: string]: unknown;
}

/**
 * A plugin-registered node definition. `type` is the unique node-type id;
 * `inputs`/`outputs` drive the auto-generated SchemaNodeBody form + connection
 * slots. `connectsTo` is a connection-rule hint. `defaultData` seeds new nodes'
 * `node.data`. `runtime` optionally binds this node to a Node Runtime.
 */
export interface PluginNodeDef {
	type: string;
	label: string;
	description?: string;
	icon?: string;
	color?: string;
	category?: string;
	size?: { width: number; height: number };
	inputs?: NodeInputPort[];
	outputs?: NodeInputPort[];
	connectsTo?: string[];
	defaultData?: Record<string, unknown>;
	runtime?: string;
}

/** The minimal node shape a custom body can rely on (structural — not the app's CanvasNode). */
export interface PluginNodeBodyNode {
	id: string;
	type: string;
	label: string;
	data?: Record<string, unknown>;
	[k: string]: unknown;
}

/** Props a custom node body receives (mirrors the renderer's NodeBodyProps). */
export interface PluginNodeBodyProps {
	node: PluginNodeBodyNode;
	selected: boolean;
	/** Patch the node — usually `data` fields. Custom bodies may ignore. */
	onUpdate?: (patch: Record<string, unknown>) => void;
	/**
	 * The full live node list. Provided so a plugin body that needs the canvas
	 * graph (e.g. `ngrid_image` collecting upstream refs via
	 * `resolveUpstreamRefs`) doesn't have to also wire `app.canvas.getNodes()`.
	 * Typed `unknown[]` to mirror the SDK convention — cast to your own
	 * `AnyNode[]` (see video-composite-node-demo). Optional for backward
	 * compat with bodies that read graph via `app.canvas.getNodes()` directly.
	 */
	nodes?: unknown[];
	/**
	 * The full live edge list. Same shape as `nodes` — `unknown[]`, cast at
	 * the call site. Provided to the body so the host doesn't keep two API
	 * surfaces in sync.
	 */
	edges?: unknown[];
}

/** A custom node body: a function component. Build JSX with `window.PolyCreator.React` (plugins cannot import react). */
export type PluginNodeBody = (props: PluginNodeBodyProps) => unknown;

/**
 * Context for a custom floating overlay (`CanvasHost.registerNodeOverlay`).
 * The plugin draws the entire selection overlay itself (positioning
 * itself with `viewport`/`canvasBox`), mirroring the host's own overlays.
 */
export interface PluginOverlayProps {
	node: PluginNodeBodyNode;
	selected: boolean;
	viewport?: { x: number; y: number; zoom: number };
	canvasBox?: { left: number; top: number; width: number; height: number };
	/** Patch the node (usually `data` fields). */
	onUpdate?: (patch: Record<string, unknown>) => void;
	/** Ask the host to dismiss the overlay. */
	onClose?: () => void;
}

/** A custom overlay component: plugin-drawn floating toolbar/prompt bar. */
export type PluginNodeOverlayComponent = (props: PluginOverlayProps) => unknown;

/**
 * Canvas host — node graph mutation + selection + node-def/body registration.
 * Backed by the live canvas store (set by CanvasStudio) + the node registries.
 */
export interface CanvasHost {
	getNodes(): unknown[];
	getEdges(): unknown[];
	/**
	 * Full layer list (`{id, name, visible, locked, color}` in SDK `unknown`
	 * shape). Mirrors `getNodes`/`getEdges` so the read surface is symmetric —
	 * plugins can enumerate layers (e.g. to build a layer-visibility panel)
	 * without going through the node selection.
	 */
	getLayers(): unknown[];
	getViewport(): unknown;
	/**
	 * One-line human-readable summary of the current canvas for grounding an
	 * agent's context (e.g. "node-1:process, node-2:image, edge node-1->node-2").
	 * Cheap; the agent loop surfaces this verbatim in its system prompt via
	 * `opts.canvasContext`. Pass it to `app.agent.invoke(id, prompt, {
	 * canvasContext: app.canvas.getContextSummary() })` so the model can
	 * reference real ids/types when proposing ops.
	 */
	getContextSummary(): string;
	setViewport(vp: unknown): void;
	/**
	 * Zoom + pan the viewport so every node on the canvas is visible. Centres
	 * the bounding box of all nodes. `opts.zoom` overrides the default 1
	 * (the host picks a target that fits the box; the value is used as the
	 * lower bound when the box is smaller than that size). The exact
	 * on-screen centering depends on the container size, which the plugin
	 * cannot observe — for a "centre on the screen" feel, call `setViewport`
	 * yourself with a measured container.
	 */
	fitView(opts?: { zoom?: number }): void;
	/**
	 * Centre the viewport on a specific node. The host sets a viewport whose
	 * target lies on the node's center; the on-screen pixel position is
	 * container-dependent.
	 */
	zoomTo(nodeId: string, opts?: { zoom?: number }): void;
	/**
	 * Like `zoomTo` but targets the current node selection. No-op when the
	 * selection is empty. The selection is the same one `selection.getNodes()`
	 * exposes — read it first if you need to know what's centred on.
	 */
	zoomToSelection(opts?: { zoom?: number }): void;
	/**
	 * Single-node lookup. Returns the node (in its SDK `unknown` shape) or
	 * `undefined` if no node has that id. Equivalent to filtering
	 * `getNodes()` but avoids a full-array allocation on every probe.
	 */
	getNodeById(id: string): unknown;
	/** Single-edge lookup; same contract as `getNodeById`. */
	getEdgeById(id: string): unknown;
	/**
	 * Axis-aligned bounding box of all current nodes, in canvas-space. Returns
	 * `null` for an empty canvas. Useful for plugins that lay things out
	 * around the existing content. Format: `{ minX, minY, maxX, maxY }`.
	 */
	getCanvasBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
	/**
	 * Filter canvas nodes by a predicate. Convenience over `getNodes().filter(...)`
	 * for the common case of "find the node with id X" / "find all selected
	 * nodes of type Y" / etc. Returns node objects in the SDK `unknown` shape.
	 */
	findNodes(predicate: (node: unknown) => boolean): unknown[];
	/**
	 * Edges connected to a node, split by direction.
	 * `outgoing` = edges where this node is the `sourceId`; `incoming` =
	 * edges where this node is the `targetId`. Returns `{outgoing, incoming}`
	 * so the caller can pick a direction without scanning twice.
	 */
	getConnectedEdges(nodeId: string): { outgoing: unknown[]; incoming: unknown[] };
	/**
	 * Directed BFS path through edges. Returns the array of node ids from
	 * `fromNodeId` to `toNodeId` (inclusive), or `null` if no path exists.
	 * Self-paths (`from === to`) return `[from]`. Unreachable endpoints or
	 * missing nodes return `null`. The path follows the directed
	 * `sourceId → targetId` semantics of edges.
	 */
	findPath(fromNodeId: string, toNodeId: string): string[] | null;
	/**
	 * Topmost node whose box contains the canvas-space point, or `null` if
	 * none. "Topmost" = last-in-array (the canvas paints in array order).
	 * Pass `exclude` to skip nodes the gesture shouldn't target — e.g. when
	 * dropping a style, exclude other style nodes.
	 */
	findNodesAtPoint(
		canvasX: number,
		canvasY: number,
		exclude?: (node: unknown) => boolean,
	): unknown | null;
	/**
	 * Rasterize the current canvas content (all visible nodes + edges) to a
	 * PNG data URL (`data:image/png;base64,...`). Resolves to `null` for an
	 * empty canvas. `opts.scale` multiplies output resolution (default 1).
	 * Renders from the canvas data model (not the live DOM), so it captures
	 * node boxes + labels, not per-node React bodies.
	 */
	exportViewportAsPng(opts?: { scale?: number }): Promise<string | null>;
	/**
	 * Serialise the current canvas (nodes + edges + layers + version +
	 * timestamp) to a JSON string. Unlike the canvas-studio `exportToJson`
	 * this returns the string directly — the plugin decides what to do
	 * (send it, store it, copy to clipboard, etc.). Format matches
	 * `CanvasProjectExport` (`{version, timestamp, nodes, edges, layers}`),
	 * so the result can be round-tripped through `importFromJson`.
	 */
	exportProject(): string;
	/**
	 * Convert screen-space coords (e.g. `e.clientX`, `e.clientY`) to
	 * canvas-space. Returns `null` if the canvas container isn't mounted.
	 * Useful for positioning DOM overlays at canvas points, or for hit-testing
	 * a click against node positions returned by `getNodes()`.
	 */
	screenToCanvas(screenX: number, screenY: number): { x: number; y: number } | null;
	/**
	 * Inverse of `screenToCanvas`. Convert canvas-space to screen-space
	 * (clientX/clientY). Returns `null` if the container isn't mounted.
	 */
	canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } | null;
	addNode(node: unknown): unknown;
	updateNode(id: string, patch: unknown): void;
	deleteNode(id: string): void;
	addEdge(edge: unknown): unknown;
	deleteEdge(id: string): void;
	executeAutoLayout(type?: "grid" | "tree" | "circular"): void;

	/**
	 * Register a node type. Accepts a Plane-1 `PluginNodeDef` (palette +
	 * connectsTo + defaultData) or a v2 `NodeDefinition` that additionally
	 * carries `ui` (Default/Hybrid/Custom) + runtime (see ./node-v2).
	 */
	registerNodeDef(def: NodeDefinition): void;
	/** Register a custom React body for a node type (overrides SchemaNodeBody). */
	registerNodeBody(type: string, component: PluginNodeBody): void;
	/**
	 * Register a custom floating overlay (select-time toolbar + prompt bar) for a
	 * node type. When present it takes priority over both the plugin toolbar/
	 * prompt bar (registerNodeUI) and the built-in NodeInteractionOverlay; the
	 * plugin draws the whole overlay and positions it with viewport/canvasBox.
	 */
	registerNodeOverlay(type: string, component: PluginNodeOverlayComponent): void;

	/** Selection context — powers agent "act on selected node" loops. */
	selection: {
		getNodes(): unknown[];
		getLayers(): unknown[];
		onChange(cb: (nodeIds: string[]) => void): Unsubscribe;
	};
	/** Programmatic selection control. */
	selectNodes(nodeIds: string[]): void;
	clearSelection(): void;
	/**
	 * Undo the last user mutation on the active canvas (fire-and-forget).
	 * Triggers the canvas host's useCanvasHistory undo. No-op when the
	 * history is empty. Plugins that want to know whether undo is possible
	 * should observe `selection.onChange` + their own action log; there is
	 * no `canUndo` on the host (the value lives in component state).
	 */
	undo(): void;
	/**
	 * Redo a previously-undone mutation (fire-and-forget). No-op when the
	 * redo stack is empty.
	 */
	redo(): void;
	/**
	 * Whether the canvas history has an entry to undo. Read at call time
	 * (live value updated whenever the host pushes/undoes/redoes).
	 */
	canUndo(): boolean;
	/**
	 * Whether the canvas history has an entry to redo. Read at call time.
	 */
	canRedo(): boolean;
	/**
	 * Subscribe to history-state changes (any push/undo/redo). Returns an
	 * Unsubscribe. Use to keep a plugin-local UI in sync with canUndo/canRedo.
	 */
	onHistoryChange(cb: () => void): Unsubscribe;
	/**
	 * Freeze the canvas event bus. Between `freezeEvents()` and
	 * `resumeEvents()` the per-entity events (node:*, edge:*, layer:*,
	 * viewport:changed) are suppressed; `graph:changed` still fires on the
	 * next commit after resume, so subscribers can refresh. Use for batch
	 * mutations (macro instantiate, generated scene graph) to avoid N fires.
	 */
	freezeEvents(): void;
	resumeEvents(): void;
	/**
	 * Run `fn` as ONE atomic undo unit: every canvas mutation inside the
	 * callback collapses into a single history entry, so one `undo()` reverts
	 * the whole batch (macro instantiate, generated scene graph, agent
	 * proposal). The host batches mutations internally — plugins call this
	 * instead of manual `freezeEvents`/`resumeEvents` + history juggling.
	 * Combine with `freezeEvents` if you also want the per-entity events
	 * suppressed during the batch (the host still emits `graph:changed`).
	 */
	runAtomic(fn: () => void): void;

	/**
	 * Subscribe to a canvas lifecycle event. `event` is a `CANVAS_EVENTS` value
	 * (see its JSDoc for the per-event payload + caveats). Returns an
	 * unsubscribe handle.
	 */
	on(event: CanvasEventName | string, cb: (...args: unknown[]) => void): Unsubscribe;

	/**
	 * Validate + apply a batch of canvas operations in one atomic step. Thin
	 * wrapper around the host's `tipc.canvas.planOps` validation +
	 * `runAtomic` execution: every op passes through the same `planOps` the
	 * agent loop's `apply_ops` tool uses, so unknown-node / self-loop /
	 * empty-label / cycle / reparent errors surface here too with the same
	 * messages. On success returns the resolved ops (with `tempId` →
	 * concrete-id mappings applied) — the same `ResolvedOp[]` shape the agent
	 * loop returns from `app.agent.invoke`. On validation failure throws
	 * with the formatted error list; nothing is applied.
	 *
	 * The whole batch collapses into ONE history entry (single undo), emits
	 * canvas events per-op, and respects the freezeEvents gate.
	 *
	 * `unknown[]` is deliberate: the op shape is the host's canvas model
	 * (`CanvasOp`), whose canonical definition lives in the application, and
	 * this SDK mirrors it structurally to stay self-contained.
	 */
	applyOps(ops: unknown[]): Promise<unknown[]>;

	/**
	 * Apply visual-only fields to a node (safe-tier-safe). This is the only
	 * mutator exposed to {@link SafeCanvasHost} — every other write surface
	 * (`addNode`, `updateNode`, `deleteNode`, edges, viewport, layout, ops)
	 * is omitted from the safe-tier variant of this interface, so a safe
	 * plugin that needs to recolor a selection uses this and nothing else.
	 *
	 * For trusted-tier this is a convenience wrapper around the same impl
	 * `updateNode` uses; the field filter is enforced by the safe-tier
	 * wrapper (`wrapCanvasForSafeTier`) when `manifest.trust: "safe"`, not by
	 * the bridge — trusted plugins pass any shape and the host paints it.
	 * Empty `fields` is a no-op (the wrapper returns early before touching
	 * the canvas store, so callers can build up a patch unconditionally).
	 *
	 * Throws on any field outside {@link VisualNodeField} when called via
	 * the safe-tier wrapper. Throws on unknown node id (delegated to the
	 * underlying `updateNode`, same as that method).
	 */
	setNodeVisual(nodeId: string, fields: VisualNodeFields): void;
}

/** Node runtime — decoupled execution owner over the jobs engine (V1.0 task 5). */
export interface NodeHost {
	runtime: {
		execute(node: unknown): Promise<string>;
		cancel(jobId: string): Promise<void>;
		getProgress(jobId: string): unknown;
		on(
			jobId: string,
			event: "progress" | "done" | "error",
			cb: (...args: unknown[]) => void,
		): Unsubscribe;
		/**
		 * List all registered node types (built-in + plugin) with their runtime
		 * bindings. Useful for a plugin to discover what node types exist + which
		 * runtime (if any) they bind to, before calling `execute`.
		 */
		list(): Array<{ type: string; runtime?: string }>;
		/**
		 * Register a new node type (id + schema + metadata). Delegates to the
		 * canvas node-defs registry — this lives under `node.runtime` because
		 * the type binds to a runtime (`def.runtime`) and shows up in `list()`.
		 * Equivalent to `app.canvas.registerNodeDef`. Accepts a v2
		 * `NodeDefinition` (with `ui` / runtime) as well.
		 */
		register(def: NodeDefinition): void;
	};
}

/** App/runtime info returned by `app.system.getInfo`. */
export interface AppSystemInfo {
	version: string;
	platform: string;
	electron: string;
}

/** Trusted-tier escape hatches. Omitted entirely in the V2 safe-tier host. */
export interface SystemHost {
	fs: {
		read(path: string): Promise<string>;
		write(path: string, data: string): Promise<void>;
		list(dir: string): Promise<string[]>;
	};
	exec(nodeModule: string, ...args: unknown[]): Promise<unknown>;
	/** Open a URL in the user's default browser (trusted only). */
	openExternal(url: string): Promise<void>;
	/** App + runtime version/platform info. */
	getInfo(): Promise<AppSystemInfo>;
}

/** A project reference surfaced by `app.workspace`. */
export interface ProjectRef {
	id: string;
	name: string;
	/** Active canvas id within the project, if any. */
	canvasId?: string;
}

/**
 * Workspace extension point - read-only access to the multi-project/canvas
 * index. `on("project:change")` fires when the active project/canvas changes
 * (the same `canvas:activeChanged` broadcast the project switcher listens to).
 * Allowed in safe-tier (read-only listing).
 */
export interface WorkspaceHost {
	getActiveProject(): Promise<ProjectRef>;
	listProjects(): Promise<ProjectRef[]>;
	on(event: "project:change", cb: (ref: ProjectRef) => void): Unsubscribe;
}

/**
 * Script-row read access. Backed by `tipc.scripts.*` procs. Trusted-only —
 * scripts are app-owned, not user-owned; safe-tier plugins get nothing here.
 */
export interface ScriptsHost {
	/** Get a single script row by id. Returns null if missing. */
	get(input: { id: string }): Promise<unknown | null>;
	/** Latest script for a project (single-project: projectId accepted but ignored). */
	latestForProject(input: { projectId: string }): Promise<unknown | null>;
	/** All scripts for a project, oldest-first. */
	listForProject(input: { projectId: string }): Promise<unknown[] | null>;
	/**
	 * Trigger an AI parse of raw script text. Returns the persisted script row
	 * (id + result). `unknown` is deliberate: the schema the model fills
	 * (`ScriptParseResult`) is defined by the host, and the renderer formats it
	 * as it sees fit.
	 */
	parse(input: {
		projectId: string;
		rawText: string;
		schemaId?: string;
		modelId?: string;
	}): Promise<{ id: string; result: unknown }>;
}

/**
 * Per-scene storyboard override CRUD. Backed by `tipc.project.getShots` /
 * `setShots`. Trusted-only.
 */
export interface ProjectShotsHost {
	get(input: { projectId: string }): Promise<Record<string, unknown>>;
	set(input: { projectId: string; sceneId: string; shots: unknown }): Promise<unknown>;
}

/**
 * Project asset (project assets) CRUD. Backed by `tipc.project.getAssets` /
 * `setAsset` / `setAssets` / `removeAsset`. Trusted-only — assets are
 * project-owned state.
 */
export interface ProjectAssetsHost {
	get(input: { projectId: string }): Promise<Record<string, unknown> | null>;
	set(input: { projectId: string; id: string; entity: unknown }): Promise<unknown>;
	setMany(input: { projectId: string; map: Record<string, unknown> }): Promise<unknown>;
	remove(input: { projectId: string; id: string }): Promise<unknown>;
}

/**
 * Per-scene schema + routing metadata. Backed by `tipc.project.*` schema
 * procs. Trusted-only.
 */
export interface ProjectMetadataHost {
	getCharacterColors(input: { projectId: string }): Promise<Record<string, string>>;
	setCharacterColor(input: { projectId: string; name: string; color: string }): Promise<void>;
	getParserSchema(input: { projectId: string }): Promise<unknown>;
	setParserSchema(input: { projectId: string; schema: unknown }): Promise<void>;
	getScenePromptTags(input: { projectId: string }): Promise<Record<string, unknown>>;
	setScenePromptTags(input: { projectId: string; tags: Record<string, unknown> }): Promise<void>;
	getSceneFieldRoutes(input: { projectId: string }): Promise<Record<string, unknown>>;
	setSceneFieldRoutes(input: { projectId: string; routes: Record<string, unknown> }): Promise<void>;
	saveScriptDoc(input: { projectId: string; blocks: unknown }): Promise<void>;
}

/**
 * Per-scene AI re-storyboard + shot-prompt regeneration. Backed by
 * `tipc.project.resegmentSceneShots` / `regenerateShotPrompt`. Trusted-only.
 */
export interface ProjectAIHost {
	resegmentSceneShots(input: {
		projectId: string;
		sceneId: string;
		body: string;
	}): Promise<{ shots: unknown }>;
	regenerateShotPrompt(input: {
		projectId: string;
		shotId: string;
	}): Promise<{ promptEn: string; promptZh: string }>;
}

/**
 * Project state read/write (script doc, storyboard overrides, project assets,
 * per-scene schema metadata). Backed by `tipc.project.*` procs.
 * Trusted-only — full project state is not safe for third-party plugins.
 */
export interface ProjectHost {
	shots: ProjectShotsHost;
	assets: ProjectAssetsHost;
	metadata: ProjectMetadataHost;
	ai: ProjectAIHost;
}

/**
 * Storyboard KV state — frames, variants, slot order, plus the
 * shot-production backfill watcher events. Backed by
 * `tipc.project.getStoryboardFrames` / `setStoryboardFrame` /
 * `setStoryboardFrames` / `getStoryboardVariants` /
 * `addStoryboardVariants` / `removeStoryboardVariant` /
 * `reorderStoryboardSlots` and `tipc.jobs.listShotImages` /
 * `listShotVideos`. Trusted-only.
 */
export interface StoryboardHost {
	// ── frames (one URL per shot × slot) ─────────────────────────────
	getFrames(input: { projectId: string }): Promise<Record<string, unknown>>;
	setFrame(input: {
		projectId: string;
		key: string;
		value: unknown;
	}): Promise<Record<string, unknown>>;
	setFrames(input: {
		projectId: string;
		frames: Record<string, unknown>;
	}): Promise<Record<string, unknown>>;
	// ── variants (per-shot slot variants) ───────────────────────────
	getVariants(input: { projectId: string }): Promise<Record<string, unknown>>;
	addVariants(input: {
		projectId: string;
		key: string;
		values: unknown[];
	}): Promise<Record<string, unknown>>;
	removeVariant(input: {
		projectId: string;
		key: string;
		idx: number;
	}): Promise<Record<string, unknown>>;
	reorderSlots(input: {
		projectId: string;
		key: string;
		slots: string[];
	}): Promise<Record<string, unknown>>;
	// ── backfill watchers ───────────────────────────────────────────
	listShotImages(input: { projectId: string; since?: number }): Promise<unknown[]>;
	listShotVideos(input: { projectId: string; since?: number }): Promise<unknown[]>;
	/** Subscribe to shot-produced events. The `event` param is `"shot:produced"`. */
	on(
		event: "shot:produced",
		cb: (payload: {
			shotId: string;
			kind: "image" | "video";
			assetUrl: string;
			createdAt: number;
		}) => void,
	): Unsubscribe;
}

/** Canonical names of the host-owned React components exposed to plugins via
    `app.storyboardComponents.resolve(name)`. Components include the 3
    feature panes (ShotsPane / AssetsPane / BreakdownRail), the canvas-level
    shot-production provider, and its hook. The full type-narrow contract is
    `unknown` on purpose — plugin authors cast at the call site, narrowing
    against the real component's prop interface. */
export type StoryboardComponentName =
	| "ShotsPane"
	| "AssetsPane"
	| "BreakdownRail"
	| "CanvasShotProductionProvider"
	| "useCanvasShotProduction";

/** Lookup for the host-owned storyboard components. Same pattern as
    `app.ui.component(name)` for shadcn primitives, but for the heavier
    storyboard panes. Resolves by name; throws on unknown names so plugin
    typos surface loudly rather than rendering `undefined`. */
export interface StoryboardComponentsHost {
	resolve(name: StoryboardComponentName): unknown;
	list(): readonly StoryboardComponentName[];
}

/** Optional one-shot setup payload for `ensureConfigured()`. Declares the
 *  vendor `type`, a stable row id, display name, default models to seed, and
 *  an optional API key. Used by example / demo plugins to give a user a
 *  one-click setup — install + open node = working picker, no Settings round
 *  trip. Any field the user later edits in Settings is preserved (the row is
 *  only created if missing); it's an idempotent provisioner, not an
 *  overwrite. */
export interface EnsureProviderInput {
	id: string;
	type: string;
	name?: string;
	apiKey?: string;
	models?: Array<{ id: string; name?: string; caps?: string[] }>;
}

/**
 * Provider extension point (V1.2). `register` loads the plugin's
 * `node-entry.cjs` in the main process and wires its provider/job backends
 * into the catalog + engine (full-trust: third-party Node code in main).
 * `list`/`listModels`/`findByType` surface configured (BYOK) providers for
 * the in-node model picker.
 */
export interface ProviderHost {
	/** Register this plugin's node-entry.cjs (manifest.nodeEntry) in main. */
	register(): Promise<void>;
	/** Configured providers (BYOK rows; redacted - no raw keys).
	 *  Plugin-contributed rows (registered via `node-entry.cjs`) are NOT here
	 *  — they live in a separate in-memory registry surfaced through
	 *  `findByType`. */
	list(): Promise<unknown[]>;
	/** A provider's published models ({id,name?,caps}[]). */
	listModels(providerId: string): Promise<unknown[]>;
	/** Unified lookup by vendor `type` across the user-stored providers AND
	 *  plugin contributions. `null` when neither side knows the type. */
	findByType(type: string): Promise<unknown>;
	/** Idempotent provisioner: if a row matching `input.type` doesn't yet
	 *  exist in `providers.json`, create it with the given defaults and
	 *  broadcast `providers:changed`; otherwise do nothing (user config
	 *  wins). Returns `{ created, id }`. */
	ensureConfigured(input: EnsureProviderInput): Promise<{ created: boolean; id: string }>;
}

/** A tool a plugin agent can invoke (name + description; optional JSON-schema
 *  parameters + handler for the V1.3-B tool loop). When `handler` is present,
 *  `app.agent.invoke` can execute a real tool loop (model emits tool_call ->
 *  host runs handler -> result fed back); without a handler the tool is
 *  context-only (the model knows about it but the host does not call it). */
export interface AgentTool {
	name: string;
	description?: string;
	/**
	 * Parameter schema forwarded to the model as a native tool declaration
	 * (JSON-Schema). Was opaque `Record<string, unknown>` in the text-parsed
	 * era; now typed so plugin authors declare real schemas the model is
	 * trained on. Structurally compatible with the old shape.
	 */
	parameters?: JSONSchema;
	/** Handler invoked when the model emits a tool_call for this tool. */
	handler?: (args: unknown) => Promise<string> | string;
}

/** A plugin-registered agent (named behavioral agent with tools/skills). */
export interface AgentDef {
	id: string;
	name: string;
	description?: string;
	systemPrompt?: string;
	tools?: AgentTool[];
	skills?: string[];
}

/** Agent extension point (V1.3). Register named agents with tools/skills. */
export interface AgentHost {
	/** Register a plugin agent definition. */
	register(agent: AgentDef): void;
	/** List all plugin agents registered in this window. */
	list(): AgentDef[];
	/**
	 * Run a native tool-calling loop for the agent: sends the prompt + the
	 * agent's tools (+ a built-in `apply_ops` tool) to the model, dispatches
	 * tool calls, and returns the validated canvas ops. `opts.canvasContext`
	 * grounds the model in current node ids/types; `opts.maxIterations` bounds
	 * the loop (default 5).
	 */
	invoke(
		agentId: string,
		prompt: string,
		opts?: { canvasContext?: string; maxIterations?: number; providerId?: string; model?: string },
	): Promise<unknown[]>;
}

/** A node entry in a workflow template (becomes a canvas node on instantiate). */
export interface WorkflowNodeTemplate {
	type: string;
	data?: Record<string, unknown>;
	x?: number;
	y?: number;
	label?: string;
	width?: number;
	height?: number;
	color?: string;
	icon?: string;
}

/** An edge between two template nodes (uses canvas-edge sourceId/targetId). */
export interface WorkflowEdgeTemplate {
	sourceId: string;
	targetId: string;
}

/** A workflow template = a board skeleton the runner instantiates + orchestrates. */
export interface WorkflowTemplate {
	nodes: WorkflowNodeTemplate[];
	edges?: WorkflowEdgeTemplate[];
	/**
	 * Optional per-step metadata. A step references a template node by index
	 * (`nodeIndex`, 0-based into `nodes`). An agent-decision step
	 * (`{ agent: { id, decide } }`) makes the runner query the named agent
	 * before executing the node - the agent returns canvas ops which the
	 * runner auto-applies (the agent's ops are planOps-validated inside
	 * `agent.invoke`), then proceeds to execute the node.
	 *
	 * Omit `steps` to keep the V1.3 sequential-only behavior.
	 */
	steps?: WorkflowStep[];
}

export interface WorkflowStep {
	nodeIndex: number;
	agent?: {
		/** Registered agent id (`app.agent.register`). */
		id: string;
		/** Decide-prompt handed to the agent. The agent's returned ops are
		 *  auto-applied (validated) before the step's node runs. */
		decide: string;
	};
}

/** Step event emitted by the default runner via `run(id, { onStep })`. */
export interface WorkflowStepEvent {
	nodeId: string;
	jobId: string;
	status: "started" | "done" | "error";
	error?: string;
}

/** Workflow extension point (V1.3). */
export interface WorkflowHost {
	/** Register a workflow (template stored; runner available). */
	register(workflow: { id: string; name?: string; template: WorkflowTemplate }): void;
	/** Copy the template's nodes + edges onto the live canvas. Returns created nodes. */
	instantiate(id: string): unknown[];
	/** Instantiate + execute each node sequentially via the Node Runtime.
	 * `onStep` fires on started/done/error per step (errors don't break the loop). */
	run(id: string, opts?: { onStep?: (e: WorkflowStepEvent) => void }): Promise<void>;
}

/** Kinds of reusable authored artifacts a plugin can contribute as templates. */
export type TemplateKind = "drama" | "character" | "shot" | "prompt" | "workflow";

/**
 * A reusable authored artifact (spec §4 Template). `spec` is opaque to the
 * host - the plugin owns its shape; the host stores + lists it. `workflow`-kind
 * templates are special: `instantiate` delegates to the Workflow host (drops
 * the embedded workflow template's nodes/edges onto the canvas). Deeper
 * feeding of drama/character/shot/prompt kinds into the parser/prompt pipeline
 * is V2; V1 stores + lists them so a UI can surface them.
 */
export interface TemplateDef {
	id: string;
	kind: TemplateKind;
	name?: string;
	/** Opaque payload. For `kind:"workflow"`, `{ template: WorkflowTemplate }`. */
	spec: Record<string, unknown>;
}

/** Template extension point (spec §4). */
export interface TemplateHost {
	/** Register a reusable template. */
	register(t: TemplateDef): void;
	/** List templates, optionally filtered by kind. */
	list(kind?: TemplateKind): TemplateDef[];
	/**
	 * Materialize a template. For `kind:"workflow"`, delegates to the Workflow
	 * host's `instantiate` (drops nodes/edges onto the canvas). Other kinds
	 * return their stored `spec` (the caller decides what to do with it).
	 */
	instantiate(id: string): unknown;
}

/** A generation record (one job run for a node), surfaced by `app.history`. */
export interface GenRecord {
	jobId: string;
	status: string;
	type?: string;
	createdAt?: number;
	error?: string;
}

/** A canvas version snapshot, surfaced by `app.history`. */
export interface CanvasSnapshot {
	id: string;
	label: string;
	createdAt: number;
	nodeCount: number;
}

/**
 * History extension point (spec §4). Per-node generation history (near-zero
 * cost - wraps the existing job store) + canvas version snapshots
 * (greenfield JSON-file backend in `userData/canvas-snapshots/`).
 */
export interface HistoryHost {
	/** Generation history for a node (its past jobs). */
	nodeGenerations(nodeId: string): Promise<GenRecord[]>;
	/** List saved canvas snapshots (newest first), without the board payload. */
	listSnapshots(): Promise<CanvasSnapshot[]>;
	/** Snapshot the current canvas under `label`. Returns the snapshot id. */
	snapshotCanvas(label: string): Promise<string>;
	/** Restore a canvas snapshot by id (overwrites the current board). */
	restore(snapshotId: string): Promise<void>;
}

/** A plugin-registered asset type (shown in the asset library / picker). */
export interface AssetTypeDef {
	type: string;
	name: string;
	icon?: string;
	description?: string;
}

/** A plugin-provided entity — opaque to main; the plugin owns its shape. */
export interface AssetEntity {
	id: string;
	type: string;
	name?: string;
	[K: string]: unknown;
}

/** Sync entity provider — returns entities for a type. Async variant deferred. */
export type EntityProvider = () => AssetEntity[];

/** Asset extension point (V1.3). Register asset types + entity providers. */
/** Input for `AssetHost.uploadFile` — raw bytes + MIME (mirrors the host's upload endpoint). */
export interface PluginAssetUploadInput {
	bytes: Uint8Array;
	mimeType: string;
	name?: string;
}

export interface AssetHost {
	/** Register a new asset type (shown in the asset library UI). */
	registerType(def: AssetTypeDef): void;
	/** List all plugin-registered asset types. */
	listTypes(): AssetTypeDef[];
	/**
	 * Register an entity provider for a given type. The provider is called
	 * by the asset library / project asset flow to enumerate entities.
	 * (Main-side `tipc.project` integration that collects from providers
	 * across all plugins is future work — for now `listEntityProviders` is
	 * the renderer-side accessor.)
	 */
	registerEntityProvider(type: string, provide: EntityProvider): void;
	/**
	 * Upload bytes as a new polycreator asset. Returns the stable fileId + a
	 * `polycreator-asset://` URL — enough to store into `node.data.primaryUrl` /
	 * `fileIds` and render immediately. Only trusted-tier (trusted) callers.
	 */
	uploadFile(input: PluginAssetUploadInput): Promise<{ fileId: string; assetUrl: string }>;

	/** List registered entity providers (type + provider handle). */
	listEntityProviders(): Array<{ type: string; provide: EntityProvider }>;
	/**
	 * Collect entities from a specific type's provider(s). Returns [] if no
	 * provider registered. Catch per-provider errors so one bad provider
	 * doesn't take down the asset library.
	 */
	collectEntities(type: string): AssetEntity[];
}

/** Input for AI image generation via the plugin host. */
export interface AIGenerateImageInput {
	prompt: string;
	providerId?: string;
	model?: string;
	nodeId?: string;
	negativePrompt?: string;
	refAssetUrls?: string[];
	ratio?: string;
}

/** Input for AI text generation via the plugin host. */
export interface AIGenerateTextInput {
	/** Required when `messages` is absent (single-turn); optional in multi-turn. */
	prompt?: string;
	providerId?: string;
	model?: string;
	system?: string;
	temperature?: number;
	maxOutputTokens?: number;
	/** Multi-turn chat history (native tool-calling). */
	messages?: Message[];
	/** Tool declarations to offer the model. */
	tools?: ToolDeclaration[];
	/** Default `"auto"` when `tools` present. `{ name }` forces one tool. */
	toolChoice?: "auto" | "none" | { name: string };
	/**
	 * Skill registry selections to assemble into the prompt + route options.
	 * Mirrors the built-in `tipc.ai.generateText`'s `options.skills` payload
	 * (NodeInteractionOverlay.tsx:864). Without this spread the picker is
	 * decorative on plugin nodes.
	 */
	options?: {
		skills?: string[];
		skillOptions?: Record<string, Record<string, unknown>>;
	};
	/**
	 * Ask the vendor to skip the model's extended-thinking block. Built-in
	 * callers always pass `reasoning: "off"` on text nodes (NodeInteractionOverlay.tsx:867)
	 * so generated text lands as plain prose, not as a `<think>` chunk.
	 */
	reasoning?: "off" | "low" | "medium" | "high";
}

/** Generic job enqueue input (maps to the async job engine). */
export interface AIJobInput {
	type: string;
	input: Record<string, unknown>;
	nodeId?: string;
}

/** Input for AI video generation (async — returns a job id, poll via `on`). */
export interface AIGenerateVideoInput {
	prompt: string;
	providerId?: string;
	model?: string;
	nodeId?: string;
	/** Generation mode. t2v = text-to-video; i2v = image-to-video (needs imageAssetUrl). */
	mode?: "t2v" | "i2v" | "flf" | "mref";
	/** First-frame image for i2v (polycreator-asset:// or data: URL). */
	imageAssetUrl?: string;
	/** Last-frame image for first-last-frame (flf) mode. */
	lastImageAssetUrl?: string;
	/** Additional reference asset URLs (mref mode). */
	refAssetUrls?: string[];
	durationSec?: number;
	ratio?: string;
	/** Whether to generate audio alongside the video. */
	audio?: boolean;
	shotId?: string;
}

/** Input for AI audio/music generation (async — returns a job id). */
export interface AIGenerateAudioInput {
	prompt: string;
	providerId?: string;
	model?: string;
	nodeId?: string;
	voice?: string;
	durationSec?: number;
	ratio?: string;
}

/**
 * What the job engine writes into `job.result` when a generation completes —
 * the parallel `fileIds[]` / `assetUrls[]` arrays (plus the denormalized
 * `assetUrl = assetUrls[0]`), shared by every modality. Mirrors the renderer's
 * `GenJobResult` (useGenJob.ts) so a plugin body can render the same way.
 */
export interface AIGenJobResult {
	fileIds?: string[];
	assetUrls?: string[];
	/** Denormalized `assetUrls[0]` — the legacy single-asset field. */
	assetUrl?: string;
	/** Resolved model id from the provider — used to attribute the result. */
	modelId?: string;
	providerId?: string;
}

/** A job record as read by `AIHost.getJob` — status + progress + result. */
export interface AIGenJob {
	jobId: string;
	status: "queued" | "active" | "completed" | "failed" | "unknown";
	progress?: number;
	error?: string;
	result?: AIGenJobResult;
}

/** AI generation and job surface for trusted-tier plugins. */
export interface AIHost {
	/** Synchronously generate an image and return its stored asset info. */
	generateImage(
		input: AIGenerateImageInput,
	): Promise<{ path: string; assetUrl: string; jobId: string }>;
	/** Generate text and return the output string (+ any native tool calls). */
	generateText(input: AIGenerateTextInput): Promise<{
		text: string;
		model: string;
		toolCalls?: ToolCall[];
		stopReason?: TextResult["stopReason"];
	}>;
	/**
	 * Enqueue a video-generation job. Returns the job id — subscribe to
	 * `on(jobId, "done"|"error", cb)` for the result. The job engine handles
	 * submit→poll→fetchResult internally.
	 */
	generateVideo(input: AIGenerateVideoInput): Promise<string>;
	/**
	 * Enqueue an audio/music-generation job. Returns the job id — subscribe to
	 * `on(jobId, "done"|"error", cb)` for the result.
	 */
	generateAudio(input: AIGenerateAudioInput): Promise<string>;
	/**
	 * Generate a scene-graph proposal from a text brief. Returns `{title, ops}`
	 * where `ops` is a `CanvasOp[]` batch (add_node/add_edge) that the plugin
	 * can validate + apply via `tipc.canvas.planOps` or feed to `apply_ops`.
	 * Useful for "describe a scene → canvas nodes" workflows.
	 */
	generateGraph(input: {
		prompt: string;
		providerId?: string;
		model?: string;
	}): Promise<{ title: string; ops: unknown[] }>;
	/** Enqueue a generic async job (music_gen etc.) and return the job id. */
	enqueueJob(input: AIJobInput): Promise<string>;
	/** Subscribe to job progress/done/error events. */
	on(
		jobId: string,
		event: "progress" | "done" | "error",
		cb: (...args: unknown[]) => void,
	): Unsubscribe;
	/**
	 * Read a job record by id. The `done`/`error` events only carry status —
	 * use this after `done` to fetch the generated assets (`result.assetUrls`).
	 * Returns undefined for an unknown job id.
	 */
	getJob(jobId: string): Promise<AIGenJob | undefined>;
}

/**
 * `ffmpeg` availability on `PATH` — mirrors `tipc.merge.available` /
 * `probeFfmpeg`. Gates the video_composite merge buttons (and every other
 * system-ffmpeg operation). When `available` is false, `reason` is the
 * human-readable message shown to the user (in Chinese) and `installHint`
 * is the shell command that would fix it (`brew install ffmpeg`).
 */
export interface VideoFfmpegProbe {
	available: boolean;
	installHint?: string;
	reason?: string;
}

/**
 * Input for `app.video.merge` (video_composite body). `mode: "grid"` lays N
 * image / video inputs onto a single base image; `mode: "concat"` concatenates
 * video inputs into a single clip. `ratio` / `number` / `cols` / `rows` map
 * 1:1 to the host's `GridMergeSchema`. `outKind` picks the ffmpeg branch —
 * `"image"` flattens the grid layout to a PNG; `"video"` produces an MP4 (or
 * the concat result).
 */
export interface VideoMergeInput {
	nodeId?: string;
	mode: "grid" | "concat";
	ratio: "16:9" | "9:16" | "1:1";
	number: boolean;
	/** Optional explicit grid dimensions (renderer-computed via mergeGridDims).
	 *  Ignored for `mode: "concat"`. */
	cols?: number;
	rows?: number;
	assetUrls: string[];
	outKind: "image" | "video";
}

/** Result of `app.video.merge` — mirrors `GridMergeResult` + the host's
 *  `recordSyncJob` wrapper (`{jobId, ...result}`). */
export interface VideoMergeResult {
	jobId: string;
	fileId: string;
	fileIds: string[];
	mediaType: "image" | "video";
	assetUrl: string;
	path: string;
}

/** Input for `app.video.apply` — trim / crop / audio extraction. Discriminated
 *  by `op`: `trim` needs `startSec`+`durationSec`; `crop` needs `x`+`y`+`w`+`h`;
 *  `audio_split` needs no extras. Mirrors `VideoOpSchema`. */
export interface VideoApplyInput {
	op: "trim" | "crop" | "audio_split";
	nodeId?: string;
	assetUrl: string;
	/** Required when `op: "trim"`. */
	startSec?: number;
	durationSec?: number;
	/** Required when `op: "crop"`. */
	x?: number;
	y?: number;
	w?: number;
	h?: number;
}

/** Result of `app.video.apply` — mirrors `VideoOpResult`. `mediaType: "audio"`
 *  when `op: "audio_split"`, `"video"` otherwise. The source is never
 *  overwritten — the renderer spawns a downstream node from the result. */
export interface VideoApplyResult {
	jobId: string;
	fileId: string;
	fileIds: string[];
	mediaType: "video" | "audio";
	assetUrl: string;
	path: string;
}

/** Input for `app.video.analyze` — read a finished clip with the routed
 *  text-vision model and write back a reusable Chinese generation prompt.
 *  Past the model's inline-media cap (~18 MB) the host throws and tells the
 *  user to `apply("trim")` first. */
export interface VideoAnalyzeInput {
	assetUrl: string;
	/** Optional extra instruction appended to the ask. */
	question?: string;
	/** Override the routed provider / model. */
	providerId?: string;
	model?: string;
}

/** Result of `app.video.analyze`. `text` is the reusable prompt (subject / camera /
 *  lighting / environment / rhythm, ≤120 Chinese chars); `model` is the resolved model id
 *  used to attribute the result. */
export interface VideoAnalyzeResult {
	text: string;
	model: string;
}

/** Input for `app.video.save` — save a canvas asset to a user-chosen path.
 *  `name` is the suggested filename WITHOUT extension; the mime decides the
 *  extension. Mirrors the built-in toolbar's download button. */
export interface VideoSaveInput {
	assetUrl: string;
	name?: string;
}

/** Result of `app.video.save` — `saved` is false when the user cancelled the
 *  save dialog; otherwise `path` is the absolute path that was written. */
export interface VideoSaveResult {
	saved: boolean;
	path?: string;
}

/** Per-op availability for the video toolbar. Mirrors `tipc.video.available`'s
 *  `VideoCaps`. Three kinds of "no" — fixable locally (ffmpeg), fixable in
 *  settings (analyze needs a text-vision vendor), or not fixable (vendor
 *  doesn't exist yet, listed so the toolbar shape matches the reference
 *  product). */
export interface VideoOpCap {
	available: boolean;
	/** Why not — Chinese, shown as the button's tooltip when disabled. */
	reason?: string;
	/** Shell command that would fix it (ffmpeg ops only). */
	installHint?: string;
}

export type VideoCaps = {
	trim: VideoOpCap;
	crop: VideoOpCap;
	audio_split: VideoOpCap;
	analyze: VideoOpCap;
	upscale: VideoOpCap;
	desubtitle: VideoOpCap;
	inpaint: VideoOpCap;
};

/**
 * Video post-production host (V1.4). Mirrors the renderer-facing
 * `tipc.merge.*` + `tipc.video.*` IPC, scoped to the plugin context. All
 * backends are engine-bypass sync jobs (`recordSyncJob`) — the returned
 * `jobId` is for the records panel / history, not for polling. Trusted-tier
 * only by capability (system ffmpeg, vision model, save dialog) but not
 * flagged in the safe-tier `Omit` because there are no BYOK secrets or
 * filesystem escape hatches to gate.
 */
export interface VideoHost {
	/**
	 * Probe the system `ffmpeg` binary — gates the video_composite merge
	 * buttons. Cheap; the renderer calls it once on mount. Same shape as the
	 * host's `tipc.merge.available`.
	 */
	probe(): Promise<VideoFfmpegProbe>;
	/**
	 * Run a video_composite merge. `mode: "grid"` produces an image
	 * (defaults) or video of inputs laid on a base; `mode: "concat"`
	 * concatenates video inputs into a single clip. Synchronous; returns the
	 * merged asset directly.
	 */
	merge(input: VideoMergeInput): Promise<VideoMergeResult>;
	/**
	 * Per-op availability for trim / crop / audio_split / analyze + the
	 * vendor-stub ops (upscale / desubtitle / inpaint). One probe call on
	 * mount decides which buttons are live and surfaces the reason for every
	 * disabled control.
	 */
	available(): Promise<VideoCaps>;
	/**
	 * Run a local ffmpeg post-op. `op: "trim"` needs `startSec` +
	 * `durationSec`; `op: "crop"` needs `x` + `y` + `w` + `h`; `op:
	 * "audio_split"` needs no extras. The source clip is never overwritten —
	 * the caller spawns a downstream node from the returned asset.
	 */
	apply(input: VideoApplyInput): Promise<VideoApplyResult>;
	/**
	 * Read a finished clip with the routed text-vision model and write back a
	 * reusable Chinese generation prompt (subject / camera / lighting / environment / rhythm,
	 * ≤120 chars). Throws past the model's inline-media cap (~18 MB) — the
	 * user must `apply("trim")` first.
	 */
	analyze(input: VideoAnalyzeInput): Promise<VideoAnalyzeResult>;
	/**
	 * Save a canvas asset to a user-chosen path (showSaveDialog). Mirrors the
	 * built-in toolbar's download button. `saved` is false when the user cancels
	 * the dialog; otherwise `path` is the absolute path that was written.
	 */
	save(input: VideoSaveInput): Promise<VideoSaveResult>;
}

/** Input for `gen.ngridImage` — N upstream image refs → 1 image. Mirrors the
 *  built-in `ngrid_image` body (`generation/build-ngrid-payload.ts`) and the
 *  `NgridImageSchema` registered in `electron/main/ipc/functions/index.ts:1245`.
 *  `refAssetUrls` carries the upstream image sources (collected from canvas
 *  edges by the plugin via `resolveUpstreamRefs` or the new `props.edges`
 *  body prop). `providerId`/`model` optional — routes through the same
 *  catalog as `ai.generateImage`. */
export interface GenNgridImageInput {
	prompt: string;
	ratio: string;
	resolution: string;
	providerId?: string;
	model?: string;
	refAssetUrls: string[];
}

/** Result of `gen.ngridImage` — same shape the built-in
 *  `NgridImageBody.tsx` reads (a jobId + a denormalized result with assetUrl).
 *  The plugin spawns the downstream image node from this. */
export interface GenNgridImageResult {
	jobId: string;
	result: { assetUrl?: string; path?: string; model?: string };
}

/** Input for `gen.style` — style transfer (upstream image + style prompt).
 *  Mirrors `StyleSchema` (`electron/main/ipc/handlers/style.ts`): the host
 *  reuses `generateImage` with `refAssetUrls=[upstream]` so the styled image
 *  rides the same image_gen path the built-in `style` node uses. */
export interface GenStyleInput {
	nodeId?: string;
	prompt: string;
	ratio: string;
	resolution: string;
	providerId?: string;
	model?: string;
	upstreamAssetUrl: string | null;
	refAssetUrls: string[];
}

/** Result of `gen.style` — same `{jobId, result:{assetUrl,...}}` shape as
 *  `gen.ngridImage` (the built-in StyleBody spawns an image node from this). */
export interface GenStyleResult {
	jobId: string;
	result: { assetUrl?: string; path?: string; model?: string };
}

/** Input for `gen.threed.run` — text → 3D model. Mirrors the `tipc.gen.threed.run`
 *  schema (`electron/main/ipc/functions/index.ts`): `format` defaults to glb.
 *  The host pipeline (`threed_gen` job) currently throws VENDOR_NOT_CONFIGURED
 *  until a Meshy/Tripo vendor is wired — plugins surface that failure the same
 *  way the built-in Model3dBody does. */
export interface GenThreedInput {
	nodeId?: string;
	prompt: string;
	format: "glb" | "obj" | "fbx";
}

/** Result of `gen.threed.run` — a jobId the plugin polls via `app.ai.on`. */
export interface GenThreedResult {
	jobId: string;
}

/** Input for `gen.lipsync.run` — audio → talking-head. Mirrors the
 *  `tipc.gen.lipsync.run` schema; the host pipeline is likewise stubbed
 *  (VENDOR_NOT_CONFIGURED) until a lipsync vendor lands. */
export interface GenLipsyncInput {
	nodeId?: string;
	refMedia: string;
	audio: string;
}

/** Result of `gen.lipsync.run` — a jobId the plugin polls via `app.ai.on`. */
export interface GenLipsyncResult {
	jobId: string;
}

/**
 * Gen subsystem (V1.4) — compositing / multi-ref paths that don't fit the
 * single-asset `ai.generateImage` shape. Initial scope: `ngridImage` (N image
 * refs → 1 image via the image_gen multi-ref path). Forward-compatible: more
 * `tipc.gen.*` routes can land here as the host grows.
 */
export interface GenHost {
	ngridImage(input: GenNgridImageInput): Promise<GenNgridImageResult>;
	/** Style transfer — upstream image + style prompt → styled image (image_gen). */
	style(input: GenStyleInput): Promise<GenStyleResult>;
	/** Text → 3D model (threed_gen job; vendor-gated). */
	threed: {
		available(): Promise<{ available: boolean; installHint: string }>;
		run(input: GenThreedInput): Promise<GenThreedResult>;
	};
	/** Audio → talking-head (lipsync_gen job; vendor-gated). */
	lipsync: {
		available(): Promise<{ available: boolean; installHint: string }>;
		run(input: GenLipsyncInput): Promise<GenLipsyncResult>;
	};
}

/** A command a plugin contributes to the command palette (Cmd+K). */
export interface UICommand {
	id: string;
	title: string;
	subtitle?: string;
	/** Run when the user picks the command. */
	action: () => void;
}

/** A toolbar button a plugin contributes to the canvas toolbar. */
export interface UIToolbarButton {
	id: string;
	/** Lucide icon name (resolved by the toolbar's icon map) or short label. */
	icon?: string;
	label?: string;
	onClick: () => void;
}

/** A panel a plugin contributes (rendered inside a canvas side-panel slot). */
export interface UIPanel {
	id: string;
	title: string;
	/** React component factory (returns a React element). */
	render: () => unknown;
}

/** A context-menu item a plugin adds to the canvas right-click menu. */
export interface UIContextMenuItem {
	id: string;
	label: string;
	/**
	 * Optional icon — a Lucide icon name in PascalCase (e.g. "Timer", "Image").
	 * Rendered to the left of the label, matching the built-in quick-add nodes.
	 * Unknown names fall back to an empty spacer. Mirrors `UISettingsTab.icon`.
	 */
	icon?: string;
	/** Only show when these node types are in the selection (absent = always show). */
	nodeTypes?: string[];
	/**
	 * Run when the user picks the item. Handed the current selection plus the
	 * canvas world coords of the click that opened the menu, so a plugin can
	 * insert at the cursor (matching the built-in quick-add nodes).
	 */
	action: (selectedNodeIds: string[], canvasX?: number, canvasY?: number) => void;
}

/** A settings tab a plugin contributes to the Settings Modal. */
export interface UISettingsTab {
	id: string;
	label: string;
	icon?: string;
	/** React component factory (returns a React element). */
	render: () => unknown;
}

/**
 * What `ui.registerSettingsTab` accepts: the V1.1 self-rendered tab, or a
 * declarative {@link SettingTab} the host renders from its definitions.
 *
 * A bare `SettingDefinitionItem[]` is deliberately NOT accepted — definitions
 * alone carry no `getControlValue`/`setControlValue`, so nothing could persist
 * what the user typed. Wrap them in a `PluginSettingTab` (one subclass, ~3
 * lines) and storage comes for free.
 */
export type UISettingsTabInput = UISettingsTab | SettingTab;

/**
 * A global keyboard shortcut a plugin contributes. Fired on the canvas
 * window; ignored while the user is typing in an input/textarea/select.
 * `key` uses the same format as the built-in shortcuts (see the app's
 * `parseKeyEventString`: `"Ctrl+Shift+J"`, `"Delete"`, `"Space"`, …).
 */
export interface UIShortcut {
	id: string;
	name: string;
	key: string;
	/** Run when the user presses the combo outside a text input. */
	action: () => void;
}

/** Options for openModal. */
export interface UIModalOptions {
	title: string;
	/** React component factory (returns the modal body React element). */
	render: () => unknown;
	width?: number | string;
	/**
	 * Owning plugin id. Stamped automatically by the host from the plugin
	 * manifest; plugins never set it themselves. The host uses it to close
	 * the modal when its plugin is disabled, so a disabled plugin can't
	 * leave a zombie modal on screen.
	 */
	pluginId?: string;
}

/**
 * What `openModal` accepts: the V1.1 options object, or a {@link Modal}
 * subclass instance whose `contentEl` the host mounts. Both normalize to
 * `UIModalOptions` inside `uiRegistry`.
 */
export type UIModalInput = UIModalOptions | Modal;
