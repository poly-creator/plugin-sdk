# Plugin Node UI

The PolyCreator plugin SDK lets a plugin author contribute the floating toolbar (above the node) and the composer (below it) for any node type it registers. The host owns positioning, viewport math, and styling; the plugin author writes data, the host draws it — same pattern as `PluginSettingTab` for the Settings Modal.

> **Types**: `NodeToolbarItem` / `NodePromptBarDef` (`src/node-ui.ts`); the control shape they render is shared with plugin settings ([`./plugin-settings.md`](./plugin-settings.md)).

## Quick start

```ts
import { PolycreatorPlugin, type NodeUIContext } from "@polycreator/plugin-sdk";

export default class MockProviderPlugin extends PolycreatorPlugin {
	override async onload(): Promise<void> {
		// Existing node-def registration (unchanged):
		this.app.canvas.registerNodeDef({
			type: `${this.manifest.id}:mock-image`,
			label: "Mock Image",
			icon: "Image",
			// ...
		});

		// New: the floating UI for that node type.
		this.addNodeUI([`${this.manifest.id}:mock-image`], {
			toolbar: [
				{
					type: "button",
					id: "refresh",
					label: "刷新",
					icon: "RefreshCw",
					action: (ctx) => this.app.ai.generateImage(this.payloadFor(ctx)),
				},
				{ type: "separator" },
				{
					type: "params",
					id: "params",
					label: () => "参数",
					controls: [
						{ type: "slider", key: "seed", min: 0, max: 1_000_000, defaultValue: 0 },
						{
							type: "dropdown",
							key: "size",
							defaultValue: "1024x1024",
							options: { "1024x1024": "1024×1024", "512x512": "512×512" },
						},
					],
				},
			],
			composer: {
				prompt: { placeholder: "描述你想生成的图像…", multiline: true },
				controls: [
					{ type: "number", key: "count", min: 1, max: 4, defaultValue: 1 },
					{ type: "slider", key: "guidance", min: 1, max: 20, defaultValue: 7 },
				],
				modelPicker: { modality: "image" },
				onSubmit: (input, ctx) => {
					// input.prompt: string
					// input.params: { count, guidance } — declared controls only
					// input.refs: string[] — incoming edge source node ids
					// input.model: { providerId, model } | undefined
					this.runGen(input, ctx);
				},
			},
		});
	}
}
```

That's the whole surface. No JSX, no DOM coordinates, no pan/zoom math — the host already does that.

## `addNodeUI(types, contribution)`

The plugin-side entry point, matching the other `this.addXxx()` contribution helpers:

```ts
addNodeUI(
  types: Iterable<string>,
  contribution: {
    toolbar?: NodeToolbarItem[];
    composer?: NodeComposerDef;
  },
): void;
```

It forwards to `this.app.registerNodeUI(...)`, which is also callable directly if you prefer.

`types` are the `type` strings you passed earlier to `canvas.registerNodeDef`. Multiple types can share one contribution (e.g. `["plugin.x:img", "plugin.x:img-hd"]` for two flavours of the same node).

> Unlike command / panel / shortcut ids, node types are **not** auto-prefixed. A node type is a lookup key that has to match `registerNodeDef` exactly, so rewriting it would silently fail to match. Prefix it yourself when you declare the node (`` `${this.manifest.id}:mynode` ``) and pass the same string here.

Disable / uninstall automatically call `unregisterNodeUIByPlugin(manifest.id)`, so a plugin's toolbar/composer vanish the moment the user toggles it off. No cleanup code to write.

## `NodeToolbarItem` — items for the floating toolbar

```ts
type NodeToolbarItem =
	NodeToolbarButton | NodeToolbarSeparator | NodeToolbarParams | NodeToolbarCustom;

interface NodeToolbarButton {
	type: "button";
	id: string;
	label?: string;
	icon?: string;
	tooltip?: string;
	disabled?: boolean | ((ctx: NodeUIContext) => boolean);
	visible?: boolean | ((ctx: NodeUIContext) => boolean);
	action: (ctx: NodeUIContext) => void | Promise<void>;
}

interface NodeToolbarParams {
	type: "params";
	id: string;
	/** The button label, computed from ctx (see the caveat below). */
	label: (ctx: NodeUIContext) => string;
	/** The popover rows — same `SettingControl` types as the Settings Modal. */
	controls: SettingControl[];
}
```

The toolbar is a flex row of content-sized pills. Items render in declaration order. `separator` is a thin vertical divider. `custom` is the escape hatch — render any DOM/React you want, the host only handles positioning.

### `NodeToolbarParams` is a `SettingControl` cluster

The `controls: SettingControl[]` array is the **same** type the Settings Modal uses. Author once, render in three places (settings page, toolbar popover, composer parameter area). The host's `PluginSettingsRenderer` machinery backs the rows; the popover is a `position: absolute` div with the same card chrome.

