import { chromium, firefox, webkit } from "playwright";
import { writeFile } from "node:fs/promises";
const base = process.argv[2] || "http://127.0.0.1:5173/space-weather-twin/";
const report = { testedAtUtc: new Date().toISOString(), base, browsers: [] };
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const result = { name, version: browser.version(), routes: [], errors };
  for (const route of ["live", "aurora", "replay", "lab", "sources"]) {
    await page.goto(base + "#/" + route);
    await page.locator("h1").waitFor();
    await page.waitForTimeout(200);
    result.routes.push({
      route,
      title: await page.locator("h1").textContent(),
      noOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    });
  }
  if (errors.length || result.routes.some((r) => !r.noOverflow))
    throw Error(name + " smoke failed " + JSON.stringify(result));
  report.browsers.push(result);
  await browser.close();
  console.log(name, "five routes passed");
}
await writeFile("docs/cross-browser.json", JSON.stringify(report, null, 2));
