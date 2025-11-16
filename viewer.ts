import { Chart } from "chart.js/auto";
import annotationPlugin from "chartjs-plugin-annotation";
import "chartjs-adapter-date-fns";
import {
  formatValue as formatSensorValue,
  getCurrentZone,
  getSensorMetadata,
  getZoneColor,
  prettyId,
} from "./sensor-utils";
import { SENSOR_REGISTRY, SensorMetadata } from "./sensor-registry";

Chart.register(annotationPlugin);

type ApiReading = {
  ts: number;
  sensorId: string;
  sensorName?: string | null;
  value: number | null;
  state?: string | null;
};

type LatestReading = {
  sensorId: string;
  sensorName: string;
  value: number | null;
  ts: number;
  state: string;
};

type SensorChart = {
  chart: Chart;
  metadata: SensorMetadata;
  points: Array<{ x: number; y: number }>;
  card: HTMLElement;
  statusEl: HTMLElement;
  dirty: boolean;
};

const API_BASE = `${window.location.origin}/api`;
const HISTORY_WINDOW_HOURS = 6;
let serverTimeDiff = 0; // milliseconds offset: server - client
const MAX_RECENT_EVENTS = 20;
const MAX_POINTS = 720;
const CHART_FLUSH_INTERVAL_MS = 750;
const HISTORY_BATCH_SIZE = 400;
const STORAGE_KEY = "viewer.selectedSensors";

const PRIORITY_ORDER: Array<SensorMetadata["healthPriority"]> = [
  "primary",
  "secondary",
  "safety",
  "support",
];
const PRIORITY_LABEL: Record<SensorMetadata["healthPriority"], string> = {
  primary: "Primary Health",
  secondary: "Secondary",
  safety: "Safety",
  support: "Supporting",
};

const statusEl = document.getElementById("connection-status") as HTMLElement;
const lastUpdateEl = document.getElementById("last-update") as HTMLElement;
const tableBody = document.getElementById("latest-readings") as HTMLElement;
const eventsList = document.getElementById("recent-events") as HTMLElement;
const chartGrid = document.getElementById("chart-grid") as HTMLElement;
const chartWindowLabel = document.getElementById("chart-window-label") as HTMLElement;
const chartEmptyEl = document.getElementById("chart-empty") as HTMLElement;
const pickerToggle = document.getElementById("sensor-picker-toggle") as HTMLButtonElement;
const pickerPanel = document.getElementById("sensor-picker") as HTMLElement;
const pickerClose = document.getElementById("sensor-picker-close") as HTMLButtonElement;
const pickerGroups = document.getElementById("sensor-picker-groups") as HTMLElement;
const pickerButtons = new Map<string, HTMLButtonElement>();

chartWindowLabel.textContent = `Window: ${HISTORY_WINDOW_HOURS}h`;

const latestMap = new Map<string, LatestReading>();
const recentEvents: LatestReading[] = [];
let selectedOrder: string[] = [];
const selectedSet = new Set<string>();
const charts = new Map<string, SensorChart>();
let chartFlushTimer: number | null = null;
let pendingUiRefresh = false;
let lastUpdateTs: number | null = null;
let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let reconnectDelayMs = 2000;

function getDefaultSensors(): string[] {
  const defaults = Object.entries(SENSOR_REGISTRY)
    .filter(([, meta]) => meta.defaultVisible)
    .map(([id]) => id);

  if (defaults.length > 0) {
    return defaults;
  }

  const scored = Object.entries(SENSOR_REGISTRY)
    .map(([id, meta]) => ({
      id,
      priority: PRIORITY_ORDER.indexOf(meta.healthPriority),
      name: meta.displayName,
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

  return scored.slice(0, 6).map((entry) => entry.id);
}

function loadSelectedSensors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && SENSOR_REGISTRY[id]);
  } catch {
    return [];
  }
}

function saveSelectedSensors() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedOrder));
}

function updateChartEmptyState() {
  chartEmptyEl.dataset.visible = selectedOrder.length === 0 ? "true" : "false";
}

function updatePickerSelection() {
  pickerButtons.forEach((button, id) => {
    button.dataset.selected = selectedSet.has(id) ? "true" : "false";
  });
}

