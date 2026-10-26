import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The constellation suite runs a real 50-node physics pass; on a loaded CI
    // runner the default 5s timeout can flake even though the test is correct.
    testTimeout: 20_000,
  },
});