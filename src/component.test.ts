// @vitest-environment jsdom
// The SDK's own vitest project runs in node; this file needs a DOM for the
// registerDomEvent/registerInterval cases.
import { describe, expect, it, vi } from "vitest";
import { Component } from "./component.ts";

class Probe extends Component {
	loads = 0;
	unloads = 0;
	override onload(): void {
		this.loads++;
	}
	override onunload(): void {
		this.unloads++;
	}
}

describe("Component", () => {
	it("load/unload run onload/onunload once each", () => {
		const c = new Probe();
		c.load();
		c.load();
		expect(c.loads).toBe(1);
		c.unload();
		c.unload();
		expect(c.unloads).toBe(1);
	});

	it("unload runs registered cleanups in reverse order", () => {
		const order: string[] = [];
		const c = new Component();
		c.register(() => order.push("first"));
		c.register(() => order.push("second"));
		c.load();
		c.unload();
		expect(order).toEqual(["second", "first"]);
	});

	it("a throwing cleanup does not stop the remaining ones", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const ran = vi.fn();
		const c = new Component();
		c.register(ran);
		c.register(() => {
			throw new Error("boom");
		});
		c.load();
		c.unload();
		expect(ran).toHaveBeenCalledOnce();
		spy.mockRestore();
	});

	it("addChild loads the child when the parent is already loaded", () => {
		const parent = new Component();
		parent.load();
		const child = parent.addChild(new Probe());
		expect(child.loads).toBe(1);
	});

	it("addChild defers loading until the parent loads", () => {
		const parent = new Component();
		const child = parent.addChild(new Probe());
		expect(child.loads).toBe(0);
		parent.load();
		expect(child.loads).toBe(1);
	});

	it("unloading the parent cascades to children", () => {
		const parent = new Component();
		const child = new Probe();
		const grandchild = new Probe();
		child.addChild(grandchild);
		parent.addChild(child);
		parent.load();
		parent.unload();
		expect(child.unloads).toBe(1);
		expect(grandchild.unloads).toBe(1);
	});

	it("removeChild unloads the child and detaches it from the cascade", () => {
		const parent = new Component();
		const child = new Probe();
		parent.addChild(child);
		parent.load();
		parent.removeChild(child);
		expect(child.unloads).toBe(1);
		parent.unload();
		expect(child.unloads).toBe(1);
	});

	it("addChild is idempotent for the same instance", () => {
		const parent = new Component();
		const child = new Probe();
		parent.addChild(child);
		parent.addChild(child);
		parent.load();
		parent.unload();
		expect(child.unloads).toBe(1);
	});

	it("registerDomEvent detaches the listener on unload", () => {
		const el = document.createElement("div");
		const handler = vi.fn();
		const c = new Component();
		c.registerDomEvent(el, "click", handler);
		c.load();
		el.dispatchEvent(new MouseEvent("click"));
		expect(handler).toHaveBeenCalledOnce();
		c.unload();
		el.dispatchEvent(new MouseEvent("click"));
		expect(handler).toHaveBeenCalledOnce();
	});

	it("registerInterval clears the interval on unload and returns the id", () => {
		vi.useFakeTimers();
		const tick = vi.fn();
		const c = new Component();
		// Asserted as pass-through rather than `typeof id === "number"`: under
		// fake timers the id is whatever the shim hands back, which is not our
		// contract to test.
		const raw = setInterval(tick, 10) as unknown as number;
		expect(c.registerInterval(raw)).toBe(raw);
		c.load();
		vi.advanceTimersByTime(30);
		const calls = tick.mock.calls.length;
		expect(calls).toBeGreaterThan(0);
		c.unload();
		vi.advanceTimersByTime(50);
		expect(tick.mock.calls.length).toBe(calls);
		vi.useRealTimers();
	});

	it("registerEvent releases the subscription handle on unload", () => {
		const unsub = vi.fn();
		const c = new Component();
		c.registerEvent(unsub);
		c.load();
		c.unload();
		expect(unsub).toHaveBeenCalledOnce();
	});
});
