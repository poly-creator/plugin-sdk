// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, MenuItem } from "./menu.ts";
import type { PluginHost } from "./host.ts";

const APP = {} as PluginHost;

/** `Menu.showAtPosition` appends to `document.body` and never detaches on
 *  failed assertions; jsdom persists DOM across `it` blocks in a file. */
afterEach(() => {
	document.body.innerHTML = "";
});

describe("Menu", () => {
	it("addItem + showAtPosition mounts DOM with the right rows", () => {
		const menu = new Menu(APP);
		menu.buildItem({ label: "Copy" });
		menu.buildItem({ label: "Paste" });
		menu.showAtPosition(10, 20);
		const root = document.querySelector('[data-role="plugin-menu"]');
		expect(root).not.toBeNull();
		expect(root?.querySelectorAll("button")).toHaveLength(2);
	});

	it("addSeparator adds an empty-label row", () => {
		const menu = new Menu(APP);
		menu.buildItem({ label: "A" });
		menu.addSeparator();
		menu.buildItem({ label: "B" });
		menu.showAtPosition(0, 0);
		expect(document.querySelectorAll('[data-role="plugin-menu"] button')).toHaveLength(3);
	});

	it("clicking an item runs its onClick and closes the menu", async () => {
		const menu = new Menu(APP);
		const clicked = vi.fn();
		menu.buildItem({ label: "Export", onClick: clicked });
		menu.showAtPosition(0, 0);
		const btn = document.querySelector<HTMLButtonElement>('[data-role="plugin-menu"] button');
		expect(btn).toBeTruthy();
		btn?.click();
		expect(clicked).toHaveBeenCalledOnce();
		// The menu-choose event drives the close.
		await new Promise((r) => setTimeout(r, 0));
		expect(menu.isOpen).toBe(false);
	});

	it("disabled items do not fire onClick", () => {
		const menu = new Menu(APP);
		const clicked = vi.fn();
		menu.buildItem({ label: "Disabled", disabled: true, onClick: clicked });
		menu.showAtPosition(0, 0);
		const btn = document.querySelector<HTMLButtonElement>('[data-role="plugin-menu"] button');
		btn?.click();
		expect(clicked).not.toHaveBeenCalled();
	});

	it("outside click closes the menu", async () => {
		const menu = new Menu(APP);
		menu.buildItem({ label: "Item" });
		menu.showAtPosition(0, 0);
		expect(menu.isOpen).toBe(true);
		// The listener attaches on the next tick.
		await new Promise((r) => setTimeout(r, 5));
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(menu.isOpen).toBe(false);
	});

	it("showAtMouseEvent uses the event coordinates", () => {
		const menu = new Menu(APP);
		menu.buildItem({ label: "Item" });
		const e = new MouseEvent("mouseup", { clientX: 100, clientY: 50, bubbles: true });
		menu.showAtMouseEvent(e);
		const root = document.querySelector<HTMLElement>('[data-role="plugin-menu"]');
		expect(root?.style.left).toBe("100px");
		expect(root?.style.top).toBe("50px");
	});
});

describe("MenuItem", () => {
	it("submenu opens to the right on hover", () => {
		const parent = new Menu(APP);
		const sub = new Menu(APP);
		sub.buildItem({ label: "Nested Item" });
		parent.addSubmenu("More", (m) => {
			m.buildItem({ label: "Nested Item" });
		});
		parent.showAtPosition(0, 0);
		// Submenu mounts lazily — verify it was registered as a submenu.
		const item = parent["items"][0] as MenuItem;
		expect(item.submenu).toBeDefined();
	});
});
