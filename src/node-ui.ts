/**
 * Plugin node UI — the declarative contract for what floats above and below a
 * plugin-registered node, plus the contextual payload every callback receives.
 *
 * Plugin authors declare `toolbar` (rows of buttons) and `promptBar` (prompt +
 * parameter area) on the `NodeDef` they hand to `canvas.registerNodeDef`. The
 * host renders them in its own overlay (`NodeInteractionOverlay`), so the
 * styling, positioning, and viewport-clamping logic is unchanged from the
 * built-in image/video/audio nodes.
 *
 * See `docs/superpowers/specs/2026-08-04-plugin-settings-api-design.md` Part B.
 */
import type { SettingControl } from "./settings.ts";

/**
 * A canvas node from the renderer's perspective. Plugins get this on every
 * toolbar / prompt bar callback; it's the same shape the rest of the host
 * uses, so plugin bodies stay consistent with built-in code paths.
 *
 * The plan-v2 fields (nodeId / state / setState / updateState / execute /
 * delete / duplicate / select / close / emit — plan §18) are the FULL
 * context the v2 Default/Hybrid/Custom UI mounts with. Legacy declarative
 * toolbar/prompt bar callbacks receive them too (delete/duplicate/select/close
 * no-op when the host overlay has no handler wired).
 */
export interface NodeUIContext {
	/** The node this toolbar/prompt bar row belongs to. */
	node: unknown;
	/** Patch the node (usually `node.data` fields). */
	update: (patch: Record<string, unknown>) => void;
	/** Whether this node is the user's current selection. */
	selected: boolean;
	/**
	 * RESERVED — not populated yet. The field is declared so a future host-side
	 * wiring (node-runtime job events → overlay) lands without a breaking
	 * change, but nothing sets it today. Treat it as always `undefined` and
	 * track job state yourself.
	 */
	job?: { id: string; status: string; progress?: number };
	/**
	 * Ids of the nodes with an outgoing edge INTO this one (i.e. the
	 * predecessors in the canvas graph). Populated by `PluginNodeOverlay`
	 * from `edges`; the prompt bar reads it into `NodePromptBarSubmit.refs`.
	 * Plugin authors who want their own ref semantics can ignore the host's
	 * value and build their own.
	 */
	refs?: string[];

	// ── v2 (plan §18) — the full NodeUIContext ──────────────────────────────────

	/** The selected node's id. */
	nodeId: string;
	/** The selected node's type. */
	nodeType: string;
	/** The node's `data` (read-only snapshot). */
	state: Readonly<Record<string, unknown>>;
	/** Write one `node.data` key. */
	setState(key: string, value: unknown): void;
	/** Merge a patch into `node.data` (equivalent to `update({ data: ... })`). */
	updateState(patch: Record<string, unknown>): void;
	/** Run the node (enqueue its runtime job). */
	execute(): Promise<void>;
	/** Delete the node from the canvas. */
	delete(): void;
	/** Duplicate the node. */
	duplicate(): void;
	/** Make this node the canvas selection. */
	select(): void;
	/** Dismiss the floating overlay. */
	close(): void;
	/** Emit a plugin event (name-spaced by the host's event bus). */
	emit(event: string, payload?: unknown): void;
}

/** A button in the node's floating toolbar above the body. */
export interface NodeToolbarButton {
	type: "button";
	id: string;
	label?: string;
	icon?: string;
	tooltip?: string;
	/** Disable the button — same shape as settings' `disabled`. */
	disabled?: boolean | ((ctx: NodeUIContext) => boolean);
	visible?: boolean | ((ctx: NodeUIContext) => boolean);
	action: (ctx: NodeUIContext) => void | Promise<void>;
}

/** A horizontal divider between toolbar items. */
export interface NodeToolbarSeparator {
	type: "separator";
}

/**
 * A grouped parameter widget, rendered as a popover-style control cluster.
 * Reuses the same `SettingControl` types the host uses for settings — the
 * author programs once, the host renders twice.
 */
export interface NodeToolbarParams {
	type: "params";
	id: string;
	label: (ctx: NodeUIContext) => string;
	controls: SettingControl[];
}

/** Escape hatch: render any DOM/React the plugin wants here. */
export interface NodeToolbarCustom {
	type: "custom";
	id: string;
	render: (ctx: NodeUIContext) => unknown;
}

export type NodeToolbarItem =
	| NodeToolbarButton
	| NodeToolbarSeparator
	| NodeToolbarParams
	| NodeToolbarCustom;

/**
 * The prompt bar that hangs below the node (the v2 `promptBar` slot). When
 * omitted, no prompt bar is shown — the toolbar above is enough for actions
 * like "open settings" or "duplicate".
 */
export interface NodePromptBarDef {
	/**
	 * Prompt input. Set to `false` to render parameter controls only — for a
	 * node whose payload has no free-text component.
	 */
	prompt?:
		| {
				placeholder?: string;
				multiline?: boolean;
		  }
		| false;
	/**
	 * Parameter controls, rendered via the same machinery as settings rows.
	 * Storage target: `node.data[key]`. (The prompt bar uses the SAME
	 * `SettingControl` types as Part A's settings.)
	 */
	controls?: SettingControl[];
	/** Reference slots (style preset, asset references). */
	refs?: { max?: number } | false;
	/** Optional model picker — restricts by modality. */
	modelPicker?: { modality: "image" | "video" | "audio" | "text" };
	/**
	 * Run when the user submits. The host pre-resolves prompt / params /
	 * refs / model into `input` so the plugin author never deals with the UI.
	 */
	onSubmit: (input: NodePromptBarSubmit, ctx: NodeUIContext) => void | Promise<void>;
}

export interface NodePromptBarSubmit {
	prompt: string;
	params: Record<string, unknown>;
	refs: string[];
	model?: { providerId: string; model: string };
}

/**
 * A read-only summary of a node's progress — useful when a toolbar button
 * shows a spinner / progress bar. Plugins populate via `app.ai.enqueueJob` and
 * receive progress via the node-runtime event bus.
 */
export interface NodeProgress {
	id: string;
	status: string;
	progress?: number;
}
