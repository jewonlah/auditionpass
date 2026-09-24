import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "cutover.spec.ts",
  testIgnore: [],
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(server => ({
    ...server,
    env: { ...server.env, APPLICATION_SUBMISSIONS_PAUSED: "1" },
  })),
});
