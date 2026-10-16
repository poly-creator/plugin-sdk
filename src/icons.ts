/**
 * icons — lucide-react icons re-exported for plugins.
 *
 * Plugins cannot `import react` or `import lucide-react` directly (the
 * renderer is sandboxed); they build UI with `window.PolyCreator.React`. Icons
 * are the one exception that DOES re-export a third-party component library:
 * the SDK bundles lucide-react and rolldown inlines the used icons into the
 * plugin's main.js at build time (the SDK is aliased to its TS source).
 *
 * Only the icons PolyCreator plugins actually use are re-exported here — importing
 * the whole lucide-react barrel from a plugin would drag in every icon. Add an
 * icon here when a plugin needs it.
 */
export {
	AlertCircle,
	ArrowUp,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	Download,
	Ellipsis,
	Info,
	Languages,
	Layers2,
	Link2,
	Maximize2,
	Mic,
	Minimize2,
	Music,
	Play,
	RotateCw,
	Send,
	Settings2,
	Upload,
	Volume2,
	Wand2,
	X,
} from "lucide-react";
