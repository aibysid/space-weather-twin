import { writeFile, mkdir } from "node:fs/promises";
import { feeds } from "./registry.mjs";
const report = {
  testedAtUtc: new Date().toISOString(),
  method: "Node anonymous fetch; deployed browser origin checked separately",
  feeds: [],
};
for (const [id, path] of Object.entries(feeds)) {
  try {
    const r = await fetch("https://services.swpc.noaa.gov" + path, {
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    const raw = JSON.parse(text);
    report.feeds.push({
      id,
      url: r.url,
      status: r.status,
      cors: r.headers.get("access-control-allow-origin"),
      bytes: Buffer.byteLength(text),
      recordCount: Array.isArray(raw)
        ? raw.length
        : raw.coordinates?.length || 1,
      fields: Object.keys(Array.isArray(raw) ? raw[0] : raw),
      statuses:
        id === "forecast"
          ? [...new Set(raw.map((x) => x.observed))]
          : undefined,
    });
    console.log(id, r.status);
  } catch (e) {
    report.feeds.push({ id, error: e.message });
  }
}
await mkdir("docs", { recursive: true });
await writeFile("docs/integration.json", JSON.stringify(report, null, 2));
