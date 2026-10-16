import { describe, expect, it, vi } from "vitest";
import type { PluginHost } from "./host.ts";
import {
	isSettingGroup,
	PluginSettingTab,
	resolvePredicate,
	type SettingDefinitionItem,
	SettingTab,
} from "./settings.ts";

const APP = {} as PluginHost;

function makeOwner(settings?: Record<string, unknown>) {
	return {
		settings: settings as unknown,
		saveSettings: vi.fn(async () => {}),
	};
}

class Tab extends PluginSettingTab {
	defs: SettingDefinitionItem[] = [];
	override getSettingDefinitions(): SettingDefinitionItem[] {
		return this.defs;
	}
}

describe("resolvePredicate", () => {
	it("falls back when the predicate is absent", () => {
		expect(resolvePredicate(undefined, true)).toBe(true);
		expect(resolvePredicate(undefined, false)).toBe(false);
	});

	it("passes literals through and calls function forms", () => {
		expect(resolvePredicate(false, true)).toBe(false);
		expect(resolvePredicate(() => false, true)).toBe(false);
		expect(resolvePredicate(() => true, false)).toBe(true);
	});
});

describe("isSettingGroup", () => {
	it("distinguishes groups from plain rows", () => {
		expect(isSettingGroup({ type: "group", heading: "A" })).toBe(true);
		expect(isSettingGroup({ name: "A", control: { type: "toggle", key: "a" } })).toBe(false);
	});
});

describe("SettingTab", () => {
	it("update caches getSettingDefinitions and notifies the host", () => {
		class Bare extends SettingTab {
			override getSettingDefinitions(): SettingDefinitionItem[] {
				return [{ name: "row" }];
			}
		}
		const tab = new Bare(APP);
		const onChange = vi.fn();
		tab._setChangeListener(onChange);
		expect(tab.settingItems).toEqual([]);
		tab.update();
		expect(tab.settingItems).toEqual([{ name: "row" }]);
		expect(onChange).toHaveBeenCalledOnce();
	});

	it("update on an unregistered tab is a pure cache refresh", () => {
		class Bare extends SettingTab {
			override getSettingDefinitions(): SettingDefinitionItem[] {
				return [{ name: "row" }];
			}
		}
		const tab = new Bare(APP);
		expect(() => tab.update()).not.toThrow();
		expect(tab.settingItems).toHaveLength(1);
	});

	it("refreshDomState notifies data-change subscribers (not def-change)", () => {
		const tab = new Tab(APP, makeOwner());
		const onDefChange = vi.fn();
		const onDataChange = vi.fn();
		tab._setChangeListener(onDefChange);
		tab.onDataChange(onDataChange);
		tab.refreshDomState();
		expect(onDataChange).toHaveBeenCalledOnce();
		expect(onDefChange).not.toHaveBeenCalled();
	});

	it("base getControlValue/setControlValue are inert", async () => {
		class Bare extends SettingTab {}
		const tab = new Bare(APP);
		expect(tab.getControlValue("x")).toBeUndefined();
		await expect(Promise.resolve(tab.setControlValue("x", 1))).resolves.toBeUndefined();
	});
});

describe("PluginSettingTab", () => {
	it("getControlValue reads plugin.settings", () => {
		const owner = makeOwner({ baseUrl: "https://x.test" });
		const tab = new Tab(APP, owner);
		expect(tab.getControlValue("baseUrl")).toBe("https://x.test");
	});

	it("getControlValue returns undefined for a missing key or absent settings", () => {
		expect(new Tab(APP, makeOwner({})).getControlValue("nope")).toBeUndefined();
		expect(new Tab(APP, makeOwner()).getControlValue("nope")).toBeUndefined();
	});

	it("setControlValue mutates plugin.settings and persists", async () => {
		const owner = makeOwner({ auto: false });
		const tab = new Tab(APP, owner);
		await tab.setControlValue("auto", true);
		expect((owner.settings as Record<string, unknown>).auto).toBe(true);
		expect(owner.saveSettings).toHaveBeenCalledOnce();
	});

	it("setControlValue creates the settings bag when the plugin never loaded one", async () => {
		const owner = makeOwner();
		const tab = new Tab(APP, owner);
		await tab.setControlValue("concurrency", 4);
		expect(owner.settings).toEqual({ concurrency: 4 });
		expect(owner.saveSettings).toHaveBeenCalledOnce();
	});

	it("exposes the host as app", () => {
		const tab = new Tab(APP, makeOwner());
		expect(tab.app).toBe(APP);
	});
});

describe("data-change fan-out (A2.1)", () => {
	it("refresh() with no loadSettings still notifies subscribers", () => {
		const tab = new Tab(APP, makeOwner());
		const fn = vi.fn();
		const off = tab.onDataChange(fn);
		tab.refresh();
		expect(fn).toHaveBeenCalledOnce();
		off();
		tab.refresh();
		expect(fn).toHaveBeenCalledOnce();
	});

	it("refresh() re-pulls via owner.loadSettings and then notifies", async () => {
		// SettingsOwner.loadSettings is generic (`<T extends object>(defaults: T)
		// => Promise<T>`); vi.fn() erases generic signatures in its Mock<T>
		// wrapper, so this mock is a plain generic function (the refresh() state
		// assertions below prove it ran with the right defaults and its return
		// was applied — no spy needed).
		const loadSettings = async <T extends object>(defaults: T): Promise<T> =>
			({ ...(defaults as object), auto: true }) as T;
		const owner = { settings: { auto: false }, saveSettings: vi.fn(), loadSettings };
		const tab = new Tab(APP, owner);
		const fn = vi.fn();
		tab.onDataChange(fn);
		await tab.refresh();
		expect((owner.settings as Record<string, unknown>).auto).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});
});

describe("refreshDomState does not rebuild settingItems (P2-B)", () => {
	it("preserves the settingItems array reference across refreshDomState calls", () => {
		const tab = new (class extends PluginSettingTab {
			override getSettingDefinitions() {
				return [{ name: "row" }];
			}
		})(APP, makeOwner());
		tab.update();
		const ref = tab.settingItems;
		tab.refreshDomState();
		expect(tab.settingItems).toBe(ref);
		tab.refreshDomState();
		expect(tab.settingItems).toBe(ref);
	});

	it("update() DOES rebuild settingItems (the contrast)", () => {
		const tab = new (class extends PluginSettingTab {
			override getSettingDefinitions() {
				return [{ name: "row" }];
			}
		})(APP, makeOwner());
		tab.update();
		const ref = tab.settingItems;
		tab.update();
		expect(tab.settingItems).not.toBe(ref);
	});
});
