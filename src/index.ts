/**
 * @polycreator/plugin-sdk — types + base class for third-party PolyCreator plugins.
 * See docs/superpowers/specs/2026-07-31-plugin-system-design.md.
 *
 * This barrel is RENDERER-FACING: `component.ts` types `registerDomEvent`
 * against the DOM lib, so importing it from electron main (which compiles
 * with `lib: ["ES2023"]`) fails. Main-process code should import the narrow
 * subpath it actually needs — `@polycreator/plugin-sdk/ai` for the AI types.
 */
export * from "./host.ts";
export * from "./ai.ts";
export * from "./settings.ts";
export * from "./modal.ts";
export * from "./menu.ts";
export * from "./node-ui.ts";
export * from "./node-v2.ts";
export * from "./voice.ts";
export * from "./icons.ts";
export { Component, type RegisteredCleanup } from "./component.ts";
export { PolycreatorPlugin, type PluginConstructor } from "./base.ts";
