import { defineConfig } from "vitest/config";

// The SDK's tests are mostly type-level assertions (`expectTypeOf`) plus a set
// of pure runtime checks, so node is enough. In the source monorepo they run
// through the app's vitest project; this file is what makes them runnable here,
// by anyone, with only what this repository contains.
export default defineConfig({
	test: {
		name: "plugin-sdk",
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
