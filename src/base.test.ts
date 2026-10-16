import { describe, expect, it, vi } from "vitest";
import { PolycreatorPlugin } from "./base.ts";
import { Component } from "./component.ts";
import type { PluginHost, PluginManifest } from "./host.ts";
import { PluginSettingTab, type SettingDefinitionItem } from "./settings.ts";

const MANIFEST: PluginManifest = {
	id: "test-plugin",
	name: "Test Plugin",
	version: "1.0.0",
	main: "main.js",
	trust: "safe",
};

function makeUi() {
	return {
		notify: vi.fn(),
		registerCommand: vi.fn(),
		registerStyle: vi.fn(),
		registerToolbarButton: vi.fn(),
		registerPanel: vi.fn(),
		registerContextMenu: vi.fn(),
		registerSettingsTab: vi.fn(),
		registerShortcut: vi.fn(),
		openModal: vi.fn(),
	};
}

function makeHost(overrides: Partial<PluginHost> = {}): PluginHost {
	const host = {
		registerCleanup: vi.fn(),
		storage: {
			load: vi.fn(),
			save: vi.fn(),
		},
		ui: makeUi(),
		...overrides,
	} as unknown as PluginHost;
	return host;
}

class TestPlugin extends PolycreatorPlugin {
	override async onload(): Promise<void> {}
	/** `prefixId` is protected; expose it for the prefix assertions. */
	publicPrefix(id: string): string {
		return this.prefixId(id);
	}
}

describe("PolycreatorPlugin", () => {
	it("stores the manifest and host injected by the loader", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		expect(plugin.manifest).toBe(MANIFEST);
	});

	it("loadData delegates to app.storage.load", async () => {
		const host = makeHost();
		(host.storage.load as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
		const plugin = new TestPlugin(MANIFEST, host);
		await expect(plugin.loadData<{ count: number }>()).resolves.toEqual({ count: 1 });
		expect(host.storage.load).toHaveBeenCalledOnce();
	});

	it("saveData delegates to app.storage.save", async () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		await plugin.saveData({ count: 2 });
		expect(host.storage.save).toHaveBeenCalledWith({ count: 2 });
	});

	it("register pushes cleanup callbacks to the host", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		const cleanup = () => {};
		plugin.register(cleanup);
		expect(host.registerCleanup).toHaveBeenCalledWith(cleanup);
	});

	it("onunload is a no-op by default", () => {
		const plugin = new TestPlugin(MANIFEST, makeHost());
		expect(() => plugin.onunload()).not.toThrow();
	});
});

describe("PolycreatorPlugin lifecycle (Component)", () => {
	it("is a Component and is live from construction", () => {
		const plugin = new TestPlugin(MANIFEST, makeHost());
		expect(plugin).toBeInstanceOf(Component);
		// Live means addChild loads immediately rather than deferring forever.
		class Child extends Component {
			loaded = 0;
			override onload(): void {
				this.loaded++;
			}
		}
		const child = plugin.addChild(new Child());
		expect(child.loaded).toBe(1);
	});

	it("registers a host cleanup that tears down children without re-running onunload", () => {
		const host = makeHost();
		const cleanups: Array<() => void> = [];
		(host.registerCleanup as ReturnType<typeof vi.fn>).mockImplementation((fn: () => void) =>
			cleanups.push(fn),
		);
		let pluginUnloads = 0;
		class P extends PolycreatorPlugin {
			override async onload(): Promise<void> {}
			override onunload(): void {
				pluginUnloads++;
			}
		}
		class Child extends Component {
			unloads = 0;
			override onunload(): void {
				this.unloads++;
			}
		}
		const plugin = new P(MANIFEST, host);
		const child = plugin.addChild(new Child());

		// Mirror the runtime: onunload() first, then drain the host cleanup stack.
		plugin.onunload();
		for (const fn of cleanups) fn();

		expect(pluginUnloads).toBe(1);
		expect(child.unloads).toBe(1);
	});
});

