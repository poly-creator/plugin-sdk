/**
 * Declarative plugin settings — the `getSettingDefinitions()` contract.
 *
 * A plugin describes its settings as data; the host renders them (see
 * apps/desktop/src/plugins/components/PluginSettingsRenderer.tsx) into the
 * Settings Modal using the app's own styling. Storage, default-value fallback,
 * validation and disable-predicates are all handled by the framework, so a
 * plugin author writes no React and no persistence code for the common case.
 *
 * Modelled on modern declarative settings APIs — NOT on older imperative
 * `display()` + `new Setting(el)` DOM builders. The escape hatch returns a
 * React element rather than mutating a container element, and vault-specific
 * `file`/`folder` controls are replaced by PolyCreator's `model`/`node`.
 *
 * See docs/superpowers/specs/2026-08-04-plugin-settings-api-design.md §3–§4.
 */
import type { PluginHost } from "./host.ts";

// ── Controls ────────────────────────────────────────────────────────────────

/**
 * Fields shared by every control. `key` is the property name handed to
 * `getControlValue`/`setControlValue` — for a `PluginSettingTab` that is a key
 * of `plugin.settings`.
 */
export interface SettingControlBase<V> {
	key: string;
	/** Used when the resolved value is `undefined`/`null`. */
	defaultValue?: V;
	/**
	 * Validate a candidate value before it is persisted. Return a non-empty
	 * string to REJECT the change and surface it as an inline error under the
	 * row; return nothing to accept.
	 *
	 * Also run once against the seeded value when the row mounts, so settings
	 * written by an older version of the plugin surface their error immediately.
	 * That pass reports only — it never rewrites stored data.
	 */
	validate?: (value: V) => string | void | Promise<string | void>;
	/**
	 * Disable the control. A function form is re-evaluated on every render, so
	 * it can depend on other settings; call `update()` on the tab after mutating
	 * state the predicate reads.
	 */
	disabled?: boolean | (() => boolean);
}

export interface SettingToggleControl extends SettingControlBase<boolean> {
	type: "toggle";
}
export interface SettingTextControl extends SettingControlBase<string> {
	type: "text";
	placeholder?: string;
}
export interface SettingTextAreaControl extends SettingControlBase<string> {
	type: "textarea";
	placeholder?: string;
	/** Initial visible rows. */
	rows?: number;
}
export interface SettingNumberControl extends SettingControlBase<number> {
	type: "number";
	min?: number;
	max?: number;
	step?: number;
	placeholder?: string;
}
export interface SettingDropdownControl extends SettingControlBase<string> {
	type: "dropdown";
	/** value → label. */
	options: Record<string, string>;
}
export interface SettingSliderControl extends SettingControlBase<number> {
	type: "slider";
	min: number;
	max: number;
	step?: number;
}
export interface SettingColorControl extends SettingControlBase<string> {
	type: "color";
}
/**
 * A secret string (API key, token). Rendered masked. Phase A2 routes this
 * through the encrypted key store instead of plain `plugin-data` JSON; until
 * then it persists like `text` and is masked in the UI only.
 */
export interface SettingSecretControl extends SettingControlBase<string> {
	type: "secret";
	placeholder?: string;
}
/** Pick a configured provider + model. Phase A2. */
export interface SettingModelControl extends SettingControlBase<{
	providerId: string;
	model: string;
}> {
	type: "model";
}
/** Pick a canvas node by id. Phase A2. */
export interface SettingNodeControl extends SettingControlBase<string> {
	type: "node";
	/** Restrict the picker to these node types. */
	nodeTypes?: string[];
}

/**
 * A horizontal button group — each option renders as a clickable button with
 * the value as its label, like the legacy audio "voice model" / "speed" / "duration"
 * grids. Use for 2-7 mutually-exclusive choices that benefit from
 * always-visible labels (vs. a dropdown, which hides them until opened).
 *
 * Reuses the `defaultValue` / `validate` / `disabled` contract from
 * `SettingControlBase` — same shape as every other control, so a plugin
 * author moves between `dropdown` and `radio-group` with one keyword change.
 */
