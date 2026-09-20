import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "growth.spec.ts",
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(server => ({
    ...server,
    env: { ...server.env, NEXT_PUBLIC_GA_ID: "G-TEST000001", ADMIN_EMAILS: "admin@example.invalid" },
  })),
});
