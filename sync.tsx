import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "chart.js/auto";
import "chartjs-adapter-date-fns";

const API_BASE = `${window.location.origin}/api`;

// ---------- Individual Chart Tile ----------
function ChartTile({
  sensorId,
  data,
  sinceMs,
  latest,
  onRemove,
}: {
  sensorId: string;
  data: Array<{ x: number; y: number }>;
  sinceMs: number;
  latest?: { value: number; state: string; ts: number };
  onRemove?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const prettyName = sensorId
    .replace(/^sensor-/, "")
    .replace(/_weight_concentration$/, "")
    .replace(/__/g, " ")
    .replace(/_/g, " ")
    .replace(/\bco2\b/i, "CO₂")
    .replace(/\bpm\b/i, "PM")
    .replace(/\bvoc\b/i, "VOC")
    .replace(/\bnox\b/i, "NOx")
    .trim();

  const filteredData = useMemo(() => data.filter((p) => p.x >= sinceMs), [data, sinceMs]);

  const color = useMemo(() => {
    let h = 0;
    for (let i = 0; i < sensorId.length; i++) h = (h * 33 + sensorId.charCodeAt(i)) % 360;
    return `hsl(${h} 70% 55%)`;
  }, [sensorId]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: prettyName,
            data: filteredData,
            parsing: false,
            borderColor: color,
            backgroundColor: color + "20",
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: "time",
            time: { tooltipFormat: "PPpp", displayFormats: { hour: "HH:mm" } },
            grid: { color: "rgba(138,160,180,0.1)" },
            ticks: { color: "#8aa0b4", maxTicksLimit: 6 },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(138,160,180,0.1)" },
            ticks: { color: "#8aa0b4" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: "index", intersect: false },
        },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets[0].data = filteredData;
    chart.update("none");
  }, [filteredData]);

  const currentValue = latest?.value;
  const unit = sensorId.includes("co2")
    ? "ppm"
    : sensorId.includes("temperature")
    ? "°C"
    : sensorId.includes("humidity")
    ? "%"
    : sensorId.includes("pm")
    ? "µg/m³"
    : "";

  return (
    <div className="chart-tile">
      <div className="tile-header">
        <div className="tile-title">
          <div className="sensor-name">{prettyName}</div>
          {currentValue !== undefined && !isNaN(currentValue) && (
            <div className="current-value">
              {currentValue.toFixed(1)}
              <span className="unit">{unit}</span>
            </div>
          )}
        </div>
        {onRemove && (
          <button className="remove-btn" onClick={onRemove} title="Remove tile">
            ×
          </button>
        )}
      </div>
      <div className="chart-container">
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// ---------- Main App ----------
function App() {
  const [deviceURL, setDeviceURL] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [isLogging, setIsLogging] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [hoursWindow, setHoursWindow] = useState(6);
  const [knownSensors, setKnownSensors] = useState<Set<string>>(new Set());
  const [displayedTiles, setDisplayedTiles] = useState<string[]>([
    "sensor-co2",
    "sensor-pm__2_5_m_weight_concentration",
    "sensor-sen55_voc",
    "sensor-sen55_nox",
    "sensor-sen55_temperature",
    "sensor-sen55_humidity",
  ]);
  const [latest, setLatest] = useState<Record<string, { ts: number; value: number; state: string }>>({});
  const [logLines, setLogLines] = useState<string[]>([]);
  const [rowsInDb, setRowsInDb] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [historicalLoaded, setHistoricalLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const sessionRef = useRef(0);
  const flushTimerRef = useRef<Timer | null>(null);
  const pending = useRef<Array<{ ts: number; sensorId: string; value: number; state: string; eventId: string }>>([]);
  const series = useRef<Record<string, Array<{ x: number; y: number }>>>({});
  const autoStartRef = useRef(false);

  // Load historical data from SQLite on mount
  useEffect(() => {
    if (!settingsLoaded || historicalLoaded) return;

    let cancelled = false;
    (async () => {
      try {
        const sinceMs = Date.now() - hoursWindow * 3600 * 1000;
        const res = await fetch(`${API_BASE}/readings?since=${sinceMs}`);

        if (res.ok && !cancelled) {
          const readings = (await res.json()) as Array<{
            ts: number;
            sensorId: string;
            value: number | null;
            state: string;
          }>;

          console.log(`📊 Loaded ${readings.length} historical readings from SQLite`);

          // Build series data from historical readings
          const seriesData: Record<string, Array<{ x: number; y: number }>> = {};
          const sensors = new Set<string>();
          const latestValues: Record<string, { ts: number; value: number; state: string }> = {};

          for (const r of readings) {
            sensors.add(r.sensorId);

            // Track series data for charts
            if (typeof r.value === "number" && !isNaN(r.value)) {
              if (!seriesData[r.sensorId]) seriesData[r.sensorId] = [];
              seriesData[r.sensorId].push({ x: r.ts, y: r.value });
            }

            // Track latest values
            if (!latestValues[r.sensorId] || r.ts > latestValues[r.sensorId].ts) {
              latestValues[r.sensorId] = {
                ts: r.ts,
                value: r.value ?? NaN,
                state: r.state,
              };
            }
          }

          // Update state with historical data
          series.current = seriesData;
          setKnownSensors(sensors);
          setLatest(latestValues);
          setHistoricalLoaded(true);

          // Force a re-render to update charts
          setRowsInDb((prev) => prev);
        }
      } catch (e) {
        console.warn("Failed to load historical data", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, hoursWindow, historicalLoaded]);

  // Re-load historical data when time window changes
  useEffect(() => {
    if (!historicalLoaded) return;

    setHistoricalLoaded(false); // Trigger reload
  }, [hoursWindow]);

  // Load settings from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // First fetch server config for defaults
        const configRes = await fetch(`${API_BASE}/config`);
        let defaultUrl = "http://10.0.0.37/";
        if (configRes.ok) {
          const config = await configRes.json();
          defaultUrl = config.defaultSensorUrl || defaultUrl;
        }

        // Then load user settings
        const res = await fetch(`${API_BASE}/settings/app`);
        if (res.ok) {
          const saved = JSON.parse(await res.text());
          if (saved && !cancelled) {
            if (typeof saved.deviceURL === "string") setDeviceURL(saved.deviceURL);
            else setDeviceURL(defaultUrl);
            if (typeof saved.retentionDays === "number") setRetentionDays(saved.retentionDays);
            if (typeof saved.hoursWindow === "number") setHoursWindow(saved.hoursWindow);
            if (Array.isArray(saved.displayedTiles)) setDisplayedTiles(saved.displayedTiles);
          }
        } else {
          // No saved settings, use default
          if (!cancelled) setDeviceURL(defaultUrl);
        }
      } catch (e) {
        console.warn("Failed to load settings", e);
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save settings to backend
  useEffect(() => {
    if (!settingsLoaded) return;
    const payload = {
      deviceURL,
      retentionDays,
      hoursWindow,
      displayedTiles,
    };
    fetch(`${API_BASE}/settings/app`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).catch((e) => console.warn("Failed to save settings", e));
  }, [deviceURL, retentionDays, hoursWindow, displayedTiles, settingsLoaded]);

  // Live row counter
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/readings/count`);
        const data = await res.json();
        setRowsInDb(data.count);
      } catch (e) {
        console.warn("Failed to fetch count", e);
      }
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Periodic flush to backend
  useEffect(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(async () => {
      const batch = pending.current.splice(0, pending.current.length);
      if (!batch.length) return;
      try {
        await fetch(`${API_BASE}/readings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
      } catch (e) {
        console.error("Backend flush error", e);
      }
    }, 1000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    };
  }, []);

  // Retention policy
  useEffect(() => {
    const t = setInterval(async () => {
      const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
      try {
        await fetch(`${API_BASE}/readings?before=${cutoff}`, { method: "DELETE" });
      } catch (e) {
        console.warn("Failed to delete old readings", e);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [retentionDays]);

  const sinceMs = Date.now() - hoursWindow * 3600 * 1000;

  function prettyId(id: string) {
    return id
      .replace(/^sensor-/, "")
      .replace(/_weight_concentration$/, "")
      .replace(/__/g, " ")
      .replace(/_/g, " ")
      .replace(/\bco2\b/i, "CO₂")
      .replace(/\bpm\b/i, "PM")
      .trim();
  }

  async function start() {
    if (!deviceURL) return;

    // Direct connection to sensor
    const url = deviceURL.replace(/\/$/, "") + "/events";
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      setStatus("connecting");
      setIsLogging(true);
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("open", () => {
        if (sessionRef.current !== sessionId) return;
        setStatus("streaming");
      });

      es.addEventListener("error", (e) => {
        if (sessionRef.current !== sessionId) return;
        console.warn("EventSource error", e);
        if (es.readyState === EventSource.CLOSED) {
          esRef.current = null;
          setIsLogging(false);
          setStatus("disconnected");
        } else {
          setStatus("error");
        }
      });

      es.addEventListener("ping", () => {
        /* heartbeat */
      });

      es.addEventListener("log", (ev: any) => {
        if (sessionRef.current !== sessionId) return;
        const text = ev.data;
        setLogLines((lines) => {
          const next = [...lines, text];
          if (next.length > 200) next.splice(0, next.length - 200);
          return next;
        });
      });

      es.addEventListener("state", (ev: any) => {
        if (sessionRef.current !== sessionId) return;
        const ts = Date.now();
        let payload = null;
        try {
          payload = JSON.parse(ev.data);
        } catch {}
        if (!payload || !payload.id) return;
        const sensorId = payload.id;
        const value = typeof payload.value === "number" ? payload.value : NaN;
        const state = (payload.state ?? "").toString();
        const eventId =
          typeof ev.lastEventId === "string" && ev.lastEventId.trim() ? ev.lastEventId.trim() : `${ts}:${sensorId}`;

        setKnownSensors((s) => new Set([...s, sensorId]));
        setLatest((prev) => ({ ...prev, [sensorId]: { ts, value, state } }));

        if (!series.current[sensorId]) series.current[sensorId] = [];
        series.current[sensorId].push({ x: ts, y: value });
        if (series.current[sensorId].length > 10000)
          series.current[sensorId].splice(0, series.current[sensorId].length - 10000);

        const rowData = { ts, sensorId, value, state, eventId };
        pending.current.push(rowData);
      });
    } catch (e) {
      console.error(e);
      esRef.current = null;
      setIsLogging(false);
      setStatus("error");
    }
  }

  function stop() {
    sessionRef.current += 1;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsLogging(false);
    setStatus("disconnected");
  }

  async function exportCSV() {
    try {
      const res = await fetch(`${API_BASE}/export/csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `air1_log_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export CSV", e);
    }
  }

  async function clearDb() {
    try {
      await fetch(`${API_BASE}/readings?before=${Date.now() + 1000}`, { method: "DELETE" });
      setRowsInDb(0);
      series.current = {};
      setLatest({});
      setLogLines([]);
      setHistoricalLoaded(false);
    } catch (e) {
      console.error("Failed to clear DB", e);
    }
  }

  function addTile(sensorId: string) {
    if (!displayedTiles.includes(sensorId)) {
      setDisplayedTiles([...displayedTiles, sensorId]);
    }
  }

  function removeTile(sensorId: string) {
    setDisplayedTiles(displayedTiles.filter((id) => id !== sensorId));
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Apollo AIR‑1 Dashboard</h1>
        <div className="header-controls">
          <div className="status-badge" data-status={status}>
            {status === "streaming" ? "● Streaming" : status.charAt(0).toUpperCase() + status.slice(1)}
          </div>
          <button className="icon-btn" onClick={() => setShowConfig(!showConfig)} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {showConfig && (
        <div className="config-panel">
          <div className="config-row">
            <input
              type="url"
              value={deviceURL}
              onChange={(e) => setDeviceURL(e.target.value)}
              placeholder="http://apollo-air-1-xxxxxx.local"
            />
            {!isLogging ? (
              <button onClick={start} disabled={!deviceURL}>
                Start Logging
              </button>
            ) : (
              <button className="danger" onClick={stop}>
                Stop
              </button>
            )}
          </div>

          <div className="config-row">
            <label>
              Time Window:
              <select value={hoursWindow} onChange={(e) => setHoursWindow(parseInt(e.target.value))}>
                <option value="1">1 hour</option>
                <option value="3">3 hours</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="168">1 week</option>
              </select>
            </label>

            <label>
              Retention:
              <select value={retentionDays} onChange={(e) => setRetentionDays(parseInt(e.target.value))}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </select>
            </label>

            <button className="secondary" onClick={exportCSV}>
              Download CSV
            </button>
            <button className="warn" onClick={clearDb}>
              Clear DB
            </button>
          </div>

          <div className="config-section">
            <div className="section-title">Available Sensors</div>
            <div className="sensor-list">
              {[...knownSensors].sort().map((id) => (
                <button
                  key={id}
                  className={displayedTiles.includes(id) ? "sensor-chip active" : "sensor-chip"}
                  onClick={() => (displayedTiles.includes(id) ? removeTile(id) : addTile(id))}
                >
                  {prettyId(id)} {displayedTiles.includes(id) && "✓"}
                </button>
              ))}
              {knownSensors.size === 0 && <div className="muted">Waiting for sensor data…</div>}
            </div>
          </div>

          <div className="config-footer">
            <span className="muted">
              {rowsInDb.toLocaleString()} readings • {historicalLoaded ? "Historical data loaded" : "Loading..."}
            </span>
          </div>
        </div>
      )}

      <div className="dashboard">
        {displayedTiles.map((sensorId) => (
          <ChartTile
            key={sensorId}
            sensorId={sensorId}
            data={series.current[sensorId] || []}
            sinceMs={sinceMs}
            latest={latest[sensorId]}
            onRemove={() => removeTile(sensorId)}
          />
        ))}

        {displayedTiles.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <div>No sensors selected</div>
            <button onClick={() => setShowConfig(true)}>Configure Dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Bootstrap the app
const root = document.getElementById("app");
if (root) {
  createRoot(root).render(<App />);
}
