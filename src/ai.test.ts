/**
 * Type-level pin for the AI job-read surface: a plugin that enqueues an async
 * generation job (enqueueJob → jobId) must be able to read the settled job
 * (progress/error/result) via `getJob` — the `done` event alone only carries
 * status, not the generated assets.
 */
import { expectTypeOf, it } from "vitest";
import type { AIGenJob, AIGenJobResult, AIHost } from "./host.ts";

it("AIHost.getJob returns the full job record", () => {
	expectTypeOf<Parameters<AIHost["getJob"]>[0]>().toEqualTypeOf<string>();
	expectTypeOf<ReturnType<AIHost["getJob"]>>().toEqualTypeOf<Promise<AIGenJob | undefined>>();
});

it("AIGenJob exposes status/progress/error and the generated-asset result", () => {
	expectTypeOf<AIGenJob["status"]>().toEqualTypeOf<
		"queued" | "active" | "completed" | "failed" | "unknown"
	>();
	expectTypeOf<AIGenJob["result"]>().toEqualTypeOf<AIGenJobResult | undefined>();
	expectTypeOf<AIGenJobResult["assetUrls"]>().toEqualTypeOf<string[] | undefined>();
	expectTypeOf<AIGenJobResult["fileIds"]>().toEqualTypeOf<string[] | undefined>();
	expectTypeOf<AIGenJobResult["modelId"]>().toEqualTypeOf<string | undefined>();
});
