import { defineConfig } from "vitest/config";
import path from "path";

const emptyModule = path.resolve(__dirname, "./vitest.empty-module.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only / client-only throw when imported outside Next's RSC/client
      // build; alias to a no-op so server modules that import them (e.g. the
      // HARDEN-01 fence on the service-role client) stay testable in vitest.
      "server-only": emptyModule,
      "client-only": emptyModule,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