describe("PolycreatorPlugin settings", () => {
	it("loadSettings merges stored data over defaults and assigns this.settings", async () => {
		const host = makeHost();
		(host.storage.load as ReturnType<typeof vi.fn>).mockResolvedValue({ auto: true });
		const plugin = new TestPlugin(MANIFEST, host);
		const settings = await plugin.loadSettings({ auto: false, baseUrl: "" });
		expect(settings).toEqual({ auto: true, baseUrl: "" });
		expect(plugin.settings).toEqual({ auto: true, baseUrl: "" });
	});

	it("loadSettings falls back to defaults when nothing is stored", async () => {
		const host = makeHost();
		(host.storage.load as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const plugin = new TestPlugin(MANIFEST, host);
		await expect(plugin.loadSettings({ n: 1 })).resolves.toEqual({ n: 1 });
	});

	it("saveSettings persists this.settings", async () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		plugin.settings = { n: 3 };
		await plugin.saveSettings();
		expect(host.storage.save).toHaveBeenCalledWith({ n: 3 });
	});

	it("saveSettings writes an empty object when settings were never loaded", async () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		await plugin.saveSettings();
		expect(host.storage.save).toHaveBeenCalledWith({});
	});

	it("a PluginSettingTab round-trips through the plugin's storage", async () => {
		const host = makeHost();
		(host.storage.load as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const plugin = new TestPlugin(MANIFEST, host);
		await plugin.loadSettings({ concurrency: 2 });

		class Tab extends PluginSettingTab {
			override getSettingDefinitions(): SettingDefinitionItem[] {
				return [{ name: "Concurrency", control: { type: "number", key: "concurrency" } }];
			}
		}
		const tab = new Tab(host, plugin);
		expect(tab.getControlValue("concurrency")).toBe(2);
		await tab.setControlValue("concurrency", 5);
		expect(host.storage.save).toHaveBeenCalledWith({ concurrency: 5 });
	});
});

describe("PolycreatorPlugin contribution helpers", () => {
	it("prefixes contribution ids with the plugin id", () => {
		const plugin = new TestPlugin(MANIFEST, makeHost());
		expect(plugin.publicPrefix("do-thing")).toBe("test-plugin:do-thing");
	});

	it("does not double-prefix an already-prefixed id", () => {
		const plugin = new TestPlugin(MANIFEST, makeHost());
		expect(plugin.publicPrefix("test-plugin:do-thing")).toBe("test-plugin:do-thing");
	});

	it("addCommand registers a prefixed command and returns it", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		const action = () => {};
		const cmd = plugin.addCommand({ id: "run", title: "Run", action });
		expect(cmd.id).toBe("test-plugin:run");
		expect(host.ui.registerCommand).toHaveBeenCalledWith({
			id: "test-plugin:run",
			title: "Run",
			action,
		});
	});

	it("addToolbarButton / addPanel / addContextMenuItem / addShortcut all prefix", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		expect(plugin.addToolbarButton({ id: "b", onClick: () => {} }).id).toBe("test-plugin:b");
		expect(plugin.addPanel({ id: "p", title: "P", render: () => null }).id).toBe("test-plugin:p");
		expect(plugin.addContextMenuItem({ id: "c", label: "C", action: () => {} }).id).toBe(
			"test-plugin:c",
		);
		expect(plugin.addShortcut({ id: "s", name: "S", key: "Ctrl+J", action: () => {} }).id).toBe(
			"test-plugin:s",
		);
	});

	it("addSettingTab fills a prefixed id, the manifest name, and primes settingItems", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		class Tab extends PluginSettingTab {
			override getSettingDefinitions(): SettingDefinitionItem[] {
				return [{ name: "row" }];
			}
		}
		const tab = plugin.addSettingTab(new Tab(host, plugin));
		expect(tab.id).toBe("test-plugin:settings");
		expect(tab.label).toBe("Test Plugin");
		expect(tab.settingItems).toEqual([{ name: "row" }]);
		expect(host.ui.registerSettingsTab).toHaveBeenCalledWith(tab);
	});

	it("addSettingTab keeps an explicit id/label but still prefixes the id", () => {
		const host = makeHost();
		const plugin = new TestPlugin(MANIFEST, host);
		class Tab extends PluginSettingTab {}
		const tab = new Tab(host, plugin);
		tab.id = "advanced";
		tab.label = "Advanced";
		plugin.addSettingTab(tab);
		expect(tab.id).toBe("test-plugin:advanced");
		expect(tab.label).toBe("Advanced");
	});
});

describe("addNodeUI (Part B contribution helper)", () => {
	it("forwards to app.registerNodeUI with the types verbatim", () => {
		const registerNodeUI = vi.fn();
		const host = makeHost({ registerNodeUI } as unknown as Partial<PluginHost>);
		const plugin = new TestPlugin(MANIFEST, host);
		const contribution = { toolbar: [] };
		plugin.addNodeUI(["test-plugin:node"], contribution);
		expect(registerNodeUI).toHaveBeenCalledWith(["test-plugin:node"], contribution);
	});

	it("does NOT prefix node types — they must match registerNodeDef exactly", () => {
		const registerNodeUI = vi.fn();
		const host = makeHost({ registerNodeUI } as unknown as Partial<PluginHost>);
		const plugin = new TestPlugin(MANIFEST, host);
		// An unprefixed type stays unprefixed: it is a lookup key, not an id the
		// host sweeps by prefix.
		plugin.addNodeUI(["bare-type"], { toolbar: [] });
		expect(registerNodeUI).toHaveBeenCalledWith(["bare-type"], { toolbar: [] });
	});
});
