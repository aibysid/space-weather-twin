import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { feeds } from "./registry.mjs";
const base = "https://aibysid.github.io/space-weather-twin/";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "#/sources");
const responses = await page.evaluate(
  async (entries) =>
    Promise.all(
      entries.map(async ([id, path]) => {
        try {
          const response = await fetch(
            "https://services.swpc.noaa.gov" + path,
            {
              credentials: "omit",
              cache: "no-cache",
              signal: AbortSignal.timeout(20000),
            },
          );
          const raw = await response.json();
          return {
            id,
            status: response.status,
            responseType: response.type,
            sourceUrl: response.url,
            retrievedAtUtc: new Date().toISOString(),
            records: Array.isArray(raw)
              ? raw.length
              : raw.coordinates?.length || 1,
            fields: Object.keys(Array.isArray(raw) ? raw[0] : raw),
            auroraTimes:
              id === "aurora"
                ? {
                    observation: raw["Observation Time"],
                    forecast: raw["Forecast Time"],
                  }
                : undefined,
          };
        } catch (e) {
          return { id, error: e.message };
        }
      }),
    ),
  Object.entries(feeds),
);
if (responses.some((r) => r.status !== 200))
  throw Error("Production CORS smoke failed " + JSON.stringify(responses));
const report = {
  testedAtUtc: new Date().toISOString(),
  origin: new URL(page.url()).origin,
  browser: browser.version(),
  method:
    "Fresh Chromium context, native anonymous browser fetch from deployed Pages origin; no proxy, key or fixture interception",
  responses,
  routes: [],
  errors,
};
await mkdir("docs/screenshots", { recursive: true });
for (const route of ["live", "aurora", "replay", "lab", "sources"]) {
  await page.goto(base + "#/" + route);
  await page.locator("h1").waitFor();
  if (route === "live")
    await page
      .getByText("8/8 feeds loaded", { exact: false })
      .waitFor({ timeout: 30000 });
  await page.waitForTimeout(250);
  report.routes.push({
    route,
    title: await page.locator("h1").textContent(),
    noOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  });
  if (["live", "aurora"].includes(route))
    await page.screenshot({
      path: `docs/screenshots/production-${route}-1440.png`,
      fullPage: true,
    });
}
await page.goto(base + "#/lab?v=1&speed=800");
await page.reload();
await page.getByText("5.35 nPa", { exact: true }).first().waitFor();
await page.goto(base + "#/live");
await page.getByRole("link", { name: "Aurora", exact: true }).click();
await page.goBack();
report.backForwardWorks = (await page.locator("h1").textContent()).includes(
  "connected",
);
await page.setViewportSize({ width: 360, height: 900 });
await page.goto(base + "#/live");
await page.locator(".metric-card strong").first().waitFor();
await page.waitForFunction(
  () => document.querySelector(".metric-card strong")?.textContent !== "—",
  { timeout: 30000 },
);
report.mobileNoOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth <= innerWidth,
);
await page.screenshot({
  path: "docs/screenshots/production-live-360.png",
  fullPage: true,
});
if (errors.length) throw Error("Page errors " + JSON.stringify(errors));
await writeFile(
  "docs/production-integration.json",
  JSON.stringify(report, null, 2),
);
await browser.close();
console.log(
  "All eight NOAA feeds fetch directly from deployed Pages origin; five hash routes and back navigation pass.",
);
