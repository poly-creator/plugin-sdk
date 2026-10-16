/**
 * Vendor-neutral AI protocol types — the chat-message / tool-calling shapes that
 * cross the plugin → host → adapter boundary. Adapters project these onto each
 * vendor's wire format (OpenAI messages, Anthropic content blocks, Gemini parts).
 *
 * Pure types (no runtime). Dependency-free so the SDK stays importable from both
 * the renderer (`@polycreator/plugin-sdk`) and the main process (`electron/main`)
 * via the tsconfig `paths` mapping.
 */

/** A single content part within a message. Reserved for future multimodal use. */
export type ContentPart =
	| { type: "text"; text: string }
	| { type: "image"; mimeType: string; bytes: Uint8Array };

/**
 * A tool invocation the model emitted (already parsed). `id` is the vendor's
 * correlation id (tool_call_id / tool_use_id / synthesized for Gemini); the host
 * echoes it back on the matching {@link ToolResult} message.
 */
export interface ToolCall {
	id: string;
	name: string;
	/** Parsed object — adapters JSON.parse the vendor payload before returning. */
	args: unknown;
}

/**
 * Vendor-neutral chat message. Mirrors the OpenAI shape (the common
 * denominator); Anthropic/Gemini adapters project it to their wire form.
 */
export interface Message {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	/** Assistant turns only — tool calls the model made this turn. */
	toolCalls?: ToolCall[];
	/** `role:"tool"` only — correlates to the assistant {@link ToolCall.id}. */
	toolCallId?: string;
	/** `role:"tool"` only — which tool produced this result. */
	name?: string;
	/** `role:"tool"` only — marks this result as an error (vendor-specific flag). */
	isError?: boolean;
}

/**
 * Minimal JSON-Schema subset every vendor accepts as a tool parameter schema.
 * Intentionally narrow (no `$ref`/`$defs`/format) — widen keyword-by-keyword only
 * as an adapter rejects one. This is what {@link ToolDeclaration.parameters}
 * and `AgentTool.parameters` carry.
 */
export interface JSONSchema {
	type?: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null";
	description?: string;
	properties?: Record<string, JSONSchema>;
	required?: string[];
	items?: JSONSchema;
	enum?: Array<string | number>;
	additionalProperties?: boolean | JSONSchema;
	[K: string]: unknown;
}

/** What the host tells the model about a callable tool. */
export interface ToolDeclaration {
	name: string;
	description?: string;
	parameters: JSONSchema;
}

/** Result of executing a tool, fed back to the model as a `role:"tool"` message. */
export interface ToolResult {
	toolCallId: string;
	name: string;
	content: string;
	isError?: boolean;
}

/**
 * Return type of text generation. `.text` is ALWAYS present ("" when the model
 * emitted only tool calls) so text-only callers stay source-compatible after
 * reading `.text`.
 */
export interface TextResult {
	text: string;
	/** Present iff the model called a tool this turn. */
	toolCalls?: ToolCall[];
	stopReason?: "stop" | "tool_use" | "length" | "content_filter";
}