function setPickerOpen(open: boolean) {
  pickerPanel.dataset.open = open ? "true" : "false";
  pickerPanel.setAttribute("aria-hidden", open ? "false" : "true");
}

function renderSensorPicker() {
  pickerButtons.clear();
  pickerGroups.innerHTML = "";

  PRIORITY_ORDER.forEach((priority) => {
    const sensors = Object.entries(SENSOR_REGISTRY)
      .filter(([, meta]) => meta.healthPriority === priority)
      .sort((a, b) => a[1].displayName.localeCompare(b[1].displayName));

    if (sensors.length === 0) return;

    const group = document.createElement("section");
    group.className = "sensor-group";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = PRIORITY_LABEL[priority];
    group.appendChild(title);

    const chipWrap = document.createElement("div");

    sensors.forEach(([id, meta]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sensor-chip";
      chip.dataset.sensorId = id;
      chip.textContent = meta.displayName;
      chip.dataset.selected = selectedSet.has(id) ? "true" : "false";
      pickerButtons.set(id, chip);
      chipWrap.appendChild(chip);
    });

    group.appendChild(chipWrap);
    pickerGroups.appendChild(group);
  });
}

function isSensorSelected(sensorId: string): boolean {
  return selectedSet.has(sensorId);
}

function ensureChart(sensorId: string): SensorChart {
  let info = charts.get(sensorId);
  if (info) return info;

  const metadata = getSensorMetadata(sensorId);
  const card = document.createElement("article");
  card.className = "chart-card";
  card.dataset.sensorId = sensorId;

  const header = document.createElement("div");
  header.className = "chart-header";

  const title = document.createElement("div");
  title.className = "chart-title";
  title.textContent = metadata.displayName;

  const status = document.createElement("div");
  status.className = "chart-meta";
  status.textContent = "Waiting for data";

  const actions = document.createElement("div");
  actions.className = "chart-actions";
  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = "chart-action";
  hideBtn.dataset.removeSensor = sensorId;
  hideBtn.textContent = "Hide";
  actions.appendChild(hideBtn);

  header.appendChild(title);
  header.appendChild(status);
  header.appendChild(actions);
  card.appendChild(header);

  if (metadata.zones.length > 0) {
    const badges = document.createElement("div");
    badges.className = "chart-badges";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = metadata.zones
      .map((zone) => zone.label)
      .slice(0, 3)
      .join(" • ");
    badges.appendChild(badge);
    card.appendChild(badges);
  }

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "chart-canvas";
  const canvas = document.createElement("canvas");
  canvasWrapper.appendChild(canvas);
  card.appendChild(canvasWrapper);

  chartGrid.appendChild(card);

  const annotations: Record<string, any> = {};
  metadata.zones.forEach((zone, idx) => {
    annotations[`zone-${idx}`] = {
      type: "box",
      yMin: zone.min,
      yMax:
        zone.max === Infinity
          ? metadata.yAxis.max ?? metadata.yAxis.suggestedMax ?? zone.min + 1
          : zone.max,
      backgroundColor: `${getZoneColor(zone.color)}20`,
      borderWidth: 0,
      drawTime: "beforeDatasetsDraw",
    };
  });

  (metadata.thresholdLines || []).forEach((line, idx) => {
    annotations[`threshold-${idx}`] = {
      type: "line",
      yMin: line.value,
      yMax: line.value,
      borderColor: line.color,
      borderWidth: 1.5,
      borderDash: line.lineStyle === "dashed" ? [6, 6] : undefined,
      label: {
        display: true,
        content: line.label,
        position: "start",
        color: "#e2e8f0",
        backgroundColor: "rgba(15,23,42,0.85)",
        padding: 4,
      },
    };
  });

  const chart = new Chart(canvas.getContext("2d")!, {
    type: "line",
    data: {
      datasets: [
        {
          label: metadata.displayName,
          data: [],
          parsing: false,
          borderColor: pickSeriesColor(sensorId),
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: true,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "time",
          time: { tooltipFormat: "PPpp" },
          ticks: { maxRotation: 0, color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.1)" },
        },
        y: {
          min: metadata.yAxis.min,
          max: metadata.yAxis.max,
          suggestedMin: metadata.yAxis.suggestedMin,
          suggestedMax: metadata.yAxis.suggestedMax,
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.1)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const raw = context.parsed.y;
              if (typeof raw !== "number" || Number.isNaN(raw)) {
                return "No data";
              }
              const zone = getCurrentZone(raw, metadata);
              const formatted = formatSensorValue(raw, metadata);
              return zone ? `${formatted} (${zone.label})` : formatted;
            },
          },
        },
        annotation: { annotations },
      },
    },
  });

  info = {
    chart,
    metadata,
    points: [],
    card,
    statusEl: status,
    dirty: false,
  };
  charts.set(sensorId, info);
  updateChartEmptyState();
  return info;
}

