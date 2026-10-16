/**
 * Menu + MenuItem — Obsidian-style context menus that can be shown on demand.
 *
 * The V1.1 host exposes `app.ui.registerContextMenu(item)` for adding items
 * to the canvas right-click menu. That covers "extend the existing menu",
 * but not "open a brand new menu at the user's click" — Obsidian solves it
 * with `new Menu(app).addItem(...).showAtMouseEvent(e)` etc. We mirror that.
 *
 * A Menu is built once (typically in `onload`) and shown on demand from
 * a host event (`mouseup` on a toolbar button, etc.). Items can nest
 * submenus via `setSubmenu()`; the menu auto-closes on item click and on
 * outside click.
 *
 * See docs/superpowers/specs/2026-08-04-plugin-settings-api-design.md §6 A3.2.
 */
import type { PluginHost } from "./host.ts";

/** Where the menu was opened — `mouseup` handler passes the event in. */
export interface MouseEventLike {
	readonly clientX: number;
	readonly clientY: number;
	preventDefault?: () => void;
}

export interface MenuItemOptions {
	/** Visible label. Use ` ` for a separator entry that ignores other fields. */
	label: string;
	/** Optional icon (Lucide icon name). */
	icon?: string;
	/** Disabled state — shows greyed and ignores click. */
	disabled?: boolean;
	/** Checkmark marker — left side of the label. */
	checked?: boolean;
	/** Click handler — fired when the user picks the item. */
	onClick?: () => void | Promise<void>;
	/** Sub-menu — opens to the right when the user hovers this entry. */
	submenu?: Menu;
}

export class MenuItem {
	readonly label: string;
	icon?: string;
	disabled = false;
	checked = false;
	onClick?: () => void | Promise<void>;
	submenu?: Menu;

	constructor(opts: MenuItemOptions) {
		this.label = opts.label;
		this.icon = opts.icon;
		this.disabled = !!opts.disabled;
		this.checked = !!opts.checked;
		this.onClick = opts.onClick;
		this.submenu = opts.submenu;
	}

	/** Build the DOM row. Hosts use this when rendering. */
	render(container: HTMLElement): HTMLElement {
		const row = document.createElement("button");
		row.type = "button";
		row.className =
			"flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] text-foreground transition-[color,background-color] duration-150 hover:bg-accent/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
		row.disabled = this.disabled;
		row.dataset.role = "menu-item";
		if (this.checked) {
			const tick = document.createElement("span");
			tick.textContent = "✓";
			tick.className = "w-3 shrink-0 text-center";
			row.appendChild(tick);
		} else if (this.icon) {
			const icon = document.createElement("span");
			icon.textContent = this.icon;
			icon.className = "w-3 shrink-0 text-center text-muted-foreground";
			row.appendChild(icon);
		} else {
			const spacer = document.createElement("span");
			spacer.className = "w-3 shrink-0";
			row.appendChild(spacer);
		}
		const label = document.createElement("span");
		label.textContent = this.label;
		label.className = "flex-1 text-left";
		row.appendChild(label);
		if (this.submenu) {
			const arrow = document.createElement("span");
			arrow.textContent = "▶";
			arrow.className = "text-muted-foreground";
			row.appendChild(arrow);
		}
		row.addEventListener("click", () => {
			if (this.disabled || !this.onClick) return;
			void Promise.resolve(this.onClick()).finally(() => {
				this.submenu?.close();
				container.dispatchEvent(new CustomEvent("menu-choose", { bubbles: true }));
			});
		});
		row.addEventListener("mouseenter", () => {
			if (!this.submenu) return;
			this.submenu.positionRightOf(row);
		});
		container.appendChild(row);
		return row;
	}
}

/**
 * Menu — a stack of {@link MenuItem} shown on demand at a position.
 *
 * Built with `new Menu(host)`, populated with `addItem`/`addSeparator`/
 * `addSubmenu`, then shown via `showAtMouseEvent` or `showAtPosition`.
 * Auto-closes on outside click and on Escape.
 */
export class Menu {
	private readonly host: PluginHost;
	private readonly items: MenuItem[] = [];
	private root: HTMLDivElement | null = null;
	private onDocClick: ((e: MouseEvent) => void) | null = null;
	private onKey: ((e: KeyboardEvent) => void) | null = null;
	private openSubmenus: Menu[] = [];

	constructor(host: PluginHost) {
		this.host = host;
	}

	addItem(item: MenuItem): this {
		this.items.push(item);
		return this;
	}

	addSeparator(): this {
		this.items.push(new MenuItem({ label: "" }));
		return this;
	}

	/** Convenience: build, attach, and return the new item. */
	buildItem(opts: MenuItemOptions): MenuItem {
		const item = new MenuItem(opts);
		this.items.push(item);
		return item;
	}

	/** Build a submenu (visible only while the parent menu is open). */
	addSubmenu(label: string, build: (sub: Menu) => void): this {
		const sub = new Menu(this.host);
		build(sub);
		this.items.push(new MenuItem({ label, submenu: sub }));
		return this;
	}

	showAtMouseEvent(e: MouseEventLike): void {
		e.preventDefault?.();
		this.showAtPosition(e.clientX, e.clientY);
	}

	showAtPosition(x: number, y: number): void {
		this.close();
		const root = document.createElement("div");
		root.dataset.role = "plugin-menu";
		root.className =
			"fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg";
		root.style.left = `${x}px`;
		root.style.top = `${y}px`;
		for (const item of this.items) item.render(root);
		document.body.appendChild(root);
		this.root = root;
		// Items dispatch `menu-choose` after running their handler — close then.
		root.addEventListener("menu-choose", () => this.close());
		this.onDocClick = (e: MouseEvent) => {
			if (!root.contains(e.target as Node)) this.close();
		};
		this.onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.close();
		};
		// Defer to next tick — otherwise the click that opened us counts as the
		// "outside click" and we close immediately.
		setTimeout(() => document.addEventListener("click", this.onDocClick!), 0);
		document.addEventListener("keydown", this.onKey);
	}

	/** Position an already-open menu to the right of `anchor`. Used by submenus. */
	positionRightOf(anchor: HTMLElement): void {
		if (!this.root) return;
		const rect = anchor.getBoundingClientRect();
		this.root.style.left = `${rect.right}px`;
		this.root.style.top = `${rect.top}px`;
	}

	close(): void {
		for (const sub of this.openSubmenus) sub.close();
		this.openSubmenus = [];
		if (this.onDocClick) document.removeEventListener("click", this.onDocClick);
		if (this.onKey) document.removeEventListener("keydown", this.onKey);
		this.onDocClick = null;
		this.onKey = null;
		if (this.root) {
			this.root.remove();
			this.root = null;
		}
	}

	get isOpen(): boolean {
		return this.root !== null;
	}
}
