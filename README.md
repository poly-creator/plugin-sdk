# @polycreator/plugin-sdk

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

## Build

The package is built from the workspace `src/` to `dist/`:

```sh
pnpm --filter @polycreator/plugin-sdk build
```

`prepublishOnly` runs `clean + build` before `pnpm publish`.

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