function destroyChart(sensorId: string) {
  const info = charts.get(sensorId);
  if (!info) return;
  info.chart.destroy();
  info.card.remove();
  charts.delete(sensorId);
  updateChartEmptyState();
}

function pickSeriesColor(sensorId: string): string {
  let hash = 0;
  for (let i = 0; i < sensorId.length; i++) {
    hash = (hash * 33 + sensorId.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 80% 60%)`;
}

function recordReading(reading: LatestReading) {
  latestMap.set(reading.sensorId, reading);
  lastUpdateTs = Math.max(lastUpdateTs ?? 0, reading.ts);

  if (!isSensorSelected(reading.sensorId)) {
    return;
  }

  recentEvents.unshift({ ...reading });
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.length = MAX_RECENT_EVENTS;
  }
}

function renderLatestTable() {
  if (selectedOrder.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="placeholder">Pick a sensor to see live values.</td></tr>';
    return;
  }

  const rows = selectedOrder
    .map((id) => latestMap.get(id))
    .filter((reading): reading is LatestReading => Boolean(reading));

  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="placeholder">Waiting for sensor data...</td></tr>';
    return;
  }

  const html = rows
    .map((reading) => {
      const metadata = getSensorMetadata(reading.sensorId);
      const stateCell = reading.state
        ? `<span class="state-pill">${reading.state}</span>`
        : `<span class="state-pill">--</span>`;
      const valueCell =
        reading.value === null
          ? "--"
          : formatSensorValue(reading.value, metadata);
      return `<tr>
        <td>${metadata.displayName}</td>
        <td class="value">${valueCell}</td>
        <td>${stateCell}</td>
        <td><span class="time-ago" data-ts="${reading.ts}">${formatRelative(reading.ts)}</span></td>
      </tr>`;
    })
    .join("");

  tableBody.innerHTML = html;
}

function renderRecentActivity() {
  if (selectedOrder.length === 0) {
    eventsList.innerHTML = '<li class="placeholder">Select a sensor to view recent activity.</li>';
    return;
  }

  const items = recentEvents
    .filter((reading) => selectedSet.has(reading.sensorId))
    .map((reading) => {
      const metadata = getSensorMetadata(reading.sensorId);
      const zone =
        reading.value === null ? null : getCurrentZone(reading.value, metadata);
      const zoneLabel = zone ? ` | zone: ${zone.label}` : "";
      const valueText =
        reading.value === null ? "--" : formatSensorValue(reading.value, metadata);
      return `<li class="event">
        <div class="event-header">
          <span class="event-sensor">${metadata.displayName}</span>
          <span class="event-time" title="${new Date(reading.ts).toLocaleString()}" data-ts="${reading.ts}">
            ${new Date(reading.ts).toLocaleTimeString()}
          </span>
        </div>
        <div>value: ${valueText}${zoneLabel}${
        reading.state ? ` | state: ${reading.state}` : ""
      }</div>
      </li>`;
    });

  if (items.length === 0) {
    eventsList.innerHTML = '<li class="placeholder">No recent activity yet.</li>';
    return;
  }

  eventsList.innerHTML = items.join("");
}

function renderLastUpdate() {
  if (!lastUpdateTs) {
    lastUpdateEl.textContent = "No data yet";
    lastUpdateEl.removeAttribute("title");
    return;
  }
  lastUpdateEl.textContent = `Last update ${formatRelative(lastUpdateTs)}`;
  lastUpdateEl.title = new Date(lastUpdateTs).toLocaleString();
}

function flushUiIfNeeded() {
  if (!pendingUiRefresh) return;
  pendingUiRefresh = false;
  renderLatestTable();
  renderRecentActivity();
  renderLastUpdate();
}

function scheduleChartFlush(immediate = false) {
  const flush = () => {
    chartFlushTimer = null;
    const cutoff = Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000;
    charts.forEach((info) => {
      if (!info.dirty) return;
      info.points = info.points.filter((p) => p.x >= cutoff).slice(-MAX_POINTS);
      info.chart.data.datasets[0].data = info.points;
      info.chart.update("none");
      info.dirty = false;
    });
  };

  if (immediate) {
    flush();
    return;
  }

  if (chartFlushTimer !== null) return;
  chartFlushTimer = window.setTimeout(flush, CHART_FLUSH_INTERVAL_MS);
}

function updateChart(reading: LatestReading) {
  if (!isSensorSelected(reading.sensorId)) return;
  const chartInfo = ensureChart(reading.sensorId);

  if (reading.value !== null) {
    chartInfo.points.push({ x: reading.ts, y: reading.value });
    chartInfo.dirty = true;
    scheduleChartFlush();
  }

  const metadata = chartInfo.metadata;
  const zone =
    reading.value === null ? null : getCurrentZone(reading.value, metadata);
  const valueText =
    reading.value === null ? "--" : formatSensorValue(reading.value, metadata);
  const zoneText = zone ? ` — ${zone.label}` : "";
  chartInfo.statusEl.textContent = `${valueText}${zoneText} • ${formatRelative(
    reading.ts,
  )}`;
  chartInfo.card.dataset.zone = zone ? zone.color : "";
}

function handleReading(data: ApiReading, opts: { batch?: boolean } = {}) {
  const normalized: LatestReading = {
    sensorId: data.sensorId,
    sensorName:
      (data.sensorName && data.sensorName.trim()) ||
      latestMap.get(data.sensorId)?.sensorName ||
      prettyId(data.sensorId),
    value:
      typeof data.value === "number" && !Number.isNaN(data.value)
        ? data.value
        : null,
    ts:
      typeof data.ts === "number" && Number.isFinite(data.ts) ? data.ts : Date.now(),
    state:
      typeof data.state === "string" && data.state.trim().length > 0
        ? data.state.trim()
        : "",
  };

  recordReading(normalized);

  if (opts.batch) {
    if (isSensorSelected(normalized.sensorId)) {
      pendingUiRefresh = true;
    }
  } else if (isSensorSelected(normalized.sensorId)) {
    renderLatestTable();
    renderRecentActivity();
    renderLastUpdate();
  }

  updateChart(normalized);
}

async function loadHistory() {
  const since = (Date.now() + serverTimeDiff) - HISTORY_WINDOW_HOURS * 60 * 60 * 1000;
  try {
    const res = await fetch(`${API_BASE}/readings?since=${since}`);
    if (!res.ok) throw new Error(`Request failed with ${res.status}`);
    const body = (await res.json()) as ApiReading[];
    if (body.length === 0) return;

    await new Promise<void>((resolve) => {
      let index = 0;
      const processChunk = () => {
        const end = Math.min(index + HISTORY_BATCH_SIZE, body.length);
        for (let i = index; i < end; i++) {
          handleReading(body[i], { batch: true });
        }
        index = end;
        scheduleChartFlush();
        if (index < body.length) {
          pendingUiRefresh = true;
          window.requestAnimationFrame(processChunk);
        } else {
          flushUiIfNeeded();
          scheduleChartFlush(true);
          resolve();
        }
      };
      processChunk();
    });
  } catch (error) {
    console.warn("Failed to load historical data", error);
  }
}

function openStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  setStatus("connecting");

  const es = new EventSource(`${API_BASE}/stream`);
  eventSource = es;

  es.addEventListener("open", () => {
    reconnectDelayMs = 2000;
    setStatus("connected");
  });

  es.addEventListener("state", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (!payload || typeof payload.id !== "string") return;
      handleReading({
        sensorId: payload.id,
        value:
          typeof payload.value === "number" && !Number.isNaN(payload.value)
            ? payload.value
            : null,
        state: typeof payload.state === "string" ? payload.state : "",
        ts:
          typeof payload.ts === "number" && Number.isFinite(payload.ts)
            ? payload.ts
            : Date.now(),
      });
    } catch (e) {
      console.warn("Failed to parse stream payload", e);
    }
  });

  es.addEventListener("error", () => {
    setStatus("error");
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openStream();
  }, delay);
}

function setStatus(state: "connecting" | "connected" | "error") {
  statusEl.classList.remove("status-connecting", "status-connected", "status-error");
  const label =
    state === "connected"
      ? "Connected"
      : state === "connecting"
      ? "Connecting..."
      : "Disconnected";
  const cls =
    state === "connected"
      ? "status-connected"
      : state === "error"
      ? "status-error"
      : "status-connecting";
  statusEl.classList.add(cls);
  statusEl.textContent = label;
}

function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  const days = Math.round(diff / 86_400_000);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function updateTimeAgoLabels() {
  const now = Date.now();
  document.querySelectorAll<HTMLElement>(".time-ago").forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return;
    el.textContent = formatRelative(ts, now);
  });
  document.querySelectorAll<HTMLElement>(".event-time").forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return;
    el.textContent = new Date(ts).toLocaleTimeString();
  });
  renderLastUpdate();
}

function selectSensor(sensorId: string, opts: { skipSave?: boolean; silent?: boolean } = {}) {
  if (selectedSet.has(sensorId) || !SENSOR_REGISTRY[sensorId]) return;
  selectedSet.add(sensorId);
  selectedOrder.push(sensorId);
  ensureChart(sensorId);
  updateChartEmptyState();
  updatePickerSelection();
  if (!opts.silent) {
    pendingUiRefresh = true;
    flushUiIfNeeded();
  }
  if (!opts.skipSave) saveSelectedSensors();
}

function deselectSensor(sensorId: string, opts: { skipSave?: boolean } = {}) {
  if (!selectedSet.has(sensorId)) return;
  selectedSet.delete(sensorId);
  selectedOrder = selectedOrder.filter((id) => id !== sensorId);
  destroyChart(sensorId);
  updatePickerSelection();
  pendingUiRefresh = true;
  flushUiIfNeeded();
  if (!opts.skipSave) saveSelectedSensors();
}

function initializeSelection() {
  const stored = loadSelectedSensors();
  const seeds = stored.length > 0 ? stored : getDefaultSensors();
  seeds.forEach((id) => selectSensor(id, { skipSave: true, silent: true }));
  updateChartEmptyState();
}

function setupEvents() {
  pickerToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = pickerPanel.dataset.open === "true";
    setPickerOpen(!open);
  });

  pickerClose.addEventListener("click", () => setPickerOpen(false));
  pickerPanel.addEventListener("click", (event) => event.stopPropagation());

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && pickerPanel.contains(event.target)) {
      return;
    }
    if (event.target === pickerToggle) return;
    setPickerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setPickerOpen(false);
    }
  });

  pickerGroups.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".sensor-chip");
    if (!target) return;
    const sensorId = target.dataset.sensorId;
    if (!sensorId) return;
    if (selectedSet.has(sensorId)) {
      deselectSensor(sensorId);
    } else {
      selectSensor(sensorId);
    }
  });

  chartGrid.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>(".chart-action");
    if (!action) return;
    const sensorId = action.dataset.removeSensor;
    if (!sensorId) return;
    deselectSensor(sensorId);
  });
}

initializeSelection();
renderSensorPicker();
updatePickerSelection();
renderLatestTable();
renderRecentActivity();
renderLastUpdate();
updateChartEmptyState();
setupEvents();
async function syncServerTime() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    const config = await res.json();
    if (config.serverTime) {
      serverTimeDiff = config.serverTime - Date.now();
      const daysDiff = (serverTimeDiff / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`⏰ Server time offset: ${serverTimeDiff}ms (${daysDiff} days)`);
    }
  } catch (err) {
    console.warn("Could not sync server time:", err);
  }
}


async function init() {
  await syncServerTime();
  await loadHistory();
  openStream();
}

init();

setInterval(updateTimeAgoLabels, 15_000);
