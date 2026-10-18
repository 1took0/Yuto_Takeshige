import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PW_PORT ?? "3100";
const executablePath = process.env.PW_CHROMIUM ?? (process.platform === "linux" ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 14"],
    // iPhone エミュレーションは WebKit 前提だが、この環境では Chromium で代替する
    defaultBrowserType: "chromium",
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: "only-on-failure",
  },
  webServer: process.env.PW_NO_SERVER
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
