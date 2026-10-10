import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { coordinator, type FeedState } from "./coordinator";
import {
  feeds,
  metrics,
  definitions,
  cities,
  type FeedId,
  type Metric,
} from "./registry";
import { series, eligible, type Sample, type Normalized } from "./adapters";
import {
  utc,
  nearestPastSample,
  calculatePressure,
  calculateSouthwardProxy,
  calculateTransport,
  calculateCmeScenario,
  baseline,
  compression,
  auroraGridLookup,
  methods,
  replayClock,
  matchMagnetic,
} from "./science";
import { shareState, serializeShare, type Scenario } from "./share";
import { exportSerializers, download, screenshot } from "./exports";
import { Chart } from "./Chart";
import { Schematic, PolarMap, LocationContext, bins } from "./Visuals";
import "./styles.css";
const Scene = lazy(() => import("./Scene"));
const feedFor: Record<Metric, FeedId> = {
  speed: "wind",
  density: "wind",
  temperature: "wind",
  bt: "mag",
  bz: "mag",
  xray: "xray",
  proton: "proton",
  kp: "kp",
};
const historicalLabels: Record<string, string> = {
  may2024: "May 2024 storm observations",
  halloween2003: "October 2003 storm observations",
  quiet2024: "Early May 2024 comparison window",
  recent: "Recent loaded observations",
};
const fmt = (v: number | null | undefined, m: Metric) =>
  v == null
    ? "—"
    : m === "xray"
      ? v.toExponential(2)
      : m === "proton"
        ? v.toPrecision(3)
        : m === "kp"
          ? v.toFixed(2)
          : ["density", "bt", "bz"].includes(m)
            ? v.toFixed(1)
            : Math.round(v).toLocaleString("en-US");
class SceneBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function App() {
  const location = useLocation(),
    navigate = useNavigate(),
    route = location.pathname.slice(1) || "live";
  const params = useMemo(() => shareState(location.search), [location.search]);
  const [states, setStates] = useState<Record<FeedId, FeedState>>({
      ...coordinator.states,
    }),
    [now, setNow] = useState(Date.now()),
    [metric, setMetric] = useState<Metric>(params.metric as Metric),
    [range, setRange] = useState(params.range),
    [cursor, setCursor] = useState<number | null>(null),
    [pausedMotion, setPausedMotion] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [view, setView] = useState("Sun–Earth"),
    [renderer, setRenderer] = useState(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ? "SVG" : "WebGL",
    ),
    [quality, setQuality] = useState("Standard"),
    [hemisphere, setHemisphere] = useState(params.hemisphere),
    [city, setCity] = useState("New Delhi"),
    [lat, setLat] = useState(String(params.lat)),
    [lon, setLon] = useState(String(params.lon)),
    [selectedLocation, setSelectedLocation] = useState({
      lat: params.lat,
      lon: params.lon,
    }),
    [message, setMessage] = useState(""),
    [help, setHelp] = useState(
      () => localStorage.getItem("swt-help") !== "dismissed",
    ),
    [inspector, setInspector] = useState(false);
  const [historyId, setHistoryId] = useState(params.history),
    [history, setHistory] = useState<{ manifest: any; records: any[] } | null>(
      null,
    ),
    [replaySamples, setReplaySamples] = useState<Sample[]>([]),
    [playing, setPlaying] = useState(false),
    [replaySpeed, setReplaySpeed] = useState(600),
    [scenario, setScenario] = useState<Scenario>(params.scenario),
    [draft, setDraft] = useState<Scenario>(params.scenario),
    [cmePlaying, setCmePlaying] = useState(false),
    [cmeProgress, setCmeProgress] = useState(0),
    [compare, setCompare] = useState(true),
    [page, setPage] = useState(0);
  const selfNavigation = useRef<string | null>(null);
  const capture = useRef<(() => HTMLCanvasElement) | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    chartHeading = useRef<HTMLHeadingElement>(null),
    lastReplay = useRef(0),
    recent = useRef<Sample[]>([]),
    resume = useRef(false),
    drawer = useRef<HTMLDivElement>(null);
  const mode =
    route === "replay" ? "Replay" : route === "lab" ? "Scenario" : "Live";
  useEffect(() => {
    const f = () => setStates({ ...coordinator.states });
    coordinator.listeners.add(f);
    coordinator.start();
    const visibility = () => {
      if (document.hidden) {
        setPlaying(false);
        setCmePlaying(false);
        setMessage("Paused while inactive");
      } else coordinator.tick();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      coordinator.listeners.delete(f);
      coordinator.stop();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    coordinator.enabled = mode === "Live";
    if (!coordinator.enabled) {
      for (const c of coordinator.controllers.values()) c.abort();
    } else coordinator.tick();
    if (!["live", "aurora", "replay", "lab", "sources"].includes(route)) {
      navigate("/live", { replace: true });
      setMessage("Unknown route; opened Live.");
    }
  }, [mode, route, navigate]);
  useEffect(() => {
    if (selfNavigation.current === location.search) {
      selfNavigation.current = null;
      return;
    }
    setMetric(params.metric as Metric);
    setRange(params.range);
    setHemisphere(params.hemisphere);
    setSelectedLocation({ lat: params.lat, lon: params.lon });
    setLat(String(params.lat));
    setLon(String(params.lon));
    setScenario(params.scenario);
    setDraft(params.scenario);
    setHistoryId(params.history);
    if (params.cursor !== null) setCursor(params.cursor);
    if (params.errors.length) setMessage(params.errors.join("; "));
  }, [params]);
  useEffect(() => {
    if (route !== "replay") {
      setPlaying(false);
      setCursor(null);
      recent.current = [];
      return;
    }
    let cancelled = false;
    setPlaying(false);
    setHistory(null);
    setReplaySamples([]);
    if (historyId === "recent") {
      const freeze = async () => {
        if (params.cursor !== null && params.cursor < Date.now() - 86400000) {
          setMessage(
            "Requested replay time is no longer in the current feed. Choose a historical case.",
          );
          setCursor(params.cursor);
          return;
        }
        const copy = () =>
          Object.values(coordinator.states)
            .flatMap((s) => s.data?.samples || [])
            .filter(
              (s) =>
                s.feedId !== "forecast" &&
                s.time >= Date.now() - 86400000 &&
                s.evidenceType === "observation",
            )
            .map((s) => ({ ...s }))
            .sort((a, b) => a.time - b.time);
        if (!recent.current.length) recent.current = copy();
        if (!recent.current.length) {
          setMessage("Loading provider-available recent observations…");
          await Promise.all(
            (["wind", "mag", "kp", "xray", "proton"] as FeedId[]).map((id) =>
              coordinator.fetch(id),
            ),
          );
          if (cancelled) return;
          recent.current = copy();
          setMessage("");
        }
        if (cancelled) return;
        setReplaySamples(recent.current);
        const first = recent.current[0]?.time,
          last = recent.current.at(-1)?.time;
        if (
          params.cursor !== null &&
          (first === undefined ||
            params.cursor < first ||
            params.cursor > (last || 0))
        ) {
          setMessage(
            "Requested replay time is no longer in the current feed. Choose a historical case.",
          );
          setCursor(params.cursor);
        } else if (first === undefined) {
          setMessage(
            "No provider-available recent records. Choose a bundled historical case.",
          );
          setCursor(null);
        } else setCursor(params.cursor ?? first);
      };
      void freeze();
      return () => {
        cancelled = true;
      };
    }
    fetch(`${import.meta.env.BASE_URL}history/${historyId}.json`)
      .then((r) => {
        if (!r.ok) throw Error("Historical dataset unavailable");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.manifest.version !== params.version) {
          setMessage(
            "Historical version mismatch. Choose a case to load its current start.",
          );
          return;
        }
        setHistory(data);
        const samples: Sample[] = data.records.flatMap((r: any) =>
          ["speed", "density", "bz", "kp"].map((m) => ({
            id: `${historyId}:${r.time}:${m}`,
            feedId: historyId,
            time: r.time,
            timeUtc: r.timeUtc,
            retrievedAtUtc: data.manifest.retrievedAtUtc,
            observedAtUtc: r.timeUtc,
            validAtUtc: null,
            spacecraft: "NASA OMNI",
            sourceUrl: data.manifest.queryUrl,
            metric: m as Metric,
            value: r[m],
            unit: metrics[m as Metric][1],
            coordinateFrame: m === "bz" ? "GSM" : null,
            evidenceType: "observation",
            quality: r[m] === null ? "rejected" : "eligible",
            qualityReasons: r[m] === null ? ["NASA fill value"] : [],
            rawFlags: {},
            timeBasis: "bowShockShifted",
            adapterVersion: "omni-v1",
            transport: "bundled",
          })),
        );
        setReplaySamples(samples.sort((a, b) => a.time - b.time));
        const first = data.records[0]?.time,
          last = data.records.at(-1)?.time;
        setCursor(
          params.cursor !== null &&
            params.cursor >= first &&
            params.cursor <= last
            ? params.cursor
            : first,
        );
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [route, historyId, params.version]);
  const bounds = useMemo(
    () => ({
      start: replaySamples[0]?.time || 0,
      end: replaySamples.at(-1)?.time || 0,
    }),
    [replaySamples],
  );
  useEffect(() => {
    if (!playing) return;
    lastReplay.current = performance.now();
    let frame: number;
    const tick = (t: number) => {
      const elapsed = t - lastReplay.current;
      lastReplay.current = t;
      setCursor((old) => {
        const next = replayClock(
          old ?? bounds.start,
          elapsed,
          replaySpeed,
          bounds.end,
        );
        if (next === bounds.end) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, replaySpeed, bounds]);
  useEffect(() => {
    if (!cmePlaying) return;
    let frame: number;
    let last = performance.now();
    const tick = (t: number) => {
      setCmeProgress((p) => {
        const n = Math.min(1, p + (t - last) / 15000);
        if (n === 1) setCmePlaying(false);
        return n;
      });
      last = t;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cmePlaying]);
  useEffect(() => {
    if (!inspector) return;
    const prior = document.activeElement as HTMLElement;
    const panel = drawer.current;
    panel?.querySelector<HTMLElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspector(false);
      if (e.key === "Tab" && panel) {
        const nodes = Array.from(
          panel.querySelectorAll<HTMLElement>("button,a,input,select"),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, [inspector]);
  const all = useMemo(
    () =>
      mode === "Replay"
        ? replaySamples
        : Object.values(states)
            .flatMap((s) => s.data?.samples || [])
            .filter((s) => s.feedId !== "forecast"),
    [mode, replaySamples, states],
  );
  const clock = mode === "Replay" ? (cursor ?? bounds.start) : (cursor ?? now);
  const selections = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(metrics) as Metric[]).map((m) => {
          const a = series({ samples: all } as Normalized, m).filter(
            (s) => s.evidenceType === "observation",
          );
          const maxAge =
            mode === "Replay" && historyId !== "recent"
              ? 90 * 60000
              : m === "kp"
                ? 3 * 3600000
                : m === "proton"
                  ? 20 * 60000
                  : 10 * 60000;
          const s =
            cursor !== null || mode === "Replay"
              ? nearestPastSample(a, clock, maxAge)
              : eligible(a).at(-1) || null;
          return [m, s?.quality === "rejected" ? null : s];
        }),
      ) as Record<Metric, Sample | null>,
    [all, clock, cursor, mode, historyId],
  );
  const selected = selections[metric];
  const stale = (m: Metric, s: Sample | null) =>
    !!s &&
    mode === "Live" &&
    (m === "kp"
      ? now - (s.time + 10800000) > 14400000
      : now - s.time > feeds[feedFor[m]].age);
  const wind = selections.speed,
    density = wind
      ? all.find(
          (s) =>
            s.metric === "density" &&
            s.time === wind.time &&
            s.spacecraft === wind.spacecraft &&
            s.quality !== "rejected",
        )
      : null;
  const magnetic = wind ? matchMagnetic(all, wind.time, clock) : null;
  const v = mode === "Scenario" ? scenario.speed : (wind?.value ?? null),
    n = mode === "Scenario" ? scenario.density : (density?.value ?? null),
    bz = mode === "Scenario" ? scenario.bz : (selections.bz?.value ?? null);
  const canCalc = mode !== "Live" || !stale("speed", wind);
  const pressure =
      canCalc && n !== null && v !== null ? calculatePressure(n, v) : null,
    proxy =
      canCalc &&
      v !== null &&
      (mode === "Scenario" || magnetic) &&
      !stale("bz", magnetic ?? null)
        ? calculateSouthwardProxy(
            v,
            mode === "Scenario" ? scenario.bz : magnetic!.value!,
          )
        : null,
    transport =
      canCalc && v !== null
        ? calculateTransport(v, wind?.timeBasis ?? "L1")
        : null,
    cme = calculateCmeScenario(scenario.cme, scenario.launch);
  const aurora = mode === "Live" ? states.aurora.data?.aurora : undefined;
  const expired =
    !aurora ||
    now - aurora.observation > 1200000 ||
    now - aurora.forecast > 900000;
  const local =
    aurora && !expired
      ? auroraGridLookup(
          aurora.grid,
          selectedLocation.lat,
          selectedLocation.lon,
        )
      : null;
  const chartSamples = useMemo(
    () =>
      series({ samples: all } as Normalized, metric).sort(
        (a, b) => a.time - b.time,
      ),
    [all, metric],
  );
  const liveChartEnd = Math.floor(now / 60000) * 60000;
  const end =
    mode === "Replay"
      ? bounds.end
      : metric === "kp"
        ? Math.max(liveChartEnd, ...chartSamples.map((s) => s.time))
        : liveChartEnd;
  const bzSeries = useMemo(
    () => series({ samples: all } as Normalized, "bz"),
    [all],
  );
  const stepCursor = (direction: number) => {
    const a = eligible(chartSamples);
    const index = a.findIndex((s) => s.time >= clock);
    const next =
      a[
        Math.max(
          0,
          Math.min(
            a.length - 1,
            (index < 0 ? a.length - 1 : index) + direction,
          ),
        )
      ];
    if (next) {
      setCursor(next.time);
      setPlaying(false);
    }
  };
  const chooseMetric = (m: Metric) => {
    setMetric(m);
    setPage(0);
    persist({ metric: m });
    chartHeading.current?.focus();
  };
  function exportData(csv = false) {
    const metadata = {
      schemaVersion: 1,
      appVersion: "1.0.0",
      mode,
      generatedAtUtc: new Date().toISOString(),
      selectedClockUtc: utc(clock),
      sourceEnvelopes:
        mode === "Replay"
          ? [
              history?.manifest || {
                dataset: "recent",
                sources: Object.values(states).map((s) => s.data?.envelope),
              },
            ]
          : Object.values(states)
              .map((s) => s.data?.envelope)
              .filter(Boolean),
      selectedRecords: mode === "Scenario" ? null : selections,
      providerForecastRecords:
        mode === "Live" ? states.forecast.data?.samples : undefined,
      records: chartSamples,
      aurora:
        mode === "Live" && route === "aurora"
          ? {
              observationTime: aurora?.observation,
              forecastTime: aurora?.forecast,
              selectedLocation,
              sampledCell: local,
              method: methods.aurora,
            }
          : undefined,
      calculation: {
        inputs:
          mode === "Scenario"
            ? {
                speed: scenario.speed,
                density: scenario.density,
                bz: scenario.bz,
                launch: scenario.launch,
                cmeSpeed: scenario.cme,
              }
            : { wind, density, magnetic },
        outputs: {
          pressure,
          proxy,
          transport,
          cme: mode === "Scenario" ? cme : null,
        },
        methods,
        evidenceType: mode === "Scenario" ? "Scenario" : "Calculation",
      },
      appliedScenario: mode === "Scenario" ? scenario : null,
      limitations: [
        "Educational; not an operational forecast",
        "Schematic is not to scale",
        "OMNI is bow-shock shifted",
        "Aurora index is not local visibility probability",
      ],
    };
    const name = `space-weather-twin_${mode.toLowerCase()}_${new Date(clock).toISOString().replaceAll(":", "").replace(".000", "")}`;
    if (csv) {
      download(
        name + ".csv",
        exportSerializers(chartSamples),
        "text/csv;charset=utf-8",
      );
      download(
        name + "_metadata.json",
        JSON.stringify({ ...metadata, records: undefined }, null, 2),
        "application/json",
      );
    } else
      download(
        name + ".json",
        JSON.stringify(metadata, null, 2),
        "application/json",
      );
  }
  function share() {
    const values: Record<string, string | number> = {
      metric,
      range,
      hemisphere,
      lat: selectedLocation.lat.toFixed(4),
      lon: selectedLocation.lon.toFixed(4),
    };
    if (mode === "Replay") {
      Object.assign(values, {
        history: historyId,
        cursor: new Date(clock).toISOString(),
        version: history?.manifest.version || "1.0.0",
      });
    }
    if (mode === "Scenario") Object.assign(values, scenario);
    const link = serializeShare(route, values);
    navigator.clipboard
      ?.writeText(link)
      .then(() => setMessage("Link copied. It includes chosen coordinates."))
      .catch(() => setMessage(link));
    if (!navigator.clipboard) setMessage(link);
  }
  function persist(overrides: Record<string, string | number> = {}) {
    const values: Record<string, string | number> = {
      metric,
      range,
      hemisphere,
      lat: selectedLocation.lat.toFixed(4),
      lon: selectedLocation.lon.toFixed(4),
    };
    if (mode === "Scenario") Object.assign(values, scenario);
    if (mode === "Replay")
      Object.assign(values, {
        history: historyId,
        version: history?.manifest.version || "1.0.0",
        ...(cursor === null ? {} : { cursor: new Date(cursor).toISOString() }),
      });
    const link = serializeShare(route, { ...values, ...overrides });
    const next = link.slice(link.indexOf("#") + 1);
    selfNavigation.current = next.includes("?")
      ? next.slice(next.indexOf("?"))
      : "";
    navigate(next, { replace: true });
  }
  function applyLocation() {
    const a = Number(lat),
      b = Number(lon);
    if (
      !lat.trim() ||
      !lon.trim() ||
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      a < -90 ||
      a > 90 ||
      b < -180 ||
      b > 180
    ) {
      setMessage("Enter latitude −90 to 90 and longitude −180 to 180.");
      return;
    }
    setSelectedLocation({ lat: a, lon: b });
    setCity("Custom coordinates");
    persist({ lat: a.toFixed(4), lon: b.toFixed(4) });
  }
  function applyScenario() {
    if (
      !calculateCmeScenario(draft.cme, draft.launch) ||
      draft.speed < 200 ||
      draft.speed > 2000 ||
      draft.density < 0.1 ||
      draft.density > 100 ||
      draft.bz < -50 ||
      draft.bz > 50 ||
      Object.values(draft).some((v) => !Number.isFinite(v))
    ) {
      setMessage("Scenario inputs are outside the permitted bounds.");
      return;
    }
    setScenario({ ...draft });
    persist({ ...draft });
    setCmeProgress(0);
    setCmePlaying(false);
    setMessage("Hypothetical scenario applied.");
  }
  const renderInspector = () => (
    <>
      <div className="eyebrow">
        {route === "aurora" ? "Location inspector" : "Evidence inspector"}
      </div>
      <h2>{route === "aurora" ? city : metrics[metric][0]}</h2>
      {route === "aurora" ? (
        <>
          <label>
            City
            <select
              value={city === "Custom coordinates" ? "" : city}
              onChange={(e) => {
                const c = cities.find((c) => c[0] === e.target.value);
                if (c) {
                  setCity(c[0]);
                  setLat(String(c[1]));
                  setLon(String(c[2]));
                  setSelectedLocation({ lat: c[1], lon: c[2] });
                  persist({ lat: c[1], lon: c[2] });
                }
              }}
            >
              <option value="">Custom coordinates</option>
              {cities.map((c) => (
                <option key={c[0]}>{c[0]}</option>
              ))}
            </select>
          </label>
          <div className="coords">
            <label>
              Latitude
              <input
                type="number"
                min="-90"
                max="90"
                step=".0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                min="-180"
                max="180"
                step=".0001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
          </div>
          <button onClick={applyLocation}>Inspect coordinates</button>
          <button
            onClick={() => {
              if (!navigator.geolocation) {
                setMessage(
                  "Geolocation unsupported; manual selection is available.",
                );
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  setLat(String(p.coords.latitude));
                  setLon(String(p.coords.longitude));
                  setSelectedLocation({
                    lat: p.coords.latitude,
                    lon: p.coords.longitude,
                  });
                  setCity("Custom coordinates");
                },
                () =>
                  setMessage(
                    "Location permission declined or unavailable. Manual selection remains available.",
                  ),
              );
            }}
          >
            Use my location
          </button>
          <p className="primary-reading">
            {local?.value ?? "—"} <small>/ 100</small>
          </p>
          <p>Forecast aurora index at location</p>
          <p>
            {expired
              ? "Forecast stale or unavailable; local readout disabled."
              : local
                ? `Sampled ${local.lat}°, ${local.lon}° · ${local.distance.toFixed(2)}° away`
                : "No grid cell within 1.5°."}
          </p>
          <LocationContext
            {...selectedLocation}
            time={aurora?.forecast || clock}
          />
        </>
      ) : (
        <>
          <p className="primary-reading">
            {mode === "Scenario"
              ? fmt(
                  (
                    {
                      speed: scenario.speed,
                      density: scenario.density,
                      bz: scenario.bz,
                    } as any
                  )[metric],
                  metric,
                )
              : fmt(selected?.value, metric)}{" "}
            <small>{metrics[metric][1]}</small>
          </p>
          <p>{definitions[metric]}</p>
          <Badge
            text={
              mode === "Scenario"
                ? "Scenario"
                : selected?.evidenceType === "forecast"
                  ? "NOAA forecast"
                  : "Observation"
            }
          />
          <p>
            <b>
              {mode === "Scenario"
                ? "Applied hypothetical inputs"
                : selected?.spacecraft || "No selected source"}
            </b>
            <br />
            {mode === "Scenario"
              ? utc(scenario.launch)
              : selected
                ? utc(selected.time)
                : "No valid sample at this time."}
            <br />
            {mode === "Scenario"
              ? "Scenario · constant-speed assumptions"
              : `${selected?.transport || "Unavailable"} · ${selected?.timeBasis || "Unavailable"}`}
          </p>
          {selected && mode !== "Scenario" && (
            <>
              <p>
                Sample age relative to cursor:{" "}
                {Math.max(0, (clock - selected.time) / 60000).toFixed(1)} min
              </p>
              <p>
                Quality:{" "}
                {selected.quality === "unspecified"
                  ? "Quality not supplied"
                  : selected.quality}
              </p>
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                Open provider data ↗
              </a>
            </>
          )}
        </>
      )}
      <hr />
      <h3>Local calculations</h3>
      <Badge text={mode === "Scenario" ? "Scenario" : "Calculation"} />
      <dl>
        <dt>Proton-only pressure estimate</dt>
        <dd>
          {pressure === null ? "Unavailable" : `${pressure.toFixed(2)} nPa`}
        </dd>
        <dt>Southward-field driving proxy</dt>
        <dd>
          {proxy === null
            ? "Unavailable — no matched inputs"
            : `${proxy.toFixed(2)} mV/m`}
        </dd>
        <dt>Illustrative L1 transport</dt>
        <dd>
          {transport === null
            ? "Unavailable for missing / OMNI inputs"
            : `${(transport / 60).toFixed(1)} minutes`}
        </dd>
      </dl>
      {mode !== "Scenario" && transport !== null && wind && (
        <p>
          Simple propagated time
          <br />
          {utc(wind.time + transport * 1000)}
        </p>
      )}
      <p className="muted">
        Pressure excludes alpha, thermal and magnetic pressure. The proxy does
        not predict Kp or local impacts. Transport assumes fixed distance and
        speed.
      </p>
      <details>
        <summary>Inputs and method versions</summary>
        <p>
          Pressure uses speed and density from one plasma record. Bz must match
          within 90 s and cannot be ahead of the cursor.
        </p>
        <p>
          {wind?.spacecraft} · {utc(wind?.time)}
          <br />
          {magnetic?.spacecraft} · {utc(magnetic?.time)}
        </p>
        {Object.values(methods).map((m) => (
          <code key={m}>
            {m}
            <br />
          </code>
        ))}
      </details>
      <hr />
      <h3>Export and share</h3>
      <div className="actions">
        <button onClick={() => exportData()}>JSON</button>
        <button onClick={() => exportData(true)}>CSV + metadata</button>
        <button
          onClick={async () => {
            const target =
              renderer === "WebGL" && route !== "aurora" && capture.current
                ? capture.current()
                : svg.current;
            if (!target) {
              setMessage("No exportable view. Choose SVG or Aurora.");
              return;
            }
            try {
              await screenshot(target, [
                `Space Weather Twin · ${mode} · ${utc(clock)}`,
                "Illustration: schematic sizes and distances not to scale",
                "Legend: cyan solar wind; magenta GSM Bz; orange Sun",
                `Aurora bins: 0 / 1–10 / >10–30 / >30–60 / >60–100`,
                ...Object.values(selections)
                  .filter(Boolean)
                  .slice(0, 4)
                  .map(
                    (s) =>
                      `${s!.metric}: ${s!.value} ${s!.unit} · ${utc(s!.time)} · ${s!.spacecraft}`,
                  ),
                `Aurora observation ${utc(aurora?.observation)} / valid ${utc(aurora?.forecast)}`,
              ]);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Screenshot failed");
            }
          }}
        >
          Screenshot
        </button>
        <button onClick={share}>Copy link</button>
      </div>
      <small>
        Shared links include the selected coordinates. Nothing is uploaded.
      </small>
    </>
  );
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header>
        <NavLink className="brand" to="/live">
          <span className="brand-icon">☀</span>
          <span>
            Space Weather <b>Twin</b>
          </span>
        </NavLink>
        <nav aria-label="Main">
          {[
            ["live", "Live"],
            ["aurora", "Aurora"],
            ["replay", "Replay"],
            ["lab", "Scenario lab"],
            ["sources", "Sources"],
          ].map(([p, label]) => (
            <NavLink key={p} to={"/" + p}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="clock">
          <Badge text={mode} />
          <span className="freshness">
            {mode === "Live"
              ? selections.speed && !stale("speed", selections.speed)
                ? "● Fresh wind"
                : "◷ Wind stale / unavailable"
              : mode === "Replay"
                ? "Recorded time"
                : "Hypothetical"}
          </span>
          <time>{utc(mode === "Replay" ? clock : now)}</time>
        </div>
      </header>
      {help && (
        <div className="help">
          Observations measure conditions. NOAA forecasts are provider model
          output. Calculations use simplified methods; illustrations explain
          relationships.
          <button
            aria-label="Dismiss evidence help"
            onClick={() => {
              setHelp(false);
              localStorage.setItem("swt-help", "dismissed");
            }}
          >
            ×
          </button>
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={route === "sources" ? "sources-layout" : "dashboard"}
      >
        {route === "sources" ? (
          <Sources states={states} now={now} />
        ) : (
          <>
            <aside className="rail">
              <div className="eyebrow">
                {mode === "Replay"
                  ? "Recorded conditions"
                  : mode === "Scenario"
                    ? "Live observations are separate"
                    : "Current conditions"}
              </div>
              <div className="scales">
                {(["G", "R", "S"] as const).map((key) => {
                  const data =
                    mode === "Live" ? states.scales.data?.scales : undefined;
                  const value = data?.[key];
                  const old = !!data && now - data.time > 1800000;
                  return (
                    <div key={key}>
                      <b>
                        {key}
                        {value ?? "—"}
                      </b>
                      <span>
                        {key === "G"
                          ? "Geomagnetic storm"
                          : key === "R"
                            ? "Radio blackout"
                            : "Solar radiation storm"}
                      </span>
                      <small>
                        {mode !== "Live"
                          ? "Unavailable in this mode"
                          : old
                            ? "Stale category"
                            : value == null
                              ? "Unavailable"
                              : [
                                  "Below storm threshold",
                                  "Minor",
                                  "Moderate",
                                  "Strong",
                                  "Severe",
                                  "Extreme",
                                ][value]}
                      </small>
                      <time>{data ? utc(data.time) : ""}</time>
                    </div>
                  );
                })}
              </div>
              <div className="metric-grid">
                {(
                  [
                    "speed",
                    "density",
                    "bt",
                    "bz",
                    "xray",
                    "proton",
                    "kp",
                  ] as Metric[]
                ).map((m) => {
                  const s = selections[m];
                  return (
                    <button
                      key={m}
                      className={
                        "metric-card " + (metric === m ? "selected" : "")
                      }
                      onClick={() => chooseMetric(m)}
                    >
                      <span>
                        {metrics[m][0]} <small>{metrics[m][1]}</small>
                      </span>
                      <strong>{fmt(s?.value, m)}</strong>
                      <time>{s ? utc(s.time) : "No eligible observation"}</time>
                      <small>
                        {stale(m, s)
                          ? "◷ Stale observation"
                          : s
                            ? `${s.transport} · Observation`
                            : "Unavailable"}
                      </small>
                    </button>
                  );
                })}
              </div>
              <label>
                Chart range
                <select
                  value={range}
                  onChange={(e) => {
                    setRange(Number(e.target.value));
                    persist({ range: Number(e.target.value) });
                  }}
                >
                  {[2, 6, 24].map((h) => (
                    <option key={h} value={h}>
                      {h} hours
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  if (!coordinator.manual())
                    setMessage("Manual refresh has a 30 second cooldown.");
                }}
                disabled={mode !== "Live"}
              >
                Refresh current feeds
              </button>
              <p className="muted">
                {Object.values(states).filter((s) => s.data).length}/8 feeds
                loaded · independent timestamps
              </p>
              <NavLink to="/sources">Inspect data health ↗</NavLink>
            </aside>
            <section className="center">
              <div className="view-heading">
                <div>
                  <div className="eyebrow">Sun–Earth environment</div>
                  <h1>
                    {route === "aurora"
                      ? "Aurora forecast"
                      : mode === "Replay"
                        ? "Replay observations"
                        : mode === "Scenario"
                          ? "What if conditions changed?"
                          : "A connected view of space weather"}
                  </h1>
                </div>
                <button
                  className="inspect-button"
                  onClick={() => setInspector(true)}
                >
                  Inspector
                </button>
              </div>
              {route === "replay" && (
                <div className="replay-select">
                  <label>
                    Dataset
                    <select
                      value={historyId}
                      onChange={(e) => {
                        setHistoryId(e.target.value);
                        setCursor(null);
                        navigate(
                          `/replay?v=1&history=${e.target.value}&version=1.0.0`,
                        );
                      }}
                    >
                      {Object.entries(historicalLabels).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {historyId === "recent"
                      ? "Frozen copy of currently loaded observations."
                      : "NASA OMNI · hourly midpoint averages · shifted to bow-shock nose"}
                  </p>
                  <p>
                    {historyId === "recent"
                      ? "Recent replay contains frozen loaded streams; official categories and aurora are unavailable."
                      : "Historical GOES, G/R/S and aurora unavailable."}
                  </p>
                </div>
              )}
              {route === "lab" && (
                <div className="lab-controls">
                  <div className="eyebrow">
                    Hypothetical inputs · never an official forecast
                  </div>
                  <div className="lab-grid">
                    {(
                      [
                        ["speed", "Solar-wind speed", 200, 2000, 10, "km/s"],
                        ["density", "Proton density", 0.1, 100, 0.1, "cm⁻³"],
                        ["bz", "GSM Bz", -50, 50, 0.5, "nT"],
                        [
                          "cme",
                          "Hypothetical CME speed",
                          200,
                          3000,
                          50,
                          "km/s",
                        ],
                      ] as const
                    ).map(([key, label, min, max, step, unit]) => (
                      <label key={key}>
                        {label} · {unit}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [key]: e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Hypothetical launch · UTC
                      <input
                        type="datetime-local"
                        min="1900-01-01T00:00"
                        max="2100-12-31T23:59"
                        value={
                          Number.isFinite(draft.launch)
                            ? new Date(draft.launch).toISOString().slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            launch: Date.parse(e.target.value + "Z"),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={applyScenario}>
                      Apply scenario
                    </button>
                    <button
                      onClick={() => {
                        const s = {
                          ...baseline,
                          launch: Math.floor(now / 60000) * 60000,
                        };
                        setDraft(s);
                        setScenario(s);
                        persist({ ...s });
                        setCmeProgress(0);
                        setCmePlaying(false);
                      }}
                    >
                      Reset scenario
                    </button>
                    <button
                      aria-pressed={compare}
                      onClick={() => setCompare(!compare)}
                    >
                      Compare baseline
                    </button>
                  </div>
                  <div className="scenario-results">
                    <div>
                      <span>Proton-only pressure</span>
                      <strong>{pressure?.toFixed(2)} nPa</strong>
                      {compare && <small>Baseline 1.34 nPa</small>}
                    </div>
                    <div>
                      <span>Southward-field proxy</span>
                      <strong>{proxy?.toFixed(2)} mV/m</strong>
                      {compare && <small>Baseline 2.00 mV/m</small>}
                    </div>
                    <div>
                      <span>Hypothetical CME duration</span>
                      <strong>
                        {cme ? (cme.duration / 3600).toFixed(2) : "—"} hours
                      </strong>
                      {compare && <small>Baseline 41.56 hours</small>}
                    </div>
                  </div>
                  <p>
                    Illustrative arrival: {utc(cme?.arrival)}. Constant-speed,
                    Earth-directed, exactly 1 AU thought experiment; no drag or
                    uncertainty model.
                  </p>
                  <button
                    onClick={() => {
                      setCmePlaying(!cmePlaying);
                      if (cmeProgress === 1) setCmeProgress(0);
                    }}
                  >
                    {cmePlaying ? "Pause illustration" : "Play illustration"}
                  </button>
                  <progress
                    value={cmeProgress}
                    max="1"
                    aria-label="Hypothetical CME illustration progress"
                  />
                </div>
              )}
              {route === "aurora" ? (
                <div className="map-panel">
                  <div className="actions">
                    <button
                      aria-pressed={hemisphere === "north"}
                      onClick={() => {
                        setHemisphere("north");
                        persist({ hemisphere: "north" });
                      }}
                    >
                      Northern hemisphere
                    </button>
                    <button
                      aria-pressed={hemisphere === "south"}
                      onClick={() => {
                        setHemisphere("south");
                        persist({ hemisphere: "south" });
                      }}
                    >
                      Southern hemisphere
                    </button>
                  </div>
                  <PolarMap
                    ref={svg}
                    aurora={aurora}
                    hemisphere={hemisphere}
                    {...selectedLocation}
                  />
                  <div className="aurora-legend">
                    {["0", "1–10", ">10–30", ">30–60", ">60–100"].map(
                      (label, i) => (
                        <span key={label}>
                          <i style={{ background: bins[i] }} />
                          {label}
                        </span>
                      ),
                    )}
                    <span>Missing: transparent</span>
                  </div>
                  <p>
                    NOAA forecast aurora index · not a local visibility
                    probability
                  </p>
                  <p>
                    Observation time: {utc(aurora?.observation)}
                    <br />
                    Forecast valid time: {utc(aurora?.forecast)}
                  </p>
                  {expired && (
                    <p className="stale">
                      Forecast stale or unavailable. Location result is
                      disabled.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="view-controls">
                    <div className="actions">
                      <button
                        aria-pressed={view === "Sun–Earth"}
                        onClick={() => setView("Sun–Earth")}
                      >
                        Sun–Earth view
                      </button>
                      <button
                        aria-pressed={view === "Earth"}
                        onClick={() => {
                          setView("Earth");
                          setRenderer("WebGL");
                        }}
                      >
                        Earth view
                      </button>
                    </div>
                    <label className="compact">
                      Renderer
                      <select
                        value={renderer}
                        onChange={(e) => setRenderer(e.target.value)}
                      >
                        <option>SVG</option>
                        <option>WebGL</option>
                      </select>
                    </label>
                  </div>
                  <div className="scene-panel">
                    {renderer === "WebGL" ? (
                      <SceneBoundary
                        fallback={
                          <Schematic
                            ref={svg}
                            speed={v}
                            bz={bz}
                            scale={
                              mode === "Scenario" && pressure !== null
                                ? compression(pressure)
                                : 1
                            }
                            time={clock}
                            mode={mode}
                          />
                        }
                      >
                        <Suspense
                          fallback={
                            <p>Loading scene… all data remains available.</p>
                          }
                        >
                          <Scene
                            onSlow={() =>
                              setMessage(
                                "Scene is running below 20 fps. Choose the SVG renderer for a lighter view.",
                              )
                            }
                            bz={bz}
                            aurora={aurora}
                            capture={capture}
                            key={view}
                            speed={v ?? 400}
                            paused={pausedMotion}
                            quality={quality}
                            earth={view === "Earth"}
                            scale={
                              mode === "Scenario" && pressure !== null
                                ? compression(pressure)
                                : 1
                            }
                            time={clock}
                            onFailure={() => {
                              setRenderer("SVG");
                              setMessage(
                                "WebGL context lost. SVG fallback is active.",
                              );
                            }}
                          />
                        </Suspense>
                      </SceneBoundary>
                    ) : (
                      <Schematic
                        ref={svg}
                        speed={v}
                        bz={bz}
                        scale={
                          mode === "Scenario" && pressure !== null
                            ? compression(pressure)
                            : 1
                        }
                        time={clock}
                        mode={mode}
                      />
                    )}
                  </div>
                  <div className="scene-footer">
                    <span>
                      <i className="dot cyan" />
                      Solar wind <i className="dot magenta" />
                      GSM Bz <Badge text="Illustration" />
                    </span>
                    <div className="actions">
                      <button
                        onClick={() => {
                          setView("Sun–Earth");
                          setRenderer("SVG");
                        }}
                      >
                        Reset view
                      </button>
                      <button
                        aria-pressed={pausedMotion}
                        onClick={() => setPausedMotion(!pausedMotion)}
                      >
                        {pausedMotion ? "Resume motion" : "Pause motion"}
                      </button>
                      <label>
                        Quality
                        <select
                          value={quality}
                          onChange={(e) => setQuality(e.target.value)}
                        >
                          <option>Low</option>
                          <option>Standard</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <p className="scene-caption">
                    Schematic — sizes and distances not to scale. Sun → L1
                    observation region → Earth.
                    <br />
                    {bz === null
                      ? "No Bz data."
                      : bz < 0
                        ? "Southward GSM Bz can support magnetic coupling. It does not imply a local impact."
                        : "Northward GSM Bz. A zero southward proxy does not mean no space-weather risk."}{" "}
                    {mode === "Scenario" &&
                      `Illustrative relative compression: ${pressure !== null ? compression(pressure).toFixed(2) : "—"}×; not a magnetopause measurement.`}
                  </p>
                </>
              )}
              {route === "replay" && (
                <div className="transport">
                  <div className="actions">
                    <button
                      disabled={
                        !replaySamples.length ||
                        (cursor !== null &&
                          (cursor < bounds.start || cursor > bounds.end))
                      }
                      className="primary"
                      onClick={() => {
                        if (playing)
                          persist({ cursor: new Date(clock).toISOString() });
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? "Pause replay" : "Play replay"}
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setCursor(bounds.start);
                        persist({
                          cursor: new Date(bounds.start).toISOString(),
                        });
                      }}
                    >
                      Reset replay
                    </button>
                    <label>
                      Replay speed
                      <select
                        value={replaySpeed}
                        onChange={(e) => setReplaySpeed(Number(e.target.value))}
                      >
                        {[60, 600, 3600].map((s) => (
                          <option key={s} value={s}>
                            {s}×
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Replay UTC cursor
                    <input
                      type="range"
                      min={bounds.start}
                      max={bounds.end || 1}
                      step={historyId === "recent" ? 60000 : 3600000}
                      value={cursor ?? bounds.start}
                      aria-valuetext={utc(cursor)}
                      onPointerDown={() => {
                        resume.current = playing;
                        setPlaying(false);
                      }}
                      onPointerUp={() => {
                        if (resume.current) setPlaying(true);
                      }}
                      onChange={(e) => {
                        setCursor(Number(e.target.value));
                        persist({
                          cursor: new Date(
                            Number(e.target.value),
                          ).toISOString(),
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "PageUp" || e.key === "PageDown") {
                          e.preventDefault();
                          setPlaying(false);
                          setCursor((c) =>
                            Math.max(
                              bounds.start,
                              Math.min(
                                bounds.end,
                                (c || bounds.start) +
                                  (e.key === "PageUp" ? 1 : -1) *
                                    (historyId === "recent" ? 1 : 6) *
                                    3600000,
                              ),
                            ),
                          );
                        }
                      }}
                    />
                  </label>
                  <time>{utc(cursor)}</time>
                </div>
              )}
              <section className="charts">
                <div className="chart-toolbar">
                  <label className="metric-select">
                    Chart metric
                    <select
                      value={metric}
                      onChange={(e) => chooseMetric(e.target.value as Metric)}
                    >
                      {Object.entries(metrics).map(([key, [label, unit]]) => (
                        <option key={key} value={key}>
                          {label} · {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <h2 ref={chartHeading} tabIndex={-1}>
                    {metrics[metric][0]} over time
                  </h2>
                  <div className="actions">
                    <button onClick={() => stepCursor(-1)}>
                      Previous sample
                    </button>
                    <button onClick={() => stepCursor(1)}>Next sample</button>
                    {mode === "Live" && (
                      <button onClick={() => setCursor(null)}>
                        Clear cursor
                      </button>
                    )}
                  </div>
                </div>
                {mode === "Scenario" && (
                  <p className="muted">
                    Retained observations below are separate from the applied
                    hypothetical scenario.
                  </p>
                )}
                <p className="cursor-readout" aria-live="polite">
                  Selected: {utc(clock)} · {fmt(selected?.value, metric)}{" "}
                  {metrics[metric][1]} ·{" "}
                  {selected?.spacecraft || "No valid sample at this time"}
                </p>
                <Chart
                  samples={chartSamples}
                  metric={metric}
                  cursor={cursor}
                  onCursor={(t) => {
                    setCursor(t);
                    if (mode === "Replay") setPlaying(false);
                  }}
                  range={
                    mode === "Replay"
                      ? Math.max(range, (bounds.end - bounds.start) / 3600000)
                      : metric === "kp"
                        ? 168
                        : range
                  }
                  end={end}
                />
                {metric !== "bz" && (
                  <Chart
                    samples={bzSeries}
                    metric="bz"
                    cursor={cursor}
                    onCursor={setCursor}
                    range={
                      mode === "Replay"
                        ? Math.max(range, (bounds.end - bounds.start) / 3600000)
                        : range
                    }
                    end={end}
                  />
                )}
                {metric === "kp" && mode === "Live" && (
                  <>
                    <p>
                      {states.forecast.data &&
                      now -
                        Date.parse(
                          states.forecast.data.envelope.retrievedAtUtc,
                        ) >
                        21600000
                        ? "Outdated forecast. "
                        : ""}
                      Observed Kp above; NOAA estimated/predicted Kp below.
                      Shading marks provider forecast intervals.
                    </p>
                    <Chart
                      samples={
                        states.forecast.data?.samples.filter(
                          (s) =>
                            s.status === "estimated" ||
                            s.status === "predicted",
                        ) || []
                      }
                      metric="kp"
                      cursor={cursor}
                      onCursor={setCursor}
                      range={96}
                      end={Math.max(
                        now,
                        ...(states.forecast.data?.samples.map((s) => s.time) ||
                          []),
                      )}
                    />
                  </>
                )}
                <details className="data-table">
                  <summary>
                    Accessible data table · full resolution (
                    {chartSamples.length} records)
                  </summary>
                  <div className="table-wrap">
                    <table>
                      <caption>
                        {metrics[metric][0]} · UTC · full normalized precision
                      </caption>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Value</th>
                          <th>Unit</th>
                          <th>Source</th>
                          <th>Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartSamples
                          .slice(page * 25, page * 25 + 25)
                          .map((s) => (
                            <tr key={s.id}>
                              <td>{utc(s.time)}</td>
                              <td>{s.value ?? "Unavailable"}</td>
                              <td>{s.unit}</td>
                              <td>{s.spacecraft}</td>
                              <td>
                                {s.quality}
                                {s.qualityReasons.join(", ")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="actions">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous table page
                    </button>
                    <span>Page {page + 1}</span>
                    <button
                      disabled={(page + 1) * 25 >= chartSamples.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next table page
                    </button>
                  </div>
                </details>
              </section>
              <details className="mobile-inspector">
                <summary>Inspect values, calculations and exports</summary>
                {renderInspector()}
              </details>
            </section>
            <aside className="inspector">{renderInspector()}</aside>
            {inspector && (
              <div className="scrim">
                <div
                  ref={drawer}
                  className="drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Evidence inspector"
                >
                  <button onClick={() => setInspector(false)}>
                    Close inspector
                  </button>
                  {renderInspector()}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <footer>
        <span>
          Educational situational awareness · NOAA and NASA data · No
          endorsement implied
        </span>
        <a href="https://www.spaceweather.gov" target="_blank" rel="noreferrer">
          Official NOAA SWPC information ↗
        </a>
      </footer>
    </>
  );
}
function Badge({ text }: { text: string }) {
  return (
    <span className={"badge " + text.toLowerCase().replaceAll(" ", "-")}>
      {text}
    </span>
  );
}
function Sources({
  states,
  now,
}: {
  states: Record<FeedId, FeedState>;
  now: number;
}) {
  return (
    <article>
      <div className="eyebrow">Provenance and methods</div>
      <h1>Know what you’re looking at</h1>
      <p>
        Measured records, provider forecasts, local calculations and explanatory
        geometry remain separate. Each feed has its own clock and failure state.
      </p>
      <div className="source-grid">
        {(Object.keys(feeds) as FeedId[]).map((id) => {
          const s = states[id],
            d = s.data,
            en = d?.envelope,
            latest =
              eligible(d?.samples || []).at(-1)?.time ??
              d?.scales?.time ??
              d?.aurora?.observation;
          return (
            <section className="source-card" key={id}>
              <h2>{feeds[id].name}</h2>
              <Badge
                text={
                  latest &&
                  id !== "forecast" &&
                  now - latest >
                    (id === "kp" ? feeds[id].age + 10800000 : feeds[id].age)
                    ? "stale"
                    : id === "forecast" &&
                        en &&
                        now - Date.parse(en.retrievedAtUtc) > 21600000
                      ? "outdated forecast"
                      : s.state
                }
              />
              <dl>
                <dt>Transport</dt>
                <dd>{en?.transport || "Unavailable"}</dd>
                <dt>Last attempt</dt>
                <dd>{utc(s.lastAttempt)}</dd>
                <dt>Last success</dt>
                <dd>{utc(s.lastSuccess)}</dd>
                <dt>Last retrieved / snapshot collected</dt>
                <dd>{en?.retrievedAtUtc || "Unavailable"}</dd>
                <dt>Latest observation</dt>
                <dd>{utc(latest)}</dd>
                <dt>Age</dt>
                <dd>
                  {latest
                    ? ((now - latest) / 60000).toFixed(1) + " min"
                    : "Unavailable"}
                </dd>
                <dt>Forecast valid time</dt>
                <dd>{utc(d?.aurora?.forecast)}</dd>
                <dt>Provider issue time</dt>
                <dd>{en?.providerIssuedAtUtc || "Not supplied"}</dd>
                <dt>Records / rejected</dt>
                <dd>
                  {en?.recordCount ?? 0} / {en?.rejectionCount ?? 0}
                </dd>
                <dt>Adapter version</dt>
                <dd>{en?.adapterVersion || "noaa-v1"}</dd>
              </dl>
              {s.error && <p className="stale">{s.error}</p>}
              <a
                href={"https://services.swpc.noaa.gov" + feeds[id].path}
                target="_blank"
                rel="noreferrer"
              >
                Provider feed ↗
              </a>
            </section>
          );
        })}
      </div>
      <h2>Calculation methodology</h2>
      <p>
        Proton-only pressure = 1.6726 × 10⁻⁶ n v² nPa. Southward-field driving
        proxy = 10⁻³ v max(0, −GSM Bz) mV/m. Input records must match within 90
        seconds and precede the cursor. Neither predicts damage, aurora
        visibility or official NOAA categories.
      </p>
      <p>
        Illustrative transport = 1,500,000 / v seconds; fixed distance and
        constant speed omit geometry and coupling delays. Disabled for NASA OMNI
        bow-shock-shifted history. CME lab duration = 149,597,870.7 /
        hypothetical speed seconds. Compression = (P / 1.33808)⁻¹/⁶, visually
        clamped to 0.65–1.35; no physical boundary claim.
      </p>
      <p>
        Aurora uses NOAA OVATION keyed geographic grid cells, nearest angular
        distance within 1.5°. Missing cells stay missing. Solar altitude uses
        Astronomy Engine, elevation 0, no refraction; daylight means altitude
        &gt; 0°. This context is not a visibility forecast.
      </p>
      <h2>Freshness and limitations</h2>
      <p>
        RTSW and X-rays: 10 minutes; protons: 20 minutes; current scales: 30
        minutes; observed Kp: four hours after interval end. Aurora requires
        input age ≤20 minutes and forecast no more than 15 minutes past.
        Forecast Kp retrieval expires after six hours. Hourly fallback snapshots
        often exceed live thresholds.
      </p>
      <p>
        RTSW requires active=true and overall_quality=0. The release uses a
        conservative filter; raw quality flags are retained. GSM is never
        replaced with GSE. Kp is a three-hour planetary index. OMNI historical
        values are hourly averages shifted to Earth’s bow shock. Flares,
        energetic particles and CMEs are different phenomena; a flare does not
        guarantee an Earth-directed CME.
      </p>
      <h2>Sources and notices</h2>
      <ol>
        {[
          [
            "NOAA Solar Wind",
            "https://www.spaceweather.gov/products/solar-wind",
          ],
          [
            "2026 service change notice",
            "https://www.weather.gov/media/notification/pdf_2026/scn26-21_Data_Format_Changes_Impacting_SWPC_Products.pdf",
          ],
          [
            "NOAA scales",
            "https://www.spaceweather.gov/noaa-scales-explanation",
          ],
          [
            "GOES X-rays",
            "https://www.spaceweather.gov/products/goes-x-ray-flux",
          ],
          [
            "GOES protons",
            "https://www.spaceweather.gov/products/goes-proton-flux",
          ],
          [
            "NOAA aurora",
            "https://www.spaceweather.gov/products/aurora-30-minute-forecast",
          ],
          [
            "NASA OMNI metadata",
            "https://cdaweb.gsfc.nasa.gov/misc/NotesO.html",
          ],
          [
            "May 2024 historical context",
            "https://www.swpc.noaa.gov/news/historical-comparison-may-2024-solar-storms",
          ],
          [
            "GitHub Pages limits",
            "https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits",
          ],
          [
            "GitHub Pages creation",
            "https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site",
          ],
          [
            "GitHub scheduled events",
            "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows",
          ],
          [
            "Astronomy Engine · MIT",
            "https://github.com/cosinekitty/astronomy",
          ],
          [
            "NASA JPL astronomical unit",
            "https://ssd.jpl.nasa.gov/astro_par.html",
          ],
          [
            "Natural Earth · public domain",
            "https://www.naturalearthdata.com/about/terms-of-use/",
          ],
        ].map(([label, url]) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer">
              {label} ↗
            </a>
          </li>
        ))}
      </ol>
      <p>
        New code MIT. Provider data and dependencies retain their own terms. No
        accounts, analytics, paid API, cookies or location persistence.
        Geography: Natural Earth 1:110m. Procedural Sun. Share links may contain
        your chosen coordinates.
      </p>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
