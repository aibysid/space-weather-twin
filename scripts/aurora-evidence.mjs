import { readFile, writeFile } from "node:fs/promises";
import { adapt } from "../src/adapters.ts";
import { auroraGridLookup } from "../src/science.ts";
const d = JSON.parse(await readFile("tests/fixtures/aurora.json")),
  a = adapt("aurora", d.raw, d.retrievedAtUtc).aurora;
const coordinates = [
  [180, 60],
  [179, 60],
  [0, 90],
  [0, -90],
  [120, -60],
];
const evidence = {
  verifiedAtUtc: new Date().toISOString(),
  adapter: "noaa-v1",
  method: "aurora-nearest-cell-v1",
  sourceUrl: d.sourceUrl,
  retrievedAtUtc: d.retrievedAtUtc,
  comparisons: coordinates.map(([lon, lat]) => {
    const raw = d.raw.coordinates.find((c) => c[0] === lon && c[1] === lat),
      lookup = auroraGridLookup(a.grid, lat, lon);
    if (!raw || lookup?.value !== raw[2]) throw Error("Cell mismatch");
    return { raw, normalizedLookup: lookup };
  }),
};
await writeFile(
  "docs/aurora-validation.json",
  JSON.stringify(evidence, null, 2),
);
console.log("Five raw NOAA coordinates match");
