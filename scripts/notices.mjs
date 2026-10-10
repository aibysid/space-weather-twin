import { readFile, writeFile, readdir } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json")),
  blocks = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || meta.dev) continue;
  try {
    const files = await readdir(path),
      name = path.replace("node_modules/", "");
    let found = false;
    for (const file of files.filter((x) =>
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(x),
    )) {
      blocks.push(
        `${name} ${meta.version}\n${await readFile(path + "/" + file, "utf8")}`,
      );
      found = true;
    }
    if (!found)
      blocks.push(
        `${name} ${meta.version} — license metadata: ${meta.license}; see upstream package contents.`,
      );
  } catch {
    /* Optional platform package not installed. */
  }
}
await writeFile(
  "public/assets/THIRD_PARTY_LICENSES.txt",
  blocks.join("\n\n" + "=".repeat(70) + "\n\n"),
);
