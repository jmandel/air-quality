import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "chart.js/auto";
import annotationPlugin from "chartjs-plugin-annotation";
import "chartjs-adapter-date-fns";
import { getSensorMetadata, getCurrentZone, getZoneColor, formatValue } from "./sensor-utils";

// Register annotation plugin
Chart.register(annotationPlugin);

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
  dataVersion?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Get sensor metadata from registry
  const metadata = useMemo(() => getSensorMetadata(sensorId), [sensorId]);

  const filteredData = useMemo(() => data.filter((p) => p.x >= sinceMs), [data, sinceMs, dataVersion]);

  const currentValue = latest?.value;
  const currentZone = useMemo(
    () => (currentValue !== undefined && !isNaN(currentValue) ? getCurrentZone(currentValue, metadata) : null),
    [currentValue, metadata]
  );

  // Use zone color if available, otherwise use hash-based color
  const color = useMemo(() => {
    if (currentZone) {
      const baseColor = getZoneColor(currentZone.color);
      // Make the color more vibrant/saturated for better visibility
      return baseColor;
    }
    let h = 0;
    for (let i = 0; i < sensorId.length; i++) h = (h * 33 + sensorId.charCodeAt(i)) % 360;
    return `hsl(${h} 85% 60%)`; // Increased saturation and lightness
  }, [sensorId, currentZone]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;

    // Build zone annotations (background bands)
    const zoneAnnotations: any = {};
    metadata.zones.forEach((zone, idx) => {
      zoneAnnotations[`zone-${idx}`] = {
        type: "box",
        yMin: zone.min,
        yMax: zone.max === Infinity ? metadata.yAxis.max : zone.max,
        backgroundColor: getZoneColor(zone.color) + "15", // 15 = 8.5% opacity
        borderWidth: 0,
        drawTime: "beforeDatasetsDraw",
      };
    });

    // Build threshold labels (no lines, just colored text labels at boundaries)
    const thresholdAnnotations: any = {};
    (metadata.thresholdLines || []).forEach((line, idx) => {
      thresholdAnnotations[`threshold-${idx}`] = {
        type: "label",
        yValue: line.value,
        xValue: ({ chart }: any) => {
          const xScale = chart.scales.x;
          return xScale.min; // Align to the left edge (start of data)
        },
        content: line.label,
        color: "#ffffff", // White text for all labels
        backgroundColor: "rgba(0,0,0,0.9)", // Black background
        borderColor: line.color, // Colored border to indicate zone
        borderWidth: 2, // Make border visible
        font: {
          size: 9,
          weight: "600",
        },
        padding: { top: 2, bottom: 2, left: 6, right: 6 },
        borderRadius: 3,
        callout: {
          display: false,
        },
        position: "start", // Left-align the text
        xAdjust: 0, // No horizontal adjustment
        yAdjust: 0,
      };
    });

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: metadata.displayName,
            data: filteredData,
            parsing: false,
            borderColor: color,
            backgroundColor: color + "30", // Slightly more opaque fill
            fill: true,
            pointRadius: 0,
            borderWidth: 4, // Increased to 4 for maximum visibility
            tension: 0.3,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
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
            min: metadata.yAxis.min,
            max: metadata.yAxis.suggestedMax || metadata.yAxis.max,
            grid: { color: "rgba(138,160,180,0.1)" },
            ticks: { color: "#8aa0b4" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                const zone = getCurrentZone(value, metadata);
                const formattedValue = formatValue(value, metadata);
                return zone ? `${metadata.displayName}: ${formattedValue} (${zone.label})` : `${metadata.displayName}: ${formattedValue}`;
              },
            },
          },
          annotation: {
            annotations: {
              ...zoneAnnotations,
              ...thresholdAnnotations,
            },
          },
        },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, [metadata]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets[0].data = filteredData;
    chart.update("none");
  }, [filteredData]);

  return (
    <div className="chart-tile">
      <div className="tile-header">
        <div className="tile-title">
          <div className="sensor-name">
            {metadata.displayName}
            <button
              className="info-btn"
              onClick={() => setShowInfo(!showInfo)}
              title="Sensor information"
              style={{
                marginLeft: "8px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "12px",
                padding: "2px 6px",
                borderRadius: "4px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              ℹ️
            </button>
          </div>
          {currentValue !== undefined && !isNaN(currentValue) && (
            <div className="current-value" style={{ color: currentZone ? getZoneColor(currentZone.color) : undefined }}>
              {currentValue.toFixed(metadata.decimalPlaces)}
              <span className="unit">{metadata.unit}</span>
              {currentZone && (
                <span
                  className="zone-badge"
                  style={{
                    backgroundColor: getZoneColor(currentZone.color) + "20",
                    color: getZoneColor(currentZone.color),
                    marginLeft: "8px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.75em",
                    fontWeight: "600",
                  }}
                >
                  {currentZone.label}
                </span>
              )}
            </div>
          )}
        </div>
        {onRemove && (
          <button className="remove-btn" onClick={onRemove} title="Remove tile">
            ×
          </button>
        )}
      </div>

      {showInfo && (
        <div
          className="sensor-info"
          style={{
            background: "var(--surface-hover)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "12px",
            marginBottom: "8px",
          }}
        >
          {metadata.description && (
            <div style={{ marginBottom: "8px" }}>
              <strong>Description:</strong> {metadata.description}
            </div>
          )}
          <div style={{ marginBottom: "8px" }}>
            <strong>Range:</strong> {metadata.yAxis.min} - {metadata.yAxis.max} {metadata.unit}
          </div>
          <div style={{ marginBottom: "8px" }}>
            <strong>Category:</strong> {metadata.category.replace("-", " ")}
          </div>
          <div style={{ marginBottom: "8px" }}>
            <strong>Default time window:</strong> {metadata.defaultTimeWindow} hour{metadata.defaultTimeWindow !== 1 ? "s" : ""}
          </div>
          {metadata.standards && metadata.standards.length > 0 && (
            <div>
              <strong>Standards:</strong> {metadata.standards.join(", ")}
            </div>
          )}
          {metadata.zones.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <strong>Health zones:</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                {metadata.zones.map((zone, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "11px",
                    }}
                  >
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "2px",
                        backgroundColor: getZoneColor(zone.color),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: "600" }}>{zone.label}:</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {zone.min === 0 ? "" : zone.min + " - "}
                      {zone.max === Infinity ? metadata.yAxis.max + "+" : zone.max} {metadata.unit}
                      {zone.description && ` (${zone.description})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
  const [dataVersion, setDataVersion] = useState(0); // Force re-render when data updates
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [historicalLoaded, setHistoricalLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [connectionMode, setConnectionMode] = useState<"device" | "server">("server");
  const [uploadMode, setUploadMode] = useState(false); // Explicit device upload mode

  const esRef = useRef<EventSource | null>(null);
  const sessionRef = useRef(0);
  const flushTimerRef = useRef<Timer | null>(null);
  const pending = useRef<Array<{ ts: number; sensorId: string; value: number; state: string; eventId: string }>>([]);
  const series = useRef<Record<string, Array<{ x: number; y: number }>>>({});
  const autoStartRef = useRef(false);
  const reconnectTimerRef = useRef<Timer | null>(null);
  const reconnectAttempts = useRef(0);
  const lastDataTimestamp = useRef<number>(Date.now());
  const dataFreshnessTimerRef = useRef<Timer | null>(null);

  // Load historical data from SQLite on mount
  useEffect(() => {
    if (!settingsLoaded || historicalLoaded) return;

    let cancelled = false;
    (async () => {
      try {
        // Periodic data freshness check for server view mode
  useEffect(() => {
    if (!isLogging || uploadMode) return;
    
    if (dataFreshnessTimerRef.current) {
      clearInterval(dataFreshnessTimerRef.current);
    }
    
    dataFreshnessTimerRef.current = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTimestamp.current;
      
      // If no data for 60 seconds in server mode, refresh historical data
      if (timeSinceLastData > 60000) {
        console.log("⏱️  No recent updates, refreshing historical data...");
        setHistoricalLoaded(false); // Trigger reload
      }
    }, 30000); // Check every 30 seconds
    
    return () => {
      if (dataFreshnessTimerRef.current) {
        clearInterval(dataFreshnessTimerRef.current);
      }
    };
  }, [isLogging, uploadMode]);

  // Clean up reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

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

  // Auto-start server stream on mount (default behavior)
  useEffect(() => {
    if (!settingsLoaded || isLogging) return;
    // Automatically connect to server stream when page loads
    start();
  }, [settingsLoaded]);

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

  // Periodic data freshness check for server view mode
  useEffect(() => {
    if (!isLogging || uploadMode) return;
    
    if (dataFreshnessTimerRef.current) {
      clearInterval(dataFreshnessTimerRef.current);
    }
    
    dataFreshnessTimerRef.current = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTimestamp.current;
      
      // If no data for 60 seconds in server mode, refresh historical data
      if (timeSinceLastData > 60000) {
        console.log("⏱️  No recent updates, refreshing historical data...");
        setHistoricalLoaded(false); // Trigger reload
      }
    }, 30000); // Check every 30 seconds
    
    return () => {
      if (dataFreshnessTimerRef.current) {
        clearInterval(dataFreshnessTimerRef.current);
      }
    };
  }, [isLogging, uploadMode]);

  // Clean up reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

    const sinceMs = Date.now() - hoursWindow * 3600 * 1000;

  // Group sensors by health priority
  const sensorsByPriority = useMemo(() => {
    const groups: Record<string, string[]> = {
      primary: [],
      secondary: [],
      safety: [],
      support: [],
    };

    knownSensors.forEach((sensorId) => {
      const metadata = getSensorMetadata(sensorId);
      groups[metadata.healthPriority].push(sensorId);
    });

    // Sort within each group
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        const aName = getSensorMetadata(a).displayName;
        const bName = getSensorMetadata(b).displayName;
        return aName.localeCompare(bName);
      });
    });

    return groups;
  }, [knownSensors]);

  function scheduleReconnect() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    
    // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;
    
    console.log(`📡 Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts.current})...`);
    
    reconnectTimerRef.current = setTimeout(() => {
      if (!isLogging) {
        console.log(`🔄 Attempting reconnect...`);
        start();
      }
    }, delay);
  }

    async function start() {
    // Determine URL based on mode: server stream (default) or device upload
    let url: string;
    if (uploadMode && deviceURL) {
      // Explicit upload mode: connect to device
      url = deviceURL.replace(/\/$/, "") + "/events";
      setConnectionMode("device");
    } else {
      // Default: connect to server stream
      url = `${API_BASE}/stream`;
      setConnectionMode("server");
    }

    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      setStatus("connecting");
      setIsLogging(true);
      console.log(`🔗 Connecting to: ${url} (mode: ${uploadMode ? 'device-upload' : 'server-view'})`);
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
          // Auto-reconnect for server view mode
          if (!uploadMode) {
            scheduleReconnect();
          }
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
        lastDataTimestamp.current = ts;
        reconnectAttempts.current = 0; // Reset on successful data
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
        setDataVersion((v) => v + 1); // Trigger re-render for charts

        if (!series.current[sensorId]) series.current[sensorId] = [];
        // Create a new array reference so React detects the change
        const updated = [...series.current[sensorId], { x: ts, y: value }];
        if (updated.length > 10000) {
          series.current[sensorId] = updated.slice(updated.length - 10000);
        } else {
          series.current[sensorId] = updated;
        }

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
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttempts.current = 0;
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

      // Auto-adjust time window for leak detection sensors
      const metadata = getSensorMetadata(sensorId);
      if (metadata.category === "leak-detection" && hoursWindow > 1) {
        setHoursWindow(1); // Switch to real-time for leak detection
      }
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
              disabled={!uploadMode}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={uploadMode}
                onChange={(e) => setUploadMode(e.target.checked)}
                disabled={isLogging}
              />
              <span>
                <strong>Upload from local device</strong>
                <span style={{ marginLeft: "4px", fontSize: "12px", opacity: 0.7 }}>
                  - Connect to device and upload readings to server
                </span>
              </span>
            </label>
            {!isLogging ? (
              <button onClick={start} disabled={uploadMode && !deviceURL}>
                {uploadMode ? "Start Upload" : "Reconnect"}
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

            {knownSensors.size === 0 ? (
              <div className="muted">Waiting for sensor data…</div>
            ) : (
              <>
                {sensorsByPriority.primary.length > 0 && (
                  <div className="sensor-group">
                    <div className="group-label">🎯 Primary Health Indicators</div>
                    <div className="sensor-list">
                      {sensorsByPriority.primary.map((id) => (
                        <button
                          key={id}
                          className={displayedTiles.includes(id) ? "sensor-chip active" : "sensor-chip"}
                          onClick={() => (displayedTiles.includes(id) ? removeTile(id) : addTile(id))}
                        >
                          {getSensorMetadata(id).displayName} {displayedTiles.includes(id) && "✓"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sensorsByPriority.secondary.length > 0 && (
                  <div className="sensor-group">
                    <div className="group-label">📊 Secondary Indicators</div>
                    <div className="sensor-list">
                      {sensorsByPriority.secondary.map((id) => (
                        <button
                          key={id}
                          className={displayedTiles.includes(id) ? "sensor-chip active" : "sensor-chip"}
                          onClick={() => (displayedTiles.includes(id) ? removeTile(id) : addTile(id))}
                        >
                          {getSensorMetadata(id).displayName} {displayedTiles.includes(id) && "✓"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sensorsByPriority.safety.length > 0 && (
                  <div className="sensor-group">
                    <div className="group-label">⚠️ Safety & Leak Detection</div>
                    <div className="sensor-list">
                      {sensorsByPriority.safety.map((id) => (
                        <button
                          key={id}
                          className={displayedTiles.includes(id) ? "sensor-chip active" : "sensor-chip"}
                          onClick={() => (displayedTiles.includes(id) ? removeTile(id) : addTile(id))}
                        >
                          {getSensorMetadata(id).displayName} {displayedTiles.includes(id) && "✓"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sensorsByPriority.support.length > 0 && (
                  <div className="sensor-group">
                    <div className="group-label">🔧 Supporting Data</div>
                    <div className="sensor-list">
                      {sensorsByPriority.support.map((id) => (
                        <button
                          key={id}
                          className={displayedTiles.includes(id) ? "sensor-chip active" : "sensor-chip"}
                          onClick={() => (displayedTiles.includes(id) ? removeTile(id) : addTile(id))}
                        >
                          {getSensorMetadata(id).displayName} {displayedTiles.includes(id) && "✓"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
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
            dataVersion={dataVersion}
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