export interface SettingRadioGroupControl extends SettingControlBase<string> {
	type: "radio-group";
	options: Record<string, string>;
}

export type SettingControl =
	| SettingToggleControl
	| SettingTextControl
	| SettingTextAreaControl
	| SettingNumberControl
	| SettingDropdownControl
	| SettingRadioGroupControl
	| SettingSliderControl
	| SettingColorControl
	| SettingSecretControl
	| SettingModelControl
	| SettingNodeControl;

// ── Definitions ─────────────────────────────────────────────────────────────

/** Presentation + search metadata shared by every setting row. */
export interface SettingDefinitionBase {
	name: string;
	desc?: string;
	/** Extra search terms (settings search is not implemented yet; forward-looking). */
	aliases?: string[];
	/** `false` excludes the row from search. Default true. */
	searchable?: boolean | (() => boolean);
	/**
	 * `false` hides the row entirely. Re-evaluated on every render; call
	 * `update()` on the tab after mutating state the predicate reads.
	 */
	visible?: boolean | (() => boolean);
}

/** A row bound to a control — the common case. */
export interface SettingDefinitionControl extends SettingDefinitionBase {
	control: SettingControl;
	render?: never;
	action?: never;
}

/**
 * Escape hatch: render the row's control area yourself. Returns a React
 * element (build it with `window.PolyCreator.React`, since a plugin bundle cannot
 * `import react`).
 */
export interface SettingDefinitionRender extends SettingDefinitionBase {
	render: () => unknown;
	control?: never;
	action?: never;
}

/** Button visual weight for `SettingDefinitionAction`, mirroring the host's button variants. */
export type ActionVariant = "default" | "secondary" | "outline" | "destructive";

/**
 * A row that behaves like a button: clicking it runs `action`.
 *
 * `action` may be async. While it is pending the button shows a spinner and
 * disables itself; a resolved non-empty string is shown inline as a success
 * message, and a thrown `Error`'s message is shown inline as an error. Use
 * this for "test connection" / "sync now" affordances — the framework owns the
 * loading + result surface.
 */
export interface SettingDefinitionAction extends SettingDefinitionBase {
	action: () => string | void | Promise<string | void>;
	/** Label on the row's button. Defaults to the row name. */
	actionLabel?: string;
	/** Button visual weight. Defaults to "default". */
	variant?: ActionVariant;
	/** Lucide icon name rendered before the label (e.g. "RefreshCw"). Unknown names render icon-less. */
	icon?: string;
	/** When set, `window.confirm` runs first; declining aborts the action. */
	confirm?: string;
	disabled?: boolean | (() => boolean);
	control?: never;
	render?: never;
}

/** Name + description only — a heading or explanatory row. */
export interface SettingDefinitionEmpty extends SettingDefinitionBase {
	/** Render as a section heading rather than a card. */
	heading?: boolean;
	control?: never;
	render?: never;
	action?: never;
}

export type SettingDefinition =
	| SettingDefinitionControl
	| SettingDefinitionRender
	| SettingDefinitionAction
	| SettingDefinitionEmpty;

/**
 * A titled group of rows. Phase A2 — declared now so the item union is stable;
 * the A1 renderer flattens groups (renders `heading` + items inline).
 */
export interface SettingDefinitionGroup {
	type: "group";
	heading?: string;
	items?: SettingDefinition[];
	visible?: boolean | (() => boolean);
}

/**
 * A titled collection of rows the user can add to, delete from, and reorder —
 * the declarative shape for "a set of configs" settings (multiple providers,
 * servers, destinations…). Mirrors Obsidian 1.13's `SettingDefinitionList`.
 *
 * An empty `items` renders `emptyState`; `addItem` renders a "+ Add"
 * affordance under the items; `onDelete` renders a delete button on every
 * item; `onReorder` renders up/down move buttons (the contract is
 * `(oldIndex, newIndex)`, so a future drag-handle upgrade stays
 * source-compatible). Items render through the normal `DefinitionView` path,
 * so every control/validate/visible behaviour applies inside a list.
 */
