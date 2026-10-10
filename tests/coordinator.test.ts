import { it, expect, vi, afterEach } from "vitest";
import { boundedJson, FetchCoordinator } from "../src/coordinator";
import { readFileSync } from "node:fs";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("classifies HTTP and malformed JSON and enforces response size", async () => {
  await expect(
    boundedJson(new Response("bad", { status: 404 })),
  ).rejects.toThrow("HTTP 404");
  await expect(boundedJson(new Response("bad"))).rejects.toThrow(
    "malformed JSON",
  );
  await expect(
    boundedJson(new Response(new Uint8Array(15000001))),
  ).rejects.toThrow("size limit");
});
it("preserves original snapshot time on network errors", async () => {
  const snap = JSON.parse(readFileSync("tests/fixtures/wind.json", "utf8"));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify(snap))),
  );
  const c = new FetchCoordinator();
  await c.fetch("wind");
  expect(c.states.wind.data?.envelope.transport).toBe("snapshot");
  expect(c.states.wind.data?.envelope.retrievedAtUtc).toBe(snap.retrievedAtUtc);
  expect(c.states.wind.error).toBe("network / CORS suspected");
});
it("preserves last valid cache on 404, rejects empty and schema changes", async () => {
  const snap = JSON.parse(readFileSync("tests/fixtures/wind.json", "utf8"));
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(snap.raw)))
    .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
    .mockResolvedValueOnce(new Response("Not found", { status: 404 }));
  vi.stubGlobal("fetch", f);
  const c = new FetchCoordinator();
  await c.fetch("wind");
  const old = c.states.wind.data;
  await c.fetch("wind");
  expect(c.states.wind.state).toBe("error-with-cache");
  expect(c.states.wind.data).toBe(old);
  for (const raw of [[], {}, [{ active: false }]]) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(raw)))
        .mockResolvedValueOnce(new Response("Not found", { status: 404 })),
    );
    const x = new FetchCoordinator();
    await x.fetch("wind");
    expect(x.states.wind.state).toBe("unavailable");
  }
});
it("scheduler stops while hidden, fetches only due streams and prevents overlap", async () => {
  vi.stubGlobal("document", { hidden: true });
  const f = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", f);
  const c = new FetchCoordinator();
  for (const id of Object.keys(c.states) as (keyof typeof c.states)[])
    c.states[id].next = Date.now() + 999999;
  c.states.wind.next = 0;
  c.tick();
  expect(f).not.toHaveBeenCalled();
  vi.stubGlobal("document", { hidden: false });
  c.tick();
  c.tick();
  expect(f).toHaveBeenCalledTimes(1);
  expect(c.controllers.size).toBe(1);
  c.stop();
});
it("preserves timeout/schema/empty/quality rejection categories when fallback fails", async () => {
  for (const [raw, category] of [
    [null, "timeout"],
    [{}, "schema"],
    [[], "empty"],
    [
      [{ time_tag: "2026-10-10T00:00:00", active: false, proton_speed: 0 }],
      "quality rejection",
    ],
  ] as const) {
    const direct =
      raw === null
        ? Promise.reject(new DOMException("Timed out", "AbortError"))
        : Promise.resolve(new Response(JSON.stringify(raw)));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(direct)
        .mockResolvedValueOnce(new Response("Missing", { status: 404 })),
    );
    const c = new FetchCoordinator();
    await c.fetch("wind");
    expect(c.states.wind.error).toContain(category);
    expect(c.states.wind.state).toBe("unavailable");
  }
});
it("honors Retry-After even if the fallback request fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response("Rate limit", {
          status: 429,
          headers: { "Retry-After": "3600" },
        }),
      )
      .mockResolvedValueOnce(new Response("Missing", { status: 404 })),
  );
  const c = new FetchCoordinator(),
    start = Date.now();
  await c.fetch("wind");
  expect(c.states.wind.next - start).toBeGreaterThanOrEqual(3600000);
});
