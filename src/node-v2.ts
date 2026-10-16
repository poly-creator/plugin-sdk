/**
 * node-v2 — the v2 node definition + Default / Hybrid / Custom UI architecture
 * (docs/canvas-plugin-system-implementation-plan-v2.md §4–§18).
 *
 * A v2 plugin declares a {@link NodeDefinition} whose `ui` config tells the host
 * HOW to present the node, without shipping any UI code for the common cases:
 *
 *   mode: "default" → host renders DefaultNodeToolbar + DefaultNodeBody +
 *                     a schema-driven DefaultNodePromptBar. Zero plugin UI.
 *   mode: "hybrid"  → the same defaults PLUS plugin toolbar actions and
 *                     promptBar field/component extensions.
 *   mode: "custom"  → plugin components fully take over toolbar / body /
 *                     promptBar (mode priority: custom > hybrid > default).
 *
 * Node state stays JSON-serializable (`node.data`). UI never reaches into the
 * host store — it talks only through {@link NodeUIContext} (see ./node-ui).
 *
 * Execution is decoupled from the UI: `runtime` holds the node's execution
 * logic (a plain `NodeRuntime` object or a `BaseNodeRuntime` factory), invoked
 * by the host when the user hits the default run button / prompt-bar generate.
 */
import type { PluginNodeDef } from "./host.ts";
import type { SettingControl } from "./settings.ts";
import type { NodeUIContext } from "./node-ui.ts";

// ── UI modes (§5 / §32) ────────────────────────────────────────────────────────

/** How the host should present a node's UI. Priority: custom > hybrid > default. */
export type NodeUIMode = "default" | "hybrid" | "custom";

/** Content kinds the host's DefaultNodeBody can render (§10). */
export type NodeBodyType =
	| "empty"
	| "text"
	| "image"
	| "video"
	| "audio"
	| "asset-preview"
	| "file"
	| "result";

// ── Prompt bar schema (§12) ─────────────────────────────────────────────────────

/** Field control kinds a schema-driven DefaultNodePromptBar can render. */
export type PromptFieldType =
	| "text"
	| "textarea"
	| "select"
	| "slider"
	| "switch"
	| "asset"
	| "model";

/** A single schema-driven prompt field, bound to a `node.data` key. */
export interface PromptField {
	/** Stable field id (per promptBar schema). */
	id: string;
	type: PromptFieldType;
	/** The `node.data` key this field reads/writes. */
	bind: string;
	/** Row label; falls back to `id` when omitted. */
	label?: string;
	/** Placeholder for text / textarea. */
	placeholder?: string;
	/** Value used when `node.data[bind]` is unset. */
	defaultValue?: unknown;
	/** For `select`: string values or `{value,label}` rows. */
	options?: Array<string | { value: string; label?: string }>;
	/** Numeric bounds for `slider`. */
	min?: number;
	max?: number;
	step?: number;
	/**
	 * Escape hatch: hand the host a full `SettingControl` (settings.ts) to
	 * render instead of deriving one from `type`/`options`/`min`/… — lets a
	 * promptBar schema express every control kind (radio-group, color,
	 * number, …) that the shorthand PromptFieldType subset cannot. The host
	 * binds it to `node.data[bind]` exactly like a shorthand field.
	 */
	control?: SettingControl;
}

// ── UI config (§5) ──────────────────────────────────────────────────────────────

/** Node body config: a default `type` (host-rendered) or a custom component. */
export interface NodeBodyConfig {
	/** Default-body content kind (mode default/hybrid). */
	type?: NodeBodyType;
	/**
	 * Dotted path into `node.data` for the content source, e.g. `output.image`
	 * or `imageUrl`. Omitted → the node's conventional `data.imageUrl` /
	 * `data.assetUrls` / `data.text` fields are used.
	 */
	source?: string;
	/** Custom body component — full takeover of the node card (mode custom). */
	component?: unknown;
}

/** A toolbar action a plugin declares (hybrid: appended after the defaults). */
export interface NodeToolbarAction {
	id: string;
	label: string;
	/** Lucide icon name (or any short string the host toolbar renders). */
	icon?: string;
	/** Sort among the plugin's own actions (defaults to declaration order). */
	order?: number;
	visible?: (ctx: NodeUIContext) => boolean;
	disabled?: (ctx: NodeUIContext) => boolean;
	execute: (ctx: NodeUIContext) => void | Promise<void>;
}

/** Node toolbar config: plugin actions (hybrid) or a full custom toolbar. */
export interface NodeToolbarConfig {
	/** Plugin actions appended after the host's default run/duplicate/delete. */
	actions?: NodeToolbarAction[];
	/**
	 * Hybrid: extra React components appended after the actions (plan §49 —
	 * `toolbar: { extensions: [VideoSettingsExtension] }`). Each receives a
	 * `{ ctx }` prop (the {@link NodeUIContext}). Build them with the host's
	 * React (`window.PolyCreator.React`).
	 */
	extensions?: unknown[];
	/** Custom floating-toolbar component — full takeover (mode custom). */
	component?: unknown;
}

/** Node prompt bar config: schema (default/hybrid) + extensions or full custom. */
export interface NodePromptBarConfig {
	/**
	 * Floating prompt-bar width in px (default 380). The host clamps the panel
	 * to the canvas box with this value, so a wider custom composer (e.g. a
	 * 640px video node matching the built-in) declares it here.
	 */
	width?: number;
	/** Schema-driven fields bound to `node.data` (default/hybrid). */
	schema?: PromptField[];
	/**
	 * Hybrid: extra React components rendered below the schema fields (e.g.
	 * camera selector, motion selector). Each receives a `{ ctx }` prop (the
	 * {@link NodeUIContext}). Build them with the host's React
	 * (`window.PolyCreator.React`).
	 */
	extensions?: unknown[];
	/** Custom prompt-bar component — full takeover (mode custom). */
	component?: unknown;
}

