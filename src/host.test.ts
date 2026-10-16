/**
 * Type-level pin for the script / project / storyboard host surfaces.
 * Each test asserts the SDK exposes the shape plugin authors will program
 * against — if any of these break, downstream plugin examples lose
 * compile-time enforcement.
 */
import { expectTypeOf, it } from "vitest";
import type {
	PluginHost,
	ProjectHost,
	ScriptsHost,
	StoryboardHost,
	StoryboardComponentsHost,
	StoryboardComponentName,
	PluginCategory,
	PluginPermission,
	PluginManifest,
} from "./host.ts";

it("PluginHost exposes project / scripts / storyboard (trusted-tier only)", () => {
	expectTypeOf<PluginHost["project"]>().toEqualTypeOf<ProjectHost>();
	expectTypeOf<PluginHost["scripts"]>().toEqualTypeOf<ScriptsHost>();
	expectTypeOf<PluginHost["storyboard"]>().toEqualTypeOf<StoryboardHost>();
});

it("ScriptsHost.parse returns a row id + result", () => {
	expectTypeOf<ScriptsHost["parse"]>().toEqualTypeOf<
		(input: {
			projectId: string;
			rawText: string;
			schemaId?: string;
			modelId?: string;
		}) => Promise<{ id: string; result: unknown }>
	>();
});

it("ProjectHost.shots.set writes a per-scene override", () => {
	expectTypeOf<ProjectHost["shots"]["set"]>().toEqualTypeOf<
		(input: { projectId: string; sceneId: string; shots: unknown }) => Promise<unknown>
	>();
});

it("ProjectHost.ai.resegmentSceneShots returns shots from a per-scene re-split", () => {
	expectTypeOf<ProjectHost["ai"]["resegmentSceneShots"]>().toEqualTypeOf<
		(input: { projectId: string; sceneId: string; body: string }) => Promise<{ shots: unknown }>
	>();
});

it("StoryboardHost.on('shot:produced') emits typed payloads", () => {
	expectTypeOf<Parameters<StoryboardHost["on"]>[0]>().toEqualTypeOf<"shot:produced">();
	expectTypeOf<Parameters<StoryboardHost["on"]>[1]>().toEqualTypeOf<
		(payload: {
			shotId: string;
			kind: "image" | "video";
			assetUrl: string;
			createdAt: number;
		}) => void
	>();
});

it("StoryboardHost.addVariants appends values to a shot's variants slot", () => {
	expectTypeOf<StoryboardHost["addVariants"]>().toEqualTypeOf<
		(input: {
			projectId: string;
			key: string;
			values: unknown[];
		}) => Promise<Record<string, unknown>>
	>();
});

it("PluginCategory includes 'script'", () => {
	expectTypeOf<"script">().toMatchTypeOf<PluginCategory>();
});

it("PluginManifest.permissions uses the strict PluginPermission union", () => {
	const m: PluginManifest = {
		id: "x",
		name: "x",
		version: "0",
		main: "x.js",
		permissions: ["storyboard.write", "scripts.parse"],
	};
	// `permissions` is optional, so the element type has to come through
	// NonNullable — indexing the union directly is TS2537, not a type error the
	// assertion was ever meant to express.
	expectTypeOf<NonNullable<typeof m.permissions>[number]>().toEqualTypeOf<PluginPermission>();
});

it("PluginHost exposes storyboardComponents as a typed lookup", () => {
	expectTypeOf<PluginHost["storyboardComponents"]>().toEqualTypeOf<StoryboardComponentsHost>();
});

it("StoryboardComponentsHost.resolve narrows to the canonical name union", () => {
	const name: StoryboardComponentName = "ShotsPane";
	expectTypeOf<StoryboardComponentsHost["resolve"]>().toEqualTypeOf<
		(name: StoryboardComponentName) => unknown
	>();
	void name;
});

it("StoryboardComponentsHost.list returns readonly tuple of canonical names", () => {
	expectTypeOf<StoryboardComponentsHost["list"]>().toEqualTypeOf<
		() => readonly StoryboardComponentName[]
	>();
});
