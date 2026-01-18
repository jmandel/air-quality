// src/uploader.ts
var API_BASE = `${window.location.origin}/api`;
var FALLBACK_DEVICE_URL = "http://10.0.0.37/";
var MAX_LOG_ENTRIES = 200;
var deviceInput = document.getElementById("device-url");
var startButton = document.getElementById("start-button");
var stopButton = document.getElementById("stop-button");
var statusBadge = document.getElementById("upload-status");
var statReceived = document.getElementById("stat-received");
var statUploaded = document.getElementById("stat-uploaded");
var statDuplicates = document.getElementById("stat-duplicates");
var statLastPost = document.getElementById("stat-last-post");
var statBuffer = document.getElementById("stat-buffer");
var logArea = document.getElementById("log-area");
var pending = [];
var shouldRun = false;
var currentDeviceUrl = "";
var eventSource = null;
var flushTimer = null;
var reconnectTimer = null;
var reconnectAttempts = 0;
var receivedCount = 0;
var uploadedCount = 0;
var duplicateCount = 0;
var lastPostTs = null;
var pendingBytes = 0;
function normalizeDeviceUrl(raw) {
  return raw.replace(/\/+$/, "");
}
function estimateReadingSize(reading) {
  return JSON.stringify(reading).length;
}
function setStatus(state) {
  statusBadge.classList.remove("status-connecting", "status-connected", "status-error");
  let label = "Idle";
  if (state === "connecting") {
    label = "Connecting";
    statusBadge.classList.add("status-connecting");
  } else if (state === "streaming") {
    label = "Streaming";
    statusBadge.classList.add("status-connected");
  } else if (state === "error") {
    label = "Error";
    statusBadge.classList.add("status-error");
  }
  statusBadge.textContent = label;
}
function appendLog(message) {
  const stamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${stamp}] ${message}`;
  logArea.appendChild(entry);
  while (logArea.childElementCount > MAX_LOG_ENTRIES) {
    logArea.removeChild(logArea.firstChild);
  }
  logArea.scrollTop = logArea.scrollHeight;
}
function formatBytes(bytes) {
  if (bytes <= 0)
    return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
function updateStats() {
  statReceived.textContent = receivedCount.toString();
  statUploaded.textContent = uploadedCount.toString();
  statDuplicates.textContent = duplicateCount.toString();
  statBuffer.textContent = `${pending.length} (${formatBytes(pendingBytes)})`;
  if (lastPostTs) {
    statLastPost.textContent = new Date(lastPostTs).toLocaleTimeString();
    statLastPost.title = new Date(lastPostTs).toLocaleString();
  } else {
    statLastPost.textContent = "--";
    statLastPost.removeAttribute("title");
  }
}
function resetConnectionState() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}
function handleStateEvent(event) {
  if (!shouldRun)
    return;
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch (err) {
    appendLog("Ignoring malformed state event");
    return;
  }
  if (!payload || typeof payload.id !== "string") {
    appendLog("Ignoring event without sensor id");
    return;
  }
  const now = Date.now();
  const value = typeof payload.value === "number" && !Number.isNaN(payload.value) ? payload.value : null;
  const state = typeof payload.state === "string" ? payload.state.trim() : "";
  const eventId = typeof event.lastEventId === "string" && event.lastEventId.trim().length > 0 ? event.lastEventId : `${now}:${payload.id}`;
  const readingWithoutBytes = {
    ts: now,
    sensorId: payload.id,
    value,
    state,
    eventId
  };
  const reading = {
    ...readingWithoutBytes,
    bytes: estimateReadingSize(readingWithoutBytes)
  };
  pending.push(reading);
  pendingBytes += reading.bytes;
  receivedCount += 1;
  updateStats();
}
function handleLogEvent(event) {
  appendLog(`[device] ${event.data}`);
}
function scheduleReconnect() {
  if (!shouldRun)
    return;
  if (reconnectTimer !== null)
    return;
  reconnectAttempts += 1;
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);
  appendLog(`Connection lost, retrying in ${Math.round(delay / 1000)}s`);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (!shouldRun)
      return;
    connectToDevice();
  }, delay);
}
function connectToDevice() {
  if (!shouldRun || !currentDeviceUrl)
    return;
  resetConnectionState();
  setStatus("connecting");
  const eventsUrl = `${currentDeviceUrl}/events`;
  appendLog(`Connecting to ${eventsUrl}`);
  try {
    eventSource = new EventSource(eventsUrl);
  } catch (error) {
    appendLog("Failed to open device stream");
    setStatus("error");
    scheduleReconnect();
    return;
  }
  eventSource.addEventListener("open", () => {
    reconnectAttempts = 0;
    setStatus("streaming");
    appendLog("Device connection established");
  });
  eventSource.addEventListener("state", (event) => handleStateEvent(event));
  eventSource.addEventListener("log", (event) => handleLogEvent(event));
  eventSource.addEventListener("error", () => {
    setStatus("error");
    appendLog("Device connection error");
    resetConnectionState();
    scheduleReconnect();
  });
}
async function flushPending() {
  if (pending.length === 0)
    return;
  const batch = pending.splice(0, pending.length);
  let batchBytes = 0;
  for (const reading of batch) {
    batchBytes += reading.bytes;
  }
  pendingBytes = Math.max(0, pendingBytes - batchBytes);
  try {
    const response = await fetch(`${API_BASE}/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      keepalive: true
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json().catch(() => ({}));
    const inserted = typeof body?.inserted === "number" ? body.inserted : batch.length;
    const duplicates = typeof body?.duplicates === "number" ? body.duplicates : 0;
    uploadedCount += inserted;
    duplicateCount += duplicates;
    lastPostTs = Date.now();
    updateStats();
    appendLog(`Uploaded ${inserted} readings` + (duplicates ? ` (${duplicates} duplicates)` : ""));
  } catch (error) {
    appendLog(`Upload failed (${error.message ?? error})`);
    pending.unshift(...batch);
    pendingBytes += batchBytes;
  }
  updateStats();
}
function startUpload() {
  const rawUrl = deviceInput.value.trim();
  if (!rawUrl) {
    appendLog("Enter a device URL before starting");
    deviceInput.focus();
    return;
  }
  currentDeviceUrl = normalizeDeviceUrl(rawUrl);
  shouldRun = true;
  localStorage.setItem("air1-device-url", currentDeviceUrl);
  startButton.disabled = true;
  stopButton.disabled = false;
  deviceInput.disabled = true;
  setStatus("connecting");
  appendLog("Uploader started");
  connectToDevice();
  if (flushTimer === null) {
    flushTimer = window.setInterval(flushPending, 1000);
  }
}
function stopUpload() {
  shouldRun = false;
  resetConnectionState();
  if (flushTimer !== null) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
  startButton.disabled = false;
  stopButton.disabled = true;
  deviceInput.disabled = false;
  setStatus("idle");
  appendLog("Uploader stopped");
}
startButton.addEventListener("click", () => {
  if (!shouldRun) {
    startUpload();
  }
});
stopButton.addEventListener("click", () => {
  if (shouldRun) {
    stopUpload();
  }
});
window.addEventListener("beforeunload", () => {
  resetConnectionState();
});
async function initializeDeviceUrl() {
  const savedUrl = localStorage.getItem("air1-device-url");
  if (savedUrl) {
    deviceInput.value = savedUrl;
    appendLog("Loaded saved device URL from previous session");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/config`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.defaultSensorUrl === "string" && data.defaultSensorUrl.trim() !== "") {
        deviceInput.value = data.defaultSensorUrl;
        appendLog(`Default device URL loaded: ${data.defaultSensorUrl}`);
        return;
      }
    }
  } catch (error) {
    appendLog("Failed to load default device URL from server");
  }
  deviceInput.value = FALLBACK_DEVICE_URL;
  appendLog(`Using fallback device URL: ${FALLBACK_DEVICE_URL}`);
}
updateStats();
setStatus("idle");
initializeDeviceUrl().then(() => {
  if (!shouldRun && deviceInput.value.trim()) {
    startUpload();
  }
});
