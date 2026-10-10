import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const url =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson";
const r = await fetch(url);
if (!r.ok) throw Error("Geography HTTP " + r.status);
const text = await r.text();
const d = JSON.parse(text);
if (d.type !== "FeatureCollection") throw Error("Invalid geography");
await mkdir("public/assets", { recursive: true });
await writeFile("public/assets/land.json", text);
await writeFile(
  "public/assets/manifest.json",
  JSON.stringify(
    {
      source: "Natural Earth 1:110m land",
      version: "5.1.2",
      url,
      license: "Public domain",
      sha256: createHash("sha256").update(text).digest("hex"),
      retrievedAtUtc: new Date().toISOString(),
    },
    null,
    2,
  ),
);
