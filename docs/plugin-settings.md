# Plugin Settings

The PolyCreator plugin SDK declares plugin settings declaratively — the host renders them into the app's Settings Modal using the app's own styling, and handles storage, defaults, validation, and disable predicates in the framework. The plugin author writes data; the host draws it.

> **Types**: `SettingTab` and `SettingControl` (`src/settings.ts`); the same control shape is reused by the node composer (`src/node-v2.ts`).

## Quick start

```ts
import {
	PolycreatorPlugin,
	PluginSettingTab,
	type SettingDefinitionItem,
} from "@polycreator/plugin-sdk";

export default class MyPlugin extends PolycreatorPlugin {
	override async onload(): Promise<void> {
		this.settings = await this.loadSettings({
			baseUrl: "",
			auto: false,
			concurrency: 2,
		});
		this.addSettingTab(new MySettingsTab(this.app, this));
	}
}

class MySettingsTab extends PluginSettingTab {
	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "API 地址",
				desc: "留空使用默认端点",
				control: {
					type: "text",
					key: "baseUrl",
					validate: (v) => (v && !v.startsWith("http") ? "必须是 http(s) 地址" : undefined),
				},
			},
			{ name: "自动生成", control: { type: "toggle", key: "auto" } },
			{
				name: "并发数",
				control: {
					type: "slider",
					key: "concurrency",
					min: 1,
					max: 8,
					disabled: () => !this.plugin.settings?.auto,
				},
			},
		];
	}
}
```

That's the whole API. No React, no `loadData/saveData`, no DOM builder.

## Controls

| Type       | Value                   | Notes                                                         |
| ---------- | ----------------------- | ------------------------------------------------------------- |
| `toggle`   | `boolean`               | On/off switch.                                                |
| `text`     | `string`                | Single-line input.                                            |
| `textarea` | `string`                | Multi-line. `rows` controls initial height.                   |
| `number`   | `number`                | `min`/`max`/`step`. Empty box is unset (not `0`).             |
| `dropdown` | `string`                | `options: Record<value, label>`.                              |
| `slider`   | `number`                | `min`/`max` required, `step` optional.                        |
| `color`    | `string`                | Hex.                                                          |
| `secret`   | `string`                | Masked input. Routed through the encrypted store (see below). |
| `model`    | `{ providerId, model }` | Provider + model picker. Requires configured providers.       |
| `node`     | `string`                | Canvas node id. Optional `nodeTypes: string[]` filter.        |

Common fields on every control (`SettingControlBase`):

- `key` — the property name in `plugin.settings`. Required.
- `defaultValue` — used when stored value is `undefined`/`null`.
- `validate(value)` — return a non-empty string to reject the edit; the row shows the string inline without persisting.
- `disabled` — boolean or `() => boolean`. Re-evaluated on every render.

## Validation

`validate` runs at three times:

1. **Mount** — against the stored value (or `defaultValue`). Surface errors from older plugin versions immediately.
2. **On every edit** — return a string to reject and show the message; return nothing to accept and persist.
3. **Re-mounted after refresh** — when another window writes to this tab's data (see _Cross-window sync_ below).

A rejected value **stays in the input box** so the user can correct it. Discarding what they typed would make the message impossible to act on.

## Disable / visible predicates

Both are functions `() => boolean`. They re-run on every render and after `update()`. Use them to chain settings:

```ts
{ name: "并发数",
  control: { type: "slider", key: "n", min: 1, max: 8,
             disabled: () => !this.plugin.settings?.auto } }
```

The runtime does NOT call `update()` for you after every write — render-side `commit` triggers a re-render, which is enough to re-evaluate the predicate. If your predicate depends on something else (a network fetch, a timer), call `tab.update()` manually.

## Storage

`loadSettings(defaults)` merges `defaults` over the stored object and assigns the result to `this.settings`. `saveSettings()` writes `this.settings` back to disk.

Default merging is **shallow**. Nested objects are replaced wholesale rather than deep-merged — a deep merge would make it impossible for a user to drop a key that exists in a nested default.

```ts
const DEFAULTS = { theme: "dark", notifications: { sound: true, badge: true } };
// stored: { theme: "light", notifications: { badge: false } }
// merged: { theme: "light", notifications: { badge: false } }   ← sound dropped!
```

If you need nested merging, override `getControlValue`/`setControlValue` on a custom `SettingTab` (without extending `PluginSettingTab`).

## Encrypted secrets (`secret` control)

`secret` controls **do not** write to `plugin-data/<id>.json`. They route through the encrypted store at `plugin-data/<id>/secrets.json` (safeStorage-encrypted on macOS/Windows; base64 fallback on Linux without safeStorage).

The input is rendered as `type="password"` and shows the placeholder `••••••••••` when a value is already saved — the plaintext is **never** displayed. To overwrite, type a new value and save. To clear, type an empty string.