/** The full UI declaration on a {@link NodeDefinition}. */
export interface NodeUIConfig {
	/** Default UI mode. Omitted → "default". */
	mode?: NodeUIMode;
	toolbar?: NodeToolbarConfig;
	body?: NodeBodyConfig;
	promptBar?: NodePromptBarConfig;
}

// ── Runtime (§16–§17) ───────────────────────────────────────────────────────────

/** Result a node runtime returns from `execute`. */
export interface NodeExecutionResult {
	status: "success" | "failed" | "cancelled";
	/** Outputs the runtime writes back onto `node.data` (merged). */
	outputs?: Record<string, unknown>;
	error?: { code: string; message: string };
	metadata?: Record<string, unknown>;
}

/** Result of an optional pre-flight `validate`. */
export interface NodeValidationResult {
	valid: boolean;
	errors?: string[];
}

/** The host-provided surface a node runtime talks to (no host store access). */
export interface NodeRuntimeContext {
	nodeId: string;
	nodeType: string;
	/** Live `node.data`, read-only. */
	state: Readonly<Record<string, unknown>>;
	/** Write one `node.data` key. */
	setState(key: string, value: unknown): void;
	/** Merge a patch into `node.data`. */
	updateState(patch: Record<string, unknown>): void;
}

/** Object-form runtime: `execute(ctx)` receives the context per call. */
export interface NodeRuntime {
	execute(context: NodeRuntimeContext): Promise<NodeExecutionResult>;
	cancel?(context: NodeRuntimeContext): Promise<void>;
	validate?(context: NodeRuntimeContext): NodeValidationResult;
}

/** Factory-form runtime: `create(ctx)` returns a bound instance. */
export interface NodeRuntimeFactory {
	create(context: NodeRuntimeContext): NodeRuntime;
}

export type NodeRuntimeDefinition = NodeRuntime | NodeRuntimeFactory;

/**
 * Base runtime class (plan §16/§36). Constructed with a bound context by the
 * host when registered via the factory form:
 *
 *   runtime: { create: (ctx) => new MyRuntime(ctx) }
 */
export abstract class BaseNodeRuntime {
	protected readonly context: NodeRuntimeContext;

	constructor(context: NodeRuntimeContext) {
		this.context = context;
	}

	abstract execute(): Promise<NodeExecutionResult>;

	async cancel(): Promise<void> {}

	validate(): NodeValidationResult {
		return { valid: true };
	}
}

// ── Version / migration (§41) ──────────────────────────────────────────────────

/** One version-step state migration. */
export interface NodeMigration {
	from: number;
	to: number;
	migrate(state: Record<string, unknown>): Record<string, unknown>;
}

/** A storage migration callback receives the plugin's isolated store to read/write. */
export interface PluginMigrationContext {
	/** The plugin's isolated persistent store (`app.storage` surface, §29). */
	storage: {
		get<T>(key: string): Promise<T | undefined>;
		set<T>(key: string, value: T): Promise<void>;
		delete(key: string): Promise<void>;
		clear(): Promise<void>;
	};
	fromVersion: string;
	toVersion: string;
}

/**
 * One plugin-level version-step migration (§41). Plugin settings / plugin-scoped
 * storage shape can drift across manifest versions; a migration rewrites it in
 * place BEFORE the plugin's `setup`/`onload` runs. The host runs every matching
 * migration in declaration order (semver `from` → `to`), then records the
 * manifest version as the new baseline.
 */
export interface PluginMigration {
	from: string; // semver, e.g. "1.0.0"
	to: string; // semver, e.g. "1.1.0"
	migrate(ctx: PluginMigrationContext): Promise<void>;
}

// ── Node definition (§4) ────────────────────────────────────────────────────────

/**
 * A v2 node definition — identity + schema + UI config + runtime. Extends the
 * Plane-1 `PluginNodeDef` (palette/connectsTo/defaultData) with the v2 `ui`,
 * `runtime`, versioning and state-seeding fields.
 */
export interface NodeDefinition extends Omit<PluginNodeDef, "runtime"> {
	/** Version of this node type (for state migrations). Defaults to 1. */
	version?: number;
	/** Seed the initial `node.data` when a node of this type is created. */
	createState?: () => Record<string, unknown>;
	/** Default / Hybrid / Custom UI config (§5–§14). */
	ui?: NodeUIConfig;
	/** Execution logic (§16–§17): object form or BaseNodeRuntime factory. */
	runtime?: NodeRuntimeDefinition;
	/** State migrations keyed by version (§41). */
	migrations?: NodeMigration[];
}

// ── Resolution (§6 / §32) ──────────────────────────────────────────────────────

/**
 * What the host's NodeUIResolver derives from a node's def. `mode` follows the
 * config; the host picks the renderer per priority custom > hybrid > default.
 */
export interface ResolvedNodeUI {
	mode: NodeUIMode;
	config: NodeUIConfig;
	/** Whether the host renders its own toolbar or the plugin's custom one. */
	toolbar: "default" | "custom";
	/** Whether the host renders its own body or the plugin's custom one. */
	body: "default" | "custom";
	/** Whether the host renders the schema prompt bar or the plugin's custom one. */
	promptBar: "default" | "custom";
}
