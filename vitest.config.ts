import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@kootha/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@kootha/shared/": path.resolve(__dirname, "packages/shared/src/")
    }
  }
});
