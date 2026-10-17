# @polycreator/plugin-sdk

[![npm](https://img.shields.io/npm/v/@polycreator/plugin-sdk)](https://www.npmjs.com/package/@polycreator/plugin-sdk)
[![CI](https://github.com/poly-creator/plugin-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/poly-creator/plugin-sdk/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-signed-blue?logo=npm)](https://www.npmjs.com/package/@polycreator/plugin-sdk)

Plugin SDK for **PolyCreator** — types and a base
class for building third-party renderer plugins.

> The base class is spelled **`PolycreatorPlugin`** (lower-case `c`) while the
> product is **PolyCreator**. That is deliberate: the class is published API —
> every existing plugin does `extends PolycreatorPlugin` and imports it by name —
> so it only moves in a breaking release, together with the plugin template and
> the author guide. Don't "fix" the casing in passing.

A PolyCreator plugin is a folder the user drops into `userData/plugins/<id>/`. It
declares a `manifest.json` + a renderer entry (an ESM bundle) that
default-exports a class extending `PolycreatorPlugin`. Inside `onload()` the
plugin receives a `PluginHost` (`app.*`) and registers extension points:
toolbar buttons, commands, context menu items, settings tabs, modals,
canvas event subscriptions, custom node defs, agents, providers.

## Install

```sh
pnpm add @polycreator/plugin-sdk
```

The `main`/`types` point at the compiled `dist/`; the package ships `.js`

- `.d.ts` for both `default` and `types` ESM conditions.

## Quick start

```ts
import { PolycreatorPlugin, CANVAS_EVENTS } from "@polycreator/plugin-sdk";

export default class MyPlugin extends PolycreatorPlugin {
	override async onload(): Promise<void> {
		// Subscribe to canvas events
		const off = this.app.canvas.on(CANVAS_EVENTS.nodeCreated, (node) => {
			this.app.logger.info(`node added: ${(node as { id: string }).id}`);
		});
		this.register(off); // auto-cleanup on unload

		// Register a toolbar button
		this.app.ui.registerToolbarButton({
			id: "myplugin:hello",
			icon: "Wand2",
			label: "Hello",
			onClick: () => this.app.ui.notify("hello from my plugin"),
		});
	}
}
```

## Docs

- [Plugin settings](https://github.com/poly-creator/plugin-sdk/blob/main/docs/plugin-settings.md) — declarative tabs and controls (`SettingTab`, `SettingControl`), rendered by the host with its own styling.
- [Plugin node UI](https://github.com/poly-creator/plugin-sdk/blob/main/docs/plugin-node-ui.md) — the floating toolbar above a node and the composer below it.
- [Template](https://github.com/poly-creator/plugin-template) — a minimal plugin to start from, including the release workflow that produces the three assets the registry expects.

## Build

`src/` compiles to `dist/` (what `main`/`types`/`exports` point at):

```sh
pnpm install
pnpm run build
```

`prepublishOnly` runs `clean + build` before a publish, and `pnpm test` runs the
type-level and runtime suite.

## Trust tiers

`manifest.trust: "safe"` puts the plugin on a structural subset of the host
(`SafePluginHost`): `system`, `provider`, and `workspace` are absent from
the runtime object. The SDK exports the narrower interface so you can
declare your plugin's `app` against it and the compiler catches any attempt
to touch the missing surfaces. The canvas read methods
(`getNodes`/`getEdges`/`getViewport`/`selection.*`) and `ai.generateText`
(used by `agent.invoke`) remain available; canvas mutation methods
(`addNode`/`updateNode`/...) reject at runtime.

## License

MIT — see [LICENSE](./LICENSE).
