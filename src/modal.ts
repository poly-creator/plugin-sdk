/**
 * Modal — Obsidian-style base class for plugin dialogs.
 *
 * `app.ui.openModal({ title, render })` covers one-off dialogs. A class makes
 * the lifecycle first-class: a plugin extends `Modal`, fills `contentEl` from
 * `onOpen()`, and calls `open()` / `close()`.
 *
 * The class is a THIN wrapper over the existing host modal slot — it does not
 * own a backdrop, an Escape listener, or a close button, because
 * `PluginModalHost` already provides all three. Duplicating them here is how
 * the first draft ended up attaching a second `keydown` listener on every
 * `open()` and latching `closed = true` so a modal could never be reopened.
 * The host is the single owner of "is a modal showing"; this class just
 * describes one.
 *
 * See docs/superpowers/specs/2026-08-04-plugin-settings-api-design.md §6 A3.1.
 */
import type { PluginHost } from "./host.ts";

export interface ModalOptions {
	title: string;
	width?: number | string;
	/** Optional class applied to the content element. */
	contentCls?: string;
}

export abstract class Modal {
	/** Assigned by the subclass constructor (see `ConfirmationModal`). */
	declare readonly app: PluginHost;
	readonly title: string;
	readonly width?: number | string;
	/**
	 * The element a plugin populates. The host mounts this node inside its
	 * dialog chrome, so anything appended here (before or during `onOpen`)
	 * shows up in the modal.
	 */
	readonly contentEl: HTMLElement = document.createElement("div");

	constructor(opts: ModalOptions) {
		this.title = opts.title;
		this.width = opts.width;
		if (opts.contentCls) this.contentEl.className = opts.contentCls;
	}

	/** Populate `this.contentEl`. Called by the host when the modal mounts. */
	onOpen(): void {}

	/** Release anything `onOpen` acquired. Called when the host unmounts it. */
	onClose(): void {}

	/** Show the modal. Idempotent — the host holds at most one modal. */
	open(): void {
		this.app.ui.openModal(this);
	}

	/** Hide the modal. Safe to call when it is not showing. */
	close(): void {
		this.app.ui.closeModal();
	}
}

/**
 * A two-button confirmation dialog. `await modal.result` for the answer:
 * `true` for confirm, `false` for cancel — including when the user dismisses
 * via Escape, the backdrop, or the close button, so a caller awaiting the
 * promise never hangs.
 */
export class ConfirmationModal extends Modal {
	readonly result: Promise<boolean>;
	private resolveRef!: (value: boolean) => void;
	private settled = false;

	constructor(
		app: PluginHost,
		title: string,
		message: string,
		opts: { cta?: string; cancelCta?: string; danger?: boolean } = {},
	) {
		super({ title, width: 420, contentCls: "flex flex-col gap-3 text-sm text-foreground" });
		// `app` is `declare`d on the base (so the base constructor can't touch an
		// abstract member); assign it here, after super().
		(this as { app: PluginHost }).app = app;
		this.result = new Promise<boolean>((resolve) => {
			this.resolveRef = resolve;
		});

		const body = document.createElement("p");
		body.textContent = message;
		this.contentEl.appendChild(body);

		const row = document.createElement("div");
		row.className = "flex justify-end gap-2 pt-2";

		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className =
			"shrink-0 cursor-pointer rounded-lg border border-border bg-muted px-3 py-1 text-[11px] text-foreground transition-[color,background-color] duration-150 hover:bg-accent active:scale-[0.96]";
		cancel.textContent = opts.cancelCta ?? "Cancel";
		cancel.addEventListener("click", () => this.settle(false));

		const confirm = document.createElement("button");
		confirm.type = "button";
		confirm.className = opts.danger
			? "shrink-0 cursor-pointer rounded-lg bg-destructive px-3 py-1 text-[11px] text-destructive-foreground transition-[color,background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.96]"
			: "shrink-0 cursor-pointer rounded-lg bg-primary px-3 py-1 text-[11px] text-primary-foreground transition-[color,background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.96]";
		confirm.textContent = opts.cta ?? "Confirm";
		confirm.addEventListener("click", () => this.settle(true));

		row.appendChild(cancel);
		row.appendChild(confirm);
		this.contentEl.appendChild(row);
	}

	/**
	 * Dismissal that did NOT go through a button (Escape / backdrop / the host's
	 * close button) counts as a cancel — otherwise `await modal.result` would
	 * hang forever on the most common way users close a dialog.
	 */
	override onClose(): void {
		this.settle(false);
	}

	private settle(value: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolveRef(value);
		this.close();
	}
}
