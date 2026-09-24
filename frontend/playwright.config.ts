import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testIgnore: "cutover.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:3108", browserName: "chromium", channel: "chrome", viewport: { width: 390, height: 844 }, trace: "retain-on-failure" },
  webServer: [
    { command: "node tests/mock-supabase.cjs", url: "http://127.0.0.1:15439/health", reuseExistingServer: false },
    { command: "npm run dev -- --hostname 127.0.0.1 --port 3108", url: "http://127.0.0.1:3108/login", reuseExistingServer: false, timeout: 120_000,
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:15439", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-key", SUPABASE_SERVICE_ROLE_KEY: "local-test-service-key", VERCEL_ENV: "development", ALLOW_REAL_EMAIL: "0", RESEND_API_KEY: "re_invalid_local_test_key", RESEND_TEST_TO: "local@example.invalid", DEEPSEEK_API_KEY: "", NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3108" } },
  ],
});
