/**
 * Voice picker → MiniMax voice-id mapping.
 *
 * Ported verbatim from
 * `apps/desktop/src/features/canvas-studio/generation/voice-catalog.ts` —
 * the host's single source of truth for turning the overlay's voice model
 * picker label (a Chinese display name) into a real MiniMax voice id that
 * the TTS adapter can send as `voice_setting.voice_id`. Exposed as a pure
 * ESM export so plugin TTS / audio nodes can resolve the same labels
 * without re-porting the catalog (audio-node-demo v3 had to inline this
 * to ship parity — see INFEASIBLE-NODES.md).
 *
 * Pure + deterministic — no host state, no IPC. Plugin code can:
 *
 * ```ts
 * import { VOICE_CATALOG, resolveVoiceId } from "@polycreator/plugin-sdk";
 * const voiceId = resolveVoiceId(node.data.voice); // "云希男声" → "male-qn-qingse"
 * const opts = VOICE_CATALOG.map(v => ({ value: v.label, label: v.label }));
 * ```
 *
 * If the catalog ever needs to come from the host (vendor switch, remote
 * list, etc.) the same surface can move to `app.tts.voiceCatalog()` +
 * `app.tts.resolveVoiceId()` — the data shape here is the wire contract.
 */
export type VoiceOption = {
	/** What the overlay picker shows and writes into node.data.voice. */
	label: string;
	/** What the MiniMax adapter sends as voice_setting.voice_id. */
	id: string;
};

export const VOICE_CATALOG: readonly VoiceOption[] = [
	{ label: "云希男声", id: "male-qn-qingse" },
	{ label: "晓晓女声", id: "female-shaonv" },
	{ label: "旁白大叔", id: "presenter_male" },
];

/** Fallback when the stored voice is absent, unknown, or not a TTS voice. */
export const DEFAULT_VOICE_ID = "male-qn-qingse";

const labelToId = new Map(VOICE_CATALOG.map((v) => [v.label, v.id]));
const knownIds = new Set(VOICE_CATALOG.map((v) => v.id));

/**
 * Resolve whatever the UI stored into a valid MiniMax voice id.
 *
 *  · a known label ("云希男声")              → its id
 *  · an already-valid id ("male-qn-qingse") → returned as-is (forward-compat:
 *    a future caller or imported board may already store ids)
 *  · empty / unknown / "AI music"           → DEFAULT_VOICE_ID (never send a bad id)
 *
 * Pure + deterministic so it is unit-testable without touching the adapter.
 */
export function resolveVoiceId(stored: string | undefined): string {
	if (!stored) return DEFAULT_VOICE_ID;
	const byLabel = labelToId.get(stored);
	if (byLabel) return byLabel;
	if (knownIds.has(stored)) return stored;
	return DEFAULT_VOICE_ID;
}
