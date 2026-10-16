// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ConfirmationModal, Modal } from "./modal.ts";
import type { PluginHost } from "./host.ts";

const APP = {
	ui: { openModal: vi.fn(), closeModal: vi.fn() },
} as unknown as PluginHost;

class DemoModal extends Modal {
	opens = 0;
	closes = 0;
	constructor() {
		super({ title: "Test Modal", width: 600 });
		// The abstract `app` field is assigned by subclasses after super().
		(this as { app: PluginHost }).app = APP;
	}
	override onOpen(): void {
		this.opens++;
	}
	override onClose(): void {
		this.closes++;
	}
}

describe("Modal", () => {
	it("open() forwards to app.ui.openModal, close() to app.ui.closeModal", () => {
		const m = new DemoModal();
		m.open();
		expect(APP.ui.openModal).toHaveBeenCalledWith(m);
		m.close();
		expect(APP.ui.closeModal).toHaveBeenCalled();
	});

	it("contentEl is the body slot plugins populate", () => {
		const m = new DemoModal();
		const p = document.createElement("p");
		p.textContent = "Hello";
		m.contentEl.appendChild(p);
		expect(m.contentEl.textContent).toBe("Hello");
	});

	it("title + width come from the options", () => {
		const m = new DemoModal();
		expect(m.title).toBe("Test Modal");
		expect(m.width).toBe(600);
	});
});

describe("ConfirmationModal", () => {
	it("confirm resolves true and closes", async () => {
		const m = new ConfirmationModal(APP, "Delete", "Are you sure?", { cta: "Delete" });
		const confirm = m.contentEl.querySelectorAll("button")[1];
		confirm.dispatchEvent(new Event("click"));
		expect(await m.result).toBe(true);
		expect(APP.ui.closeModal).toHaveBeenCalled();
	});

	it("cancel resolves false", async () => {
		const m = new ConfirmationModal(APP, "Delete", "Are you sure?");
		m.contentEl.querySelectorAll("button")[0].dispatchEvent(new Event("click"));
		expect(await m.result).toBe(false);
	});

	it("onClose (dismissal via Escape/backdrop) resolves as cancel", async () => {
		const m = new ConfirmationModal(APP, "Delete", "Are you sure?");
		// The host calls onClose for non-button dismissals.
		m.onClose();
		expect(await m.result).toBe(false);
	});

	it("settling twice does not double-resolve", async () => {
		const m = new ConfirmationModal(APP, "Delete", "Are you sure?");
		m.contentEl.querySelectorAll("button")[1].dispatchEvent(new Event("click"));
		const first = await m.result;
		// A late onClose (e.g. host teardown) must not reject or throw.
		m.onClose();
		expect(first).toBe(true);
	});
});
