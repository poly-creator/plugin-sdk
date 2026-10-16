/**
 * Component — the lifecycle base class every long-lived plugin object extends.
 *
 * A parent holds children, and unloading the parent cascades — cleanups, DOM
 * listeners, intervals, and child components all tear down in one
 * deterministic step. Without it every plugin hand-rolls its own bookkeeping
 * and leaks whatever it forgets.
 *
 * Pure logic, zero DOM, no host dependency — safe to inline into a plugin
 * bundle (plugins bundle the SDK; see examples/sticky-note/rolldown.config.mjs).
 *
 * `PolycreatorPlugin` extends this. See
 * docs/superpowers/specs/2026-08-04-plugin-settings-api-design.md §3 D3.
 */
import type { Unsubscribe } from "./host.ts";

/** A teardown callback registered via {@link Component.register}. */
export type RegisteredCleanup = () => unknown;

export class Component {
	/**
	 * Whether `load()` has run and `unload()` has not. Protected rather than
	 * private because `PolycreatorPlugin` is constructed already-live by the loader
	 * (there is no separate `load()` call in the plugin lifecycle) and has to
	 * set it directly — otherwise `addChild` would refuse to load children.
	 */
	protected _loaded = false;

	private children: Component[] = [];
	private cleanups: RegisteredCleanup[] = [];

	/** Load this component and its children. Idempotent. */
	load(): void {
		if (this._loaded) return;
		this._loaded = true;
		this.onload();
		for (const child of this.children) child.load();
	}

	/** Override to initialise. Called once by `load()`. */
	onload(): void {}

	/**
	 * Unload this component: `onunload()`, then every registered cleanup and
	 * child. Idempotent — teardown clears its own bookkeeping as it goes.
	 */
	unload(): void {
		if (!this._loaded) return;
		this._loaded = false;
		this.onunload();
		this.teardown();
	}

	/** Override to clean up beyond what `register*` already covers. */
	onunload(): void {}

	/**
	 * Run every registered cleanup + unload every child, WITHOUT calling
	 * `onunload()`.
	 *
	 * Exists because the plugin runtime already calls `instance.onunload()`
	 * itself before draining the host cleanup stack (registry.ts `disable`), so
	 * a plugin routes its teardown here to avoid running `onunload()` twice.
	 * Safe to call repeatedly: both lists are drained, not just iterated.
	 */
	protected teardown(): void {
		// Reverse order: later registrations often depend on earlier ones.
		const cleanups = this.cleanups;
		this.cleanups = [];
		for (let i = cleanups.length - 1; i >= 0; i--) {
			try {
				cleanups[i]?.();
			} catch (err) {
				console.error("[plugin-sdk] cleanup threw during unload:", err);
			}
		}
		const children = this.children;
		this.children = [];
		for (let i = children.length - 1; i >= 0; i--) {
			try {
				children[i]?.unload();
			} catch (err) {
				console.error("[plugin-sdk] child unload threw:", err);
			}
		}
	}

	/** Add a child component, loading it if this component is already loaded. */
	addChild<T extends Component>(component: T): T {
		if (this.children.includes(component)) return component;
		this.children.push(component);
		if (this._loaded) component.load();
		return component;
	}

	/** Remove a child component, unloading it. */
	removeChild<T extends Component>(component: T): T {
		const i = this.children.indexOf(component);
		if (i !== -1) this.children.splice(i, 1);
		component.unload();
		return component;
	}

	/** Register a callback to run on unload. */
	register(cb: RegisteredCleanup): void {
		this.cleanups.push(cb);
	}

	/** Register a host subscription handle to be released on unload. */
	registerEvent(unsubscribe: Unsubscribe): void {
		this.register(unsubscribe);
	}

	/** Register a DOM listener to be detached on unload. */
	registerDomEvent<K extends keyof WindowEventMap>(
		el: Window,
		type: K,
		callback: (ev: WindowEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	registerDomEvent<K extends keyof DocumentEventMap>(
		el: Document,
		type: K,
		callback: (ev: DocumentEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (ev: HTMLElementEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	registerDomEvent(
		el: Window | Document | HTMLElement,
		type: string,
		callback: (ev: never) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void {
		const listener = callback as EventListener;
		el.addEventListener(type, listener, options);
		this.register(() => el.removeEventListener(type, listener, options));
	}

	/**
	 * Register a timer id (from `setInterval`) to be cleared on unload. Returns
	 * the id so it can be inlined:
	 * `this.registerInterval(setInterval(fn, 1000))`.
	 *
	 * Clears via the global `clearInterval` rather than `window.clearInterval`
	 * — the SDK is bundled into plugins and also type-checked/tested outside a
	 * DOM, where `window` is undefined.
	 */
	registerInterval(id: number): number {
		this.register(() => clearInterval(id));
		return id;
	}
}