export interface SettingDefinitionList {
	type: "list";
	heading?: string;
	/** Rendered when `items` is empty. */
	emptyState?: string;
	items?: SettingDefinition[];
	/** Add-entry affordance. The framework renders a button labelled `name`. */
	addItem?: { name: string; action: () => void | Promise<void> };
	/** When set, renders a delete button on every item. Called with the item's index. */
	onDelete?: (index: number) => void;
	/** When set, renders up/down move buttons on every item. Called with old and new index. */
	onReorder?: (oldIndex: number, newIndex: number) => void;
	visible?: boolean | (() => boolean);
}

/** One entry in the array returned by `getSettingDefinitions()`. */
export type SettingDefinitionItem =
	| SettingDefinition
	| SettingDefinitionGroup
	| SettingDefinitionList;

/** Narrowing helper — groups are the entries carrying `type: "group"`. */
export function isSettingGroup(item: SettingDefinitionItem): item is SettingDefinitionGroup {
	return (item as SettingDefinitionGroup).type === "group";
}

/** Narrowing helper — lists are the entries carrying `type: "list"`. */
export function isSettingList(item: SettingDefinitionItem): item is SettingDefinitionList {
	return (item as SettingDefinitionList).type === "list";
}

/** Resolve a `boolean | (() => boolean)` predicate, defaulting when absent. */
export function resolvePredicate(
	p: boolean | (() => boolean) | undefined,
	fallback: boolean,
): boolean {
	if (p === undefined) return fallback;
	return typeof p === "function" ? p() : p;
}

// ── Tabs ────────────────────────────────────────────────────────────────────

/**
 * Base class for a settings tab. Plugins extend {@link PluginSettingTab}
 * (which binds storage to `plugin.settings`); this class exists for tabs that
 * own their storage entirely.
 */
export abstract class SettingTab {
	/**
	 * Sidebar entry id. Normally left unset — `PolycreatorPlugin.addSettingTab`
	 * fills it with `<pluginId>:settings` (or `<pluginId>:<id>` when the tab
	 * declares one), which is also what `unregisterPlugin` matches on teardown.
	 */
	id?: string;
	/** Sidebar entry label. Defaults to the plugin's manifest name. */
	label?: string;
	/** Lucide icon name shown in the settings sidebar. */
	icon?: string;
	app: PluginHost;
	/** Cached result of the last `update()`. The renderer reads this. */
	settingItems: SettingDefinitionItem[] = [];

	/**
	 * Notifies the host that this tab's definitions changed. Injected by the
	 * host when the tab is registered; a tab constructed but never registered
	 * has no listener, so `update()` is a pure cache refresh.
	 */
	private onChanged?: () => void;
	/**
	 * Subscribers notified when the data behind this tab changed externally —
	 * typically because another window called `setControlValue` and the
	 * main process broadcast `polycreator:plugin:data-changed`. The renderer-side
	 * bridge calls this on every tab whose plugin's settings changed.
	 */
	private dataChangeListeners = new Set<() => void>();

	constructor(app: PluginHost) {
		this.app = app;
	}

	/** Override to declare this tab's settings. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [];
	}

	/**
	 * Recompute `settingItems` and ask the host to re-render. Call after
	 * mutating state that `visible`/`disabled` predicates read, or when the set
	 * of definitions itself changes.
	 */
	update(): void {
		this.settingItems = this.getSettingDefinitions();
		this.onChanged?.();
	}

	/**
	 * Re-evaluate `visible`/`disabled` predicates without rebuilding the
	 * definitions array. Cheaper than `update()` for the common case where
	 * data changed (cross-window sync, secret save) but the set of rows is
	 * the same. The renderer caches `settingItems` by reference, so leaving
	 * it alone lets React skip the per-item reconcile path; the parent's
	 * notify-listener still re-runs the predicates on each `DefinitionView`.
	 */
	refreshDomState(): void {
		this._notifyDataChanged();
	}

	/** Read the current value for a control key. */
	getControlValue(key: string): unknown {
		void key;
		return undefined;
	}

