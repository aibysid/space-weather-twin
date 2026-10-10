import { baseline, normalizeUtc } from "./science";
import { metrics } from "./registry";
export interface Scenario {
  speed: number;
  density: number;
  bz: number;
  cme: number;
  launch: number;
}
export function shareState(search: string) {
  const p = new URLSearchParams(search.slice(0, 3000)),
    errors: string[] = [];
  const number = (key: string, lo: number, hi: number, fallback: number) => {
    if (!p.has(key)) return fallback;
    const n = Number(p.get(key));
    if (!p.get(key)?.trim() || !Number.isFinite(n) || n < lo || n > hi) {
      errors.push(`Invalid ${key}`);
      return fallback;
    }
    return n;
  };
  const history = p.get("history") || "may2024";
  const cursor = p.get("cursor");
  const time = cursor ? normalizeUtc(cursor) : null;
  if (cursor && time === null) errors.push("Invalid cursor");
  if (p.has("v") && p.get("v") !== "1")
    errors.push("Unsupported share version");
  return {
    errors,
    metric: Object.keys(metrics).includes(p.get("metric") || "")
      ? p.get("metric")!
      : "speed",
    hemisphere: p.get("hemisphere") === "south" ? "south" : "north",
    lat: number("lat", -90, 90, 28.6139),
    lon: number("lon", -180, 180, 77.209),
    history: ["may2024", "halloween2003", "quiet2024", "recent"].includes(
      history,
    )
      ? history
      : "may2024",
    cursor: time,
    range: number("range", 2, 24, 24),
    version: p.get("version") || "1.0.0",
    scenario: {
      speed: number("speed", 200, 2000, baseline.speed),
      density: number("density", 0.1, 100, baseline.density),
      bz: number("bz", -50, 50, baseline.bz),
      cme: number("cme", 200, 3000, baseline.cme),
      launch: number(
        "launch",
        Date.UTC(1900, 0, 1),
        Date.UTC(2101, 0, 1) - 1,
        Math.floor(Date.now() / 60000) * 60000,
      ),
    },
  };
}
export function serializeShare(
  route: string,
  state: Record<string, string | number>,
) {
  const p = new URLSearchParams({ v: "1" });
  for (const [key, v] of Object.entries(state)) p.set(key, String(v));
  return `${location.origin}${location.pathname}#/${route}?${p}`;
}