Secret / model / node controls are settings-specific (encryption / provider catalog / canvas picker) and are not rendered in the node popover — they show a "仅用于设置页" hint.

`defaultValue`, `validate`, and `disabled` behave exactly as they do in the Settings Modal: the default seeds an unset key, a `validate` that returns a string rejects the edit inline (the typed value stays in the box, nothing is written to `node.data`), and `disabled` accepts a boolean or a predicate.

> **`label(ctx)` is not reactive.** It is called during render, but the overlay only re-renders when the _selected node object_ changes identity — not on every `node.data` write. A label like `` `参数 (${count})` `` will not update live while the popover is open. Keep labels static unless you also force a re-render.

## `NodeComposerDef` — the composer below the node

```ts
interface NodeComposerDef {
	prompt?: { placeholder?: string; multiline?: boolean } | false;
	controls?: SettingControl[];
	refs?: { max?: number } | false; // forward-compat; collection implemented
	modelPicker?: { modality: "image" | "video" | "audio" | "text" };
	onSubmit: (input: NodeComposerSubmit, ctx: NodeUIContext) => void | Promise<void>;
}

interface NodeComposerSubmit {
	prompt: string;
	params: Record<string, unknown>; // only the keys declared in composer.controls
	refs: string[]; // ids of incoming-edge source nodes
	model?: { providerId: string; model: string };
}
```

The composer renders as a single column:

1. `prompt` textarea (unless `prompt === false` for no-prompt composer).
2. Each `controls` row — same `SettingControl` types as Part A.
3. `modelPicker` — provider + model dropdowns (filters by modality in the picker).
4. Submit button.