	/** Persist a new value for a control key. */
	setControlValue(key: string, value: unknown): void | Promise<void> {
		void key;
		void value;
	}

	/**
	 * Called when another window changed this tab's backing storage (A2.1).
	 * Default: bump the renderer (re-read `getControlValue` + re-run
	 * `visible`/`disabled` predicates). Override for tabs whose source of
	 * truth is not the in-memory `plugin.settings` — typically to re-fetch from
	 * a network store.
	 */
	refresh(): void {
		this._notifyDataChanged();
	}

	/** Called when the tab is hidden. Override to release resources. */
	hide(): void {}

	/**
	 * Host-internal: wire the re-render notifier. Not part of the plugin-facing
	 * contract.
	 * @internal
	 */
	_setChangeListener(fn: (() => void) | undefined): void {
		this.onChanged = fn;
	}

	/**
	 * Subscribe to external data changes (other windows writing this tab's
	 * settings). Returns an unsubscribe. The host invokes these after
	 * `polycreator:plugin:data-changed` broadcasts.
	 */
	onDataChange(listener: () => void): () => void {
		this.dataChangeListeners.add(listener);
		return () => {
			this.dataChangeListeners.delete(listener);
		};
	}

	/** @internal — host calls this on every `data-changed` for this tab. */
	_notifyDataChanged(): void {
		this.dataChangeListeners.forEach((fn) => fn());
	}
}

/**
 * What `PluginSettingTab` needs from the plugin it belongs to. Structural
 * rather than importing `PolycreatorPlugin` — base.ts imports this module, so a
 * concrete import here would be a cycle.
 */
export interface SettingsOwner {
	settings?: unknown;
	saveSettings(): Promise<void>;
	/**
	 * Optional — when present, `PluginSettingTab.refresh()` (A2.1 cross-window
	 * sync) re-invokes it with the current `settings` as defaults, so this
	 * window's in-memory copy picks up changes another window wrote to disk.
	 * Shaped to match `PolycreatorPlugin.loadSettings` exactly so a plugin instance
	 * is structurally assignable to `SettingsOwner`.
	 */
	loadSettings?: <T extends object>(defaults: T) => Promise<T>;
}

/**
 * A settings tab backed by `plugin.settings`. Reads and writes that object and
 * persists via `plugin.saveSettings()`. Override `getControlValue`/
 * `setControlValue` to bind a different data source.
 */
export abstract class PluginSettingTab extends SettingTab {
	plugin: SettingsOwner;

	constructor(app: PluginHost, plugin: SettingsOwner) {
		super(app);
		this.plugin = plugin;
	}

	override getControlValue(key: string): unknown {
		const settings = this.plugin.settings as Record<string, unknown> | undefined;
		return settings?.[key];
	}

	override setControlValue(key: string, value: unknown): void | Promise<void> {
		// Create the bag if the plugin never called loadSettings(). Writing to a
		// missing `settings` would otherwise throw and lose the user's edit.
		if (!this.plugin.settings || typeof this.plugin.settings !== "object") {
			this.plugin.settings = {};
		}
		(this.plugin.settings as Record<string, unknown>)[key] = value;
		return this.plugin.saveSettings();
	}

	/**
	 * A2.1 cross-window sync: when another window wrote this tab's data, the
	 * host calls `refresh()`. The default asks the owner's `loadSettings` (if
	 * available) to re-pull from disk and refresh the in-memory bag, so this
	 * window sees the new value on the next render. Plugins that customise
	 * `getControlValue` should override this too.
	 */
	override refresh(): void {
		if (typeof this.plugin.loadSettings !== "function") {
			super.refresh();
			return;
		}
		const defaults = (this.plugin.settings ?? {}) as Record<string, unknown>;
		void Promise.resolve(this.plugin.loadSettings(defaults)).then((next) => {
			// `PolycreatorPlugin.loadSettings` reassigns `this.settings` itself; a
			// custom owner that omits that step leaves the bag untouched. Cover
			// both: assign whenever the return value is a plain object.
			if (next && typeof next === "object") {
				this.plugin.settings = next;
			}
			super.refresh();
		});
	}
}