```ts
{ name: "API Token", desc: "至少 16 字符",
  control: { type: "secret", key: "apiToken",
             validate: v => v && v.length < 16 ? "至少 16 字符" : undefined } }
```

`registerProvider` plugins can also expose `ctx.settings.getSecret("apiKey")` from the main-process factory — see _Plugin-side secrets in main-process_ below.

## Cross-window sync

PolyCreator opens settings in a dedicated window (`?window=settings`) alongside the canvas. Edits in one window propagate to the other.

How it works:

1. `dataSet`/`storeSet` IPC handlers write to disk.
2. The main process broadcasts `polycreator:plugin:data-changed` to every window.
3. The renderer's `bridge.ts` subscribes to the broadcast and fans it out to registered `SettingTab`s.
4. Each tab's `refresh()` runs: by default, the `PluginSettingTab` calls `plugin.loadSettings` (if available) to re-pull from disk, then notifies subscribers.
5. The `PluginSettingsRenderer` re-renders, and each control re-seeds from the new stored value.

If your tab reads from somewhere other than `plugin.settings`, override `refresh()`:

```ts
override refresh(): void {
  void this.fetchRemote().then((next) => {
    this.plugin.settings = next;
    super.refresh();
  });
}
```

## `Component` lifecycle

`PolycreatorPlugin extends Component` (Obsidian parity). Use `addChild` to own helpers, `registerDomEvent` / `registerInterval` to auto-clean, and `onload`/`onunload` hooks for setup/teardown.

```ts
class MyPlugin extends PolycreatorPlugin {
	override async onload() {
		const handle = setInterval(() => this.tick(), 1000);
		this.registerInterval(handle);
		this.registerDomEvent(window, "resize", () => this.relayout());
	}
	override onunload() {
		// Child components, intervals, and DOM listeners are torn down for you.
	}
}
```

The runtime calls `instance.onunload()` first, then drains the cleanup stack. Don't rely on `onunload` for listener detachment — register via `Component` instead.

## Auto-prefixed contributions

`addCommand`, `addSettingTab`, `addToolbarButton`, `addPanel`, `addContextMenuItem`, and `addShortcut` all prefix their id with `<pluginId>:` automatically. **Don't** pre-prefix in your code; double-prefixing is a no-op, but un-prefixed ids cause orphaned UI on disable.

## Modal / Menu (A3.1, A3.2)

The `Modal` base class gives you `onOpen`/`onClose` hooks and a `contentEl` to populate; `ConfirmationModal` is the common confirm dialog. `Menu` lets you build an on-demand context menu with `showAtMouseEvent(e)` and sub-menus via `addSubmenu`.

```ts
import { Modal, Menu, ConfirmationModal } from "@polycreator/plugin-sdk";

// `app` and `title` are set in the constructor; `contentEl` is where you draw.
class HelloModal extends Modal {
	constructor(app: import("@polycreator/plugin-sdk").PluginHost) {
		super({ title: "Hello", width: 400 });
		(this as { app: typeof app }).app = app;
	}
	override onOpen() {
		this.contentEl.textContent = "你好";
	}
}
// `open()` forwards to app.ui.openModal; the host mounts contentEl.

async function confirmDelete(app: import("@polycreator/plugin-sdk").PluginHost) {
	const modal = new ConfirmationModal(app, "删除", "确定？", {
		cta: "删除",
		danger: true,
	});
	modal.open();
	// `result` resolves true (confirm) or false (cancel / dismiss). Never hangs.
	return await modal.result;
}
```

Modal/Menu are pure DOM helpers — they're inlined into the plugin bundle and don't require the React global.

## Plugin-side secrets in main-process (A2.5)

A `node-entry.cjs` plugin's provider factories receive `ctx.settings` if the provider was contributed by this plugin:

```js
// node-entry.cjs
module.exports = {
	providers: {
		mock: {
			image: (ctx, model) => {
				return async (req) => {
					const baseUrl = await ctx.settings.get("baseUrl");
					const apiKey = await ctx.settings.getSecret("apiKey");
					// ...
				};
			},
		},
	},
};
```

`ctx.settings.get(key)` reads from `plugin-data/<id>.json` (your settings, plain). `ctx.settings.getSecret(key)` reads from `plugin-data/<id>/secrets.json` (decrypted). Uninstall wipes both.

## Full reference

- **SDK source**: `src/{settings,component,modal,menu}.ts`
- **Node UI counterpart**: [`./plugin-node-ui.md`](./plugin-node-ui.md) — the same declarative `SettingControl` shape drives the floating toolbar popover and the composer below a node; the host owns positioning, viewport math, and cross-window sync.
- **Runnable example**: the [`plugin-template`](https://github.com/poly-creator/plugin-template) repository (a minimal plugin with settings, a toolbar button and a palette command).