`params` is **only the keys you declared** — a node may hold other `data` (the toolbar's params, gen results) that the plugin didn't expect in its submit handler. So:

```ts
// declared controls: [{ key: "count" }, { key: "guidance" }]   →
// onSubmit receives: { params: { count, guidance } }              (no leakage of
// other node.data fields)
```

`refs` defaults to `[]` for the common case where the plugin doesn't need them. Built-in style-preset / asset-reference slots are coupled to the image/video composer's private infra; plugin nodes use the simpler convention "predecessors in the canvas graph" (incoming-edge source ids). Authoring code that needs more can do its own work via the live `__POLYCREATOR_PLUGIN_HOST__` bridge (see below).

## `NodeUIContext` — what callbacks receive

```ts
interface NodeUIContext {
	node: unknown; // CanvasNode from the host
	update: (patch: Record<string, unknown>) => void;
	selected: boolean;
	job?: { id: string; status: string; progress?: number };
	refs?: string[]; // predecessor ids; pre-computed
}
```

- `node` is opaque (`unknown`) so plugin authors can read whatever they want, and the host doesn't have to re-export the full `CanvasNode` type.
- `update` is a thin wrapper over `canvas.updateNode`; passing `{ data: { foo: 1 } }` merges with the node's existing data.
- `job` is **reserved, not yet populated**. The field is on the type so a future host-side wiring lands without a breaking change, but nothing sets it today — treat it as always `undefined` and track your own job state until this note is removed.
- `refs` is pre-computed from the canvas edges at mount (re-computed on re-render). Plugin authors can read it directly without walking edges themselves.

## The live `__POLYCREATOR_PLUGIN_HOST__` bridge

`CanvasStudio` publishes a small global the host uses to give plugins a live view of canvas state without needing a `PluginHost` reference. `NodePicker` (settings) and `PluginNodeOverlay` (toolbar/composer) both consume it.

```ts
interface PluginHostBridge {
	canvas: {
		getNodes: () => Array<{ id: string; type: string; label: string }>;
		subscribeNodes: (cb: () => void) => () => void;
	};
}
declare global {
	interface Window {
		__POLYCREATOR_PLUGIN_HOST__?: PluginHostBridge;
	}
}
```

The bridge is the right entry point when a plugin needs to read a **live, current** view of canvas state, and it is the only one that works from every window.

`app.canvas.getNodes()` also exists, but it is only wired in the window that owns the canvas (CanvasStudio). Every window loads every enabled plugin, so in the settings window, the asset library, or any panel window, `app.canvas` is a no-op stub and `getNodes()` returns `undefined`. Use it only in code you know runs on the canvas (a toolbar `action`, a composer `onSubmit`); anywhere else, go through the bridge and handle its absence.

## Worked example: a plugin node with toolbar + composer

Putting it all together — a plugin-defined image-generation node that the user wires up from a settings tab, then runs from the canvas:

```ts
import {
	PolycreatorPlugin,
	PluginSettingTab,
	type NodeUIContext,
	type NodeComposerSubmit,
	type SettingDefinitionItem,
} from "@polycreator/plugin-sdk";

const PREFIX = "example.mock-image:";

interface MySettings extends Record<string, unknown> {
	apiKey: string;
	defaultCount: number;
}

export default class MockImagePlugin extends PolycreatorPlugin {
	override async onload(): Promise<void> {
		this.settings = await this.loadSettings<MySettings>({
			apiKey: "",
			defaultCount: 1,
		});
		this.addSettingTab(new MySettingsTab(this.app, this));

		// 1. Register the node type (the host schema).
		this.app.canvas.registerNodeDef({
			type: `${PREFIX}node`,
			label: "Mock Image",
			icon: "Image",
			// ...
		});

		// 2. Register the floating toolbar + composer for that type.
		this.addNodeUI([`${PREFIX}node`], {
			toolbar: [
				{
					type: "button",
					id: "config",
					label: "设置",
					icon: "Settings",
					action: () => this.app.ui.openModal(this.configModal()),
				},
				{ type: "separator" },
				{
					type: "params",
					id: "preset",
					label: () => "预设",
					controls: [
						{
							type: "dropdown",
							key: "preset",
							defaultValue: "fast",
							options: { fast: "快速", hq: "高质量" },
						},
						{ type: "slider", key: "guidance", min: 1, max: 20, defaultValue: 7 },
					],
				},
			],
			composer: {
				prompt: { placeholder: "描述你想生成的图像…", multiline: true },
				controls: [{ type: "number", key: "count", min: 1, max: 4, defaultValue: 1 }],
				modelPicker: { modality: "image" },
				onSubmit: (input, ctx) => this.runGen(input, ctx),
			},
		});
	}

	private async runGen(input: NodeComposerSubmit, ctx: NodeUIContext) {
		const payload = {
			prompt: input.prompt,
			model: input.model,
			n: input.params.count,
			guidance: input.params.guidance,
		};
		// The composer ref-slot (refs) carries the ids of nodes connected into
		// this one — pass them to the backend as style presets if your
		// implementation supports it.
		if (input.refs.length > 0) {
			const data = (ctx.node as { data?: Record<string, unknown> }).data ?? {};
			ctx.update({ data: { ...data, lastRefs: input.refs } });
		}
		// Enqueue. Track completion yourself — `ctx.job` is reserved but not
		// populated yet (see the NodeUIContext section).
		void this.app.ai.generateImage(payload);
	}

	private configModal() {
		// `Modal` class with `onOpen`/`onClose` lives in the same package.
		// See ./plugin-settings.md for the Modal/Menu section.
		/* ... */
	}
}

class MySettingsTab extends PluginSettingTab {
	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: "API Key", control: { type: "secret", key: "apiKey" } },
			{ name: "默认数量", control: { type: "number", key: "defaultCount", min: 1, max: 4 } },
		];
	}
}
```

That's the full surface. The plugin never touches DOM coordinates, viewport math, or window-positioning — all of that is the host's job, identical for every plugin type.

## What the host does (so you know what NOT to write)

- Renders the floating toolbar with `position: fixed`, centred on the node's bounding box, clamped to stay on-canvas, with a top-edge flip guard.
- Renders the composer below the node, with a measured height so the canvas can `focusNode` to make sure both panels fit the visible area.
- Re-evaluates `visible` / `disabled` predicates on every render and after `update()`.
- Subscribes to plugin enable / disable events, removing the toolbar/composer on disable.
- Bridges the live canvas nodes via `__POLYCREATOR_PLUGIN_HOST__` for plugin-side consumers like `NodePicker`.
- Computes `ctx.refs` from incoming edges at mount.

## What you should NOT do (because the host already does)

- Don't set inline `style={{ left, top }}` on the panels — the host positions.
- Don't `addEventListener("click", onClose)` to close popovers — the host handles outside-click and Escape.
- Don't write your own React reconciliation for the toolbar — pass the items, the host orders them.
- Don't add the plugin id prefix to your toolbar/composer ids — `unregisterNodeUIByPlugin` matches on `manifest.id`, not on prefix.
- Don't re-render the whole overlay on every node-data change — the host's `PluginNodeOverlay` is keyed by `singleSelectedNode.id` and only remounts when selection changes.

## Reference

- **SDK source**: `src/{node-ui,node-v2,modal,menu,component}.ts`
- **Settings counterpart**: [`./plugin-settings.md`](./plugin-settings.md)
- **Runnable example**: the [`plugin-template`](https://github.com/poly-creator/plugin-template) repository.

## Next

- **B3 — migrate built-in node composers to declarative.** `NodeInteractionOverlay` currently branches on `isImageNode` / `isVideoNode` / `isAudioNode` / `isTextNode` to build composers inline. The plan is to extract each branch's `SettingControl` definitions into a separate module, register them as built-in contributions via `registerNodeUI`, and let the overlay shrink to a near-no-op. Same pattern your plugin uses; no built-in-specific runtime. The first branch to migrate is image — once that's done, the rest fall out mechanically.
- **D decision — can plugins extend built-in nodes?** Currently `hasNodeUI(type)` only returns true for a plugin's own registrations. A follow-up decision is whether a plugin should be able to _add_ toolbar items to a built-in `image` node, and how to merge multiple plugin contributions for the same type.
