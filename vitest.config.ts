import { defineConfig } from "vitest/config";

export default defineConfig({
  root: process.cwd(),
  resolve: { alias: { "@": process.cwd() } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], coverage: { reporter: ["text", "html"] } },
});
