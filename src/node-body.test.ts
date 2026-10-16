// RED: pins the typed custom-node-body contract for registerNodeBody (types land in host.ts in GREEN).
import { describe, expect, it } from "vitest";
import { expectTypeOf } from "vitest";
import type {
	CanvasHost,
	PluginNodeBody,
	PluginNodeBodyNode,
	PluginNodeBodyProps,
	PluginNodeOverlayComponent,
	PluginOverlayProps,
} from "./host.ts";

const body: PluginNodeBody = (props) => {
	const url: string | undefined = props.node.data?.assetUrl as string | undefined;
	return props.selected ? url : null;
};

describe("typed custom node body contract", () => {
	it("registerNodeBody accepts a typed custom node body", () => {
		expectTypeOf<Parameters<CanvasHost["registerNodeBody"]>[1]>().toEqualTypeOf<PluginNodeBody>();
		expectTypeOf<PluginNodeBodyProps["node"]>().toEqualTypeOf<PluginNodeBodyNode>();
		expectTypeOf<PluginNodeBodyProps["node"]["data"]>().toEqualTypeOf<
			Record<string, unknown> | undefined
		>();
	});

	it("body receives the node prop", () => {
		const host = { registerNodeBody: () => {} } as unknown as CanvasHost;
		expect(() => host.registerNodeBody("x", body)).not.toThrow();
	});
});

describe("custom node overlay contract", () => {
	it("CanvasHost.registerNodeOverlay accepts a plugin overlay component", () => {
		expectTypeOf<
			Parameters<CanvasHost["registerNodeOverlay"]>[1]
		>().toEqualTypeOf<PluginNodeOverlayComponent>();
		expectTypeOf<PluginOverlayProps["node"]>().toEqualTypeOf<PluginNodeBodyNode>();
		expectTypeOf<PluginOverlayProps["onUpdate"]>().toEqualTypeOf<
			((patch: Record<string, unknown>) => void) | undefined
		>();
		expectTypeOf<PluginOverlayProps["viewport"]>().toEqualTypeOf<
			{ x: number; y: number; zoom: number } | undefined
		>();
	});
});
