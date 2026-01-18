// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __jsonParse = (a) => JSON.parse(a);
var __promiseAll = (args) => Promise.all(args);
var __require = import.meta.require;

// src/ask-history.ts
var exports_ask_history = {};
__export(exports_ask_history, {
  untrashItem: () => untrashItem,
  unstarItem: () => unstarItem,
  trashItem: () => trashItem,
  starItem: () => starItem,
  saveToHistory: () => saveToHistory,
  getStarredItems: () => getStarredItems,
  getHistoryMetadata: () => getHistoryMetadata,
  getHistoryItem: () => getHistoryItem,
  getHistory: () => getHistory,
  ASKED_DIR: () => ASKED_DIR
});
import { readdir, readFile, writeFile, mkdir, rename, unlink, symlink } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
function generateQuestionId(question) {
  return slugify(question);
}
async function saveToHistory(question, answer, conversationId, scriptContent, usedCachedScript) {
  const id = generateQuestionId(question);
  const timestamp = new Date().toISOString();
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  const answerPath = join(ASKED_DIR, `${id}-latest.json`);
  let metadata;
  if (existsSync(metadataPath)) {
    const existing = JSON.parse(await readFile(metadataPath, "utf-8"));
    metadata = {
      ...existing,
      lastRun: timestamp,
      runCount: existing.runCount + 1,
      runs: [
        ...existing.runs,
        { timestamp, conversationId, usedCachedScript }
      ]
    };
    console.log(`\uD83D\uDCDD Updated existing question (run #${metadata.runCount})`);
  } else {
    metadata = {
      id,
      question,
      firstAsked: timestamp,
      lastRun: timestamp,
      runCount: 1,
      runs: [{ timestamp, conversationId, usedCachedScript }]
    };
    console.log(`\uD83D\uDCDD Created new question entry`);
  }
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  await writeFile(scriptPath, scriptContent);
  await writeFile(answerPath, JSON.stringify({
    timestamp,
    question,
    answer,
    conversationId
  }, null, 2));
  return id;
}
async function getHistory(options = {}) {
  const files = await readdir(ASKED_DIR);
  const metadataFiles = files.filter((f) => f.endsWith(".json") && !f.endsWith("-latest.json"));
  const items = [];
  for (const file of metadataFiles) {
    const metadataPath = join(ASKED_DIR, file);
    const content = await readFile(metadataPath, "utf-8");
    const metadata = JSON.parse(content);
    const id = metadata.id;
    const starredPath = join(STARRED_DIR, basename(metadataPath));
    const trashedPath = join(TRASHED_DIR, basename(metadataPath));
    const starred = existsSync(starredPath);
    const trashed = existsSync(trashedPath);
    if (options.starred !== undefined && starred !== options.starred)
      continue;
    if (options.trashed !== undefined && trashed !== options.trashed)
      continue;
    const effectiveTimestamp = metadata.lastRun || metadata.timestamp || new Date().toISOString();
    items.push({
      id,
      timestamp: effectiveTimestamp,
      question: metadata.question,
      starred,
      trashed,
      scriptPath: join(ASKED_DIR, `${id}.ts`),
      metadataPath,
      runCount: metadata.runCount,
      lastRun: metadata.lastRun
    });
  }
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (options.limit) {
    return items.slice(0, options.limit);
  }
  return items;
}
async function getHistoryItem(id) {
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  if (!existsSync(metadataPath)) {
    return null;
  }
  const content = await readFile(metadataPath, "utf-8");
  const metadata = JSON.parse(content);
  const starredPath = join(STARRED_DIR, basename(metadataPath));
  const trashedPath = join(TRASHED_DIR, basename(metadataPath));
  return {
    id: metadata.id,
    timestamp: metadata.lastRun,
    question: metadata.question,
    starred: existsSync(starredPath),
    trashed: existsSync(trashedPath),
    scriptPath: join(ASKED_DIR, `${id}.ts`),
    metadataPath,
    runCount: metadata.runCount,
    lastRun: metadata.lastRun
  };
}
async function getHistoryMetadata(id) {
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  const answerPath = join(ASKED_DIR, `${id}-latest.json`);
  if (!existsSync(metadataPath)) {
    return null;
  }
  const metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
  let latestAnswer = null;
  if (existsSync(answerPath)) {
    latestAnswer = JSON.parse(await readFile(answerPath, "utf-8"));
  }
  return {
    ...metadata,
    latestAnswer
  };
}
async function starItem(id) {
  const item = await getHistoryItem(id);
  if (!item)
    return false;
  const starredPath = join(STARRED_DIR, basename(item.metadataPath));
  if (!existsSync(starredPath)) {
    await symlink(item.metadataPath, starredPath);
  }
  return true;
}
async function unstarItem(id) {
  const item = await getHistoryItem(id);
  if (!item)
    return false;
  const starredPath = join(STARRED_DIR, basename(item.metadataPath));
  if (existsSync(starredPath)) {
    await unlink(starredPath);
  }
  return true;
}
async function trashItem(id) {
  const item = await getHistoryItem(id);
  if (!item)
    return false;
  const metadataBasename = basename(item.metadataPath);
  const scriptBasename = basename(item.scriptPath);
  const answerBasename = `${id}-latest.json`;
  const trashedMetadataPath = join(TRASHED_DIR, metadataBasename);
  const trashedScriptPath = join(TRASHED_DIR, scriptBasename);
  const trashedAnswerPath = join(TRASHED_DIR, answerBasename);
  const answerPath = join(ASKED_DIR, answerBasename);
  await rename(item.metadataPath, trashedMetadataPath);
  await rename(item.scriptPath, trashedScriptPath);
  if (existsSync(answerPath)) {
    await rename(answerPath, trashedAnswerPath);
  }
  const starredPath = join(STARRED_DIR, metadataBasename);
  if (existsSync(starredPath)) {
    await unlink(starredPath);
  }
  return true;
}
async function untrashItem(id) {
  const metadataBasename = `${id}.json`;
  const scriptBasename = `${id}.ts`;
  const answerBasename = `${id}-latest.json`;
  const trashedMetadataPath = join(TRASHED_DIR, metadataBasename);
  const trashedScriptPath = join(TRASHED_DIR, scriptBasename);
  const trashedAnswerPath = join(TRASHED_DIR, answerBasename);
  if (!existsSync(trashedMetadataPath)) {
    return false;
  }
  const metadataPath = join(ASKED_DIR, metadataBasename);
  const scriptPath = join(ASKED_DIR, scriptBasename);
  const answerPath = join(ASKED_DIR, answerBasename);
  await rename(trashedMetadataPath, metadataPath);
  await rename(trashedScriptPath, scriptPath);
  if (existsSync(trashedAnswerPath)) {
    await rename(trashedAnswerPath, answerPath);
  }
  return true;
}
async function getStarredItems(limit = 5) {
  return getHistory({ starred: true, trashed: false, limit });
}
function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/--+/g, "-").substring(0, 80);
}
var ASKED_DIR, STARRED_DIR, TRASHED_DIR;
var init_ask_history = __esm(async () => {
  ASKED_DIR = join(import.meta.dir, "../asked");
  STARRED_DIR = join(ASKED_DIR, "starred");
  TRASHED_DIR = join(ASKED_DIR, "trashed");
  await mkdir(ASKED_DIR, { recursive: true });
  await mkdir(STARRED_DIR, { recursive: true });
  await mkdir(TRASHED_DIR, { recursive: true });
});

// src/ask-history-lookup.ts
import { readdir as readdir2, readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
import { existsSync as existsSync2 } from "fs";
async function findPreviousScript(question) {
  try {
    const normalizedQuestion = question.trim().toLowerCase();
    const files = await readdir2(ASKED_DIR2);
    const metadataFiles = files.filter((f) => f.endsWith(".json") && !f.includes("/"));
    const matches = [];
    for (const file of metadataFiles) {
      const metadataPath = join2(ASKED_DIR2, file);
      const content = await readFile2(metadataPath, "utf-8");
      const metadata = JSON.parse(content);
      if (metadata.question?.trim().toLowerCase() === normalizedQuestion) {
        const id = metadata.id;
        const scriptPath = join2(ASKED_DIR2, `${id}.ts`);
        if (existsSync2(scriptPath)) {
          matches.push({
            id,
            timestamp: metadata.timestamp,
            scriptPath
          });
        }
      }
    }
    if (matches.length === 0) {
      return null;
    }
    matches.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const mostRecent = matches[0];
    const scriptContent = await readFile2(mostRecent.scriptPath, "utf-8");
    return {
      scriptContent,
      scriptPath: mostRecent.scriptPath,
      previousId: mostRecent.id
    };
  } catch (error) {
    console.error("Error finding previous script:", error);
    return null;
  }
}
async function getQuestionCount(question) {
  try {
    const normalizedQuestion = question.trim().toLowerCase();
    const files = await readdir2(ASKED_DIR2);
    const metadataFiles = files.filter((f) => f.endsWith(".json") && !f.includes("/"));
    let count = 0;
    for (const file of metadataFiles) {
      const metadataPath = join2(ASKED_DIR2, file);
      const content = await readFile2(metadataPath, "utf-8");
      const metadata = JSON.parse(content);
      if (metadata.question?.trim().toLowerCase() === normalizedQuestion) {
        count++;
      }
    }
    return count;
  } catch (error) {
    console.error("Error counting questions:", error);
    return 0;
  }
}
var ASKED_DIR2;
var init_ask_history_lookup = __esm(() => {
  ASKED_DIR2 = join2(import.meta.dir, "../asked");
});

// src/bubblewrap-sandbox-streaming.ts
import { mkdir as mkdir2, writeFile as writeFile3 } from "fs/promises";
import { join as join4 } from "path";
var {spawn } = globalThis.Bun;
async function* streamShelleyInSandbox(prompt, workDir, timeoutMs = 180000) {
  await createShelleyConfig(workDir);
  const bwrapArgs = buildShelleyBwrapArgs(workDir);
  const proc = spawn([
    "bwrap",
    ...bwrapArgs,
    "/usr/local/bin/shelley",
    "-debug",
    "-config",
    "/work/shelley-config.json",
    "prompt",
    "-timeout",
    "180s",
    prompt
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: "/bun/bin:/usr/local/bin:/usr/bin:/bin",
      HOME: "/tmp"
    }
  });
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();
  const decoder = new TextDecoder;
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let stdoutDone = false;
  let stderrDone = false;
  try {
    while (!stdoutDone || !stderrDone) {
      const promises = [];
      if (!stdoutDone)
        promises.push(stdoutReader.read().then((r) => ({ stream: "stdout", ...r })));
      if (!stderrDone)
        promises.push(stderrReader.read().then((r) => ({ stream: "stderr", ...r })));
      const result = await Promise.race(promises);
      if (result.stream === "stdout") {
        if (result.done) {
          stdoutDone = true;
        } else {
          stdoutBuffer += decoder.decode(result.value, { stream: true });
          const lines = stdoutBuffer.split(`
`);
          stdoutBuffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim())
              yield { type: "shelley_progress", data: line };
          }
        }
      } else {
        if (result.done) {
          stderrDone = true;
        } else {
          stderrBuffer += decoder.decode(result.value, { stream: true });
          const lines = stderrBuffer.split(`
`);
          stderrBuffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim())
              yield { type: "shelley_progress", data: line };
          }
        }
      }
    }
    const exitCode = await proc.exited;
    clearTimeout(timeoutHandle);
    yield {
      type: "shelley_complete",
      data: { exitCode, timedOut }
    };
    if (exitCode !== 0) {
      throw new Error(`Shelley failed with exit code ${exitCode}`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}
async function runInSandbox(config) {
  const {
    scriptPath,
    dbPath,
    workDir,
    timeoutMs = 30000,
    allowNetwork = false
  } = config;
  await mkdir2(workDir, { recursive: true });
  try {
    const bwrapArgs = buildRunBwrapArgs(workDir, dbPath, allowNetwork);
    const scriptName = scriptPath.split("/").pop() || "analyze.ts";
    const proc = spawn(["bwrap", ...bwrapArgs, "/bun/bin/bun", `/work/${scriptName}`], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: "/bun/bin:/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        DATABASE_PATH: "/db/db.sqlite"
      }
    });
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    clearTimeout(timeoutHandle);
    return {
      stdout: stdoutBuf,
      stderr: stderrBuf,
      exitCode: exitCode || 0,
      timedOut
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: error.message || String(error),
      exitCode: 1,
      timedOut: false
    };
  }
}
function baseBwrapArgs(workDir) {
  return [
    ...SYSTEM_RO_BINDS,
    "--bind",
    workDir,
    "/work",
    "--dev-bind",
    "/dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--die-with-parent",
    "--new-session",
    "--chdir",
    "/work"
  ];
}
function buildRunBwrapArgs(workDir, dbPath, allowNetwork) {
  const bunDir = join4(process.env.HOME || "/home/exedev", ".bun");
  const args = [
    ...baseBwrapArgs(workDir),
    "--ro-bind",
    bunDir,
    "/bun",
    "--ro-bind",
    dbPath,
    "/db/db.sqlite"
  ];
  if (allowNetwork) {
    args.push(...NETWORK_BIND_ARGS, "--share-net");
  } else {
    args.push("--unshare-net");
  }
  return args;
}
function buildShelleyBwrapArgs(workDir) {
  const bunDir = join4(process.env.HOME || "/home/exedev", ".bun");
  const dbPath = "/home/exedev/app/db.sqlite";
  return [
    ...baseBwrapArgs(workDir),
    ...NETWORK_BIND_ARGS,
    "--ro-bind",
    bunDir,
    "/bun",
    "--ro-bind",
    dbPath,
    "/db/db.sqlite",
    "--share-net"
  ];
}
async function createShelleyConfig(workDir) {
  const tokenProc = spawn(["sudo", "/usr/local/bin/generate-gateway-token"], {
    stdout: "pipe"
  });
  const token = (await new Response(tokenProc.stdout).text()).trim();
  const config = {
    default_model: "claude-sonnet-4.5",
    llm_gateway: "https://exe.dev",
    key_generator: `echo '${token}'`
  };
  const configPath = join4(workDir, "shelley-config.json");
  await writeFile3(configPath, JSON.stringify(config, null, 2));
  return configPath;
}
var SYSTEM_RO_BINDS, NETWORK_BIND_ARGS;
var init_bubblewrap_sandbox_streaming = __esm(() => {
  SYSTEM_RO_BINDS = [
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/lib64",
    "/lib64",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/sbin",
    "/sbin"
  ];
  NETWORK_BIND_ARGS = [
    "--ro-bind",
    "/etc/resolv.conf",
    "/etc/resolv.conf",
    "--ro-bind",
    "/etc/ssl",
    "/etc/ssl",
    "--ro-bind",
    "/etc/ca-certificates",
    "/etc/ca-certificates"
  ];
});

// src/ask-stream-sandbox.ts
import { writeFile as writeFile4 } from "fs/promises";
async function* streamShelleyExecutionSandboxed(question, analyzePath, tempDir, prompt, useCachedScript, scriptContent) {
  if (useCachedScript && scriptContent) {
    yield { type: "status", data: "Using cached script..." };
    await writeFile4(analyzePath, scriptContent);
    yield { type: "cached", data: true };
  } else {
    yield { type: "status", data: "\uD83D\uDD12 Calling Shelley (sandboxed) to generate analysis script..." };
    try {
      for await (const event of streamShelleyInSandbox(prompt, tempDir, 180000)) {
        yield event;
      }
    } catch (e) {
      yield { type: "error", data: { message: `Shelley failed: ${e.message}` } };
      throw e;
    }
    const scriptExists = await Bun.file(analyzePath).exists();
    if (!scriptExists) {
      yield { type: "error", data: { message: "Shelley did not create the analyze script" } };
      throw new Error("Shelley did not create the analyze script");
    }
    scriptContent = await Bun.file(analyzePath).text();
    yield { type: "script_created", data: { path: analyzePath, size: scriptContent.length } };
  }
  yield { type: "status", data: "\uD83D\uDD12 Executing script (sandboxed)..." };
  const dbPath = "/home/exedev/app/db.sqlite";
  const scriptResult = await runInSandbox({
    scriptPath: analyzePath,
    dbPath,
    workDir: tempDir,
    timeoutMs: 30000,
    allowNetwork: false
  });
  yield { type: "script_complete", data: {
    exitCode: scriptResult.exitCode,
    outputLength: scriptResult.stdout.length
  } };
  if (scriptResult.exitCode !== 0) {
    yield { type: "error", data: {
      message: `Script failed: ${scriptResult.stderr}`,
      exitCode: scriptResult.exitCode
    } };
    throw new Error(`Script failed with exit code ${scriptResult.exitCode}`);
  }
  if (scriptResult.stderr) {
    const stderrLines = scriptResult.stderr.split(`
`).filter((l) => l.trim());
    for (const line of stderrLines) {
      yield { type: "script_progress", data: line };
    }
  }
  try {
    const dashboardResponse = JSON.parse(scriptResult.stdout.trim());
    yield { type: "result", data: dashboardResponse };
    yield { type: "done", data: { scriptContent } };
  } catch (e) {
    yield { type: "error", data: {
      message: `Failed to parse script output: ${e.message}`,
      stdout: scriptResult.stdout
    } };
    throw new Error(`Failed to parse script output: ${e.message}`);
  }
}
var init_ask_stream_sandbox = __esm(() => {
  init_bubblewrap_sandbox_streaming();
});

// src/dashboard-types.ts
var dashboard_types_default = `/**
 * Dashboard Response Schema
 * 
 * This schema defines the structure for dashboard responses from Shelley's analysis scripts.
 * All scripts must output JSON matching this schema to stdout.
 */

export interface DashboardResponse {
  /** Brief summary of the analysis (displayed at top of dashboard) */
  summary: string;
  
  /** Array of dashboard tiles/blocks to display */
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

/**
 * TEXT BLOCK
 * Displays formatted text content with optional title and color variant
 */
export interface TextBlock {
  type: "text";
  
  /** Optional title/heading for the text block */
  title?: string;
  
  /** Main text content (supports markdown) */
  content: string;
  
  /** Visual variant for color coding */
  variant?: "info" | "warning" | "success" | "error";
}

/**
 * METRIC BLOCK
 * Displays a large numeric value with unit, status indicator, and optional trend
 */
export interface MetricBlock {
  type: "metric";
  
  /** Title describing the metric */
  title: string;
  
  /** Numeric value to display */
  value: number;
  
  /** Unit of measurement (e.g., "ppm", "\xB5g/m\xB3", "\xB0C") */
  unit: string;
  
  /** Status level (affects background color) */
  status?: "good" | "warning" | "critical";
  
  /** Optional trend information */
  trend?: {
    /** Direction of change */
    direction: "up" | "down" | "stable";
    
    /** Percentage change (e.g., 15 for +15%) */
    percentage?: number;
    
    /** Time period for comparison (e.g., "vs last hour") */
    period?: string;
  };
}

/**
 * CHART BLOCK
 * Displays a bold line/bar/area chart with one or more data series
 */
export interface ChartBlock {
  type: "chart";
  
  /** Chart title */
  title: string;
  
  /** Type of chart visualization */
  chartType: "line" | "bar" | "area";
  
  /** X-axis configuration */
  xAxis: {
    /** Axis label */
    label: string;
    
    /** Data type (affects formatting) */
    type: "time" | "category";
  };
  
  /** Y-axis configuration */
  yAxis: {
    /** Axis label */
    label: string;
    
    /** Optional unit to display */
    unit?: string;
    
    /** Optional min value for Y-axis */
    min?: number;
    
    /** Optional max value for Y-axis */
    max?: number;
  };
  
  /** One or more data series to plot */
  series: Array<{
    /** Series name (for legend) */
    name: string;
    
    /** Line color (hex code) */
    color?: string;
    
    /** Array of data points */
    data: Array<{
      /** X-axis value (timestamp string for time, category name for category) */
      x: string | number;
      
      /** Y-axis numeric value */
      y: number;
    }>;
  }>;
  
  /** Optional threshold lines/annotations */
  annotations?: Array<{
    type: "threshold";
    
    /** Y-axis value for the line */
    value: number;
    
    /** Label text */
    label: string;
    
    /** Line color (hex code) */
    color?: string;
  }>;
}

// EXAMPLES

export const exampleTextBlock: TextBlock = {
  type: "text",
  title: "Air Quality Status",
  content: "The air quality is **good** right now. All sensors are reporting normal values.",
  variant: "success"
};

export const exampleMetricBlock: MetricBlock = {
  type: "metric",
  title: "Current CO\u2082",
  value: 450,
  unit: "ppm",
  status: "good",
  trend: {
    direction: "down",
    percentage: 5.2,
    period: "vs 1h ago"
  }
};

export const exampleChartBlock: ChartBlock = {
  type: "chart",
  title: "CO\u2082 Levels - Last Hour",
  chartType: "line",
  xAxis: {
    label: "Time",
    type: "time"
  },
  yAxis: {
    label: "Concentration",
    unit: "ppm",
    min: 0
  },
  series: [{
    name: "CO\u2082",
    color: "#3b82f6",
    data: [
      { x: "2025-11-15T20:00:00Z", y: 420 },
      { x: "2025-11-15T20:15:00Z", y: 435 },
      { x: "2025-11-15T20:30:00Z", y: 445 },
      { x: "2025-11-15T20:45:00Z", y: 450 }
    ]
  }],
  annotations: [{
    type: "threshold",
    value: 800,
    label: "Warning threshold",
    color: "#f59e0b"
  }]
};
`;
var init_dashboard_types = () => {};

// src/ask-stream-route-sandbox.ts
var exports_ask_stream_route_sandbox = {};
__export(exports_ask_stream_route_sandbox, {
  handleAskStreamSandboxed: () => handleAskStreamSandboxed
});
import { mkdtemp as mkdtemp2, rm as rm2 } from "fs/promises";
import { tmpdir as tmpdir2 } from "os";
import { join as join5 } from "path";
async function handleAskStreamSandboxed(req) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query");
  const historyId = url.searchParams.get("id");
  if (!query && !historyId) {
    return Response.json({
      error: "Missing query parameter. Use ?q=your_question or ?id=history_id"
    }, { status: 400 });
  }
  const tempDir = await mkdtemp2(join5(tmpdir2(), "airq-ask-"));
  const analyzePath = join5(tempDir, "analyze.ts");
  let useCachedScript = false;
  let scriptContent;
  let actualQuery = query;
  if (historyId) {
    const { getHistoryMetadata: getHistoryMetadata2, ASKED_DIR: ASKED_DIR3 } = await init_ask_history().then(() => exports_ask_history);
    const metadata = await getHistoryMetadata2(historyId);
    if (!metadata) {
      return Response.json({ error: "History item not found" }, { status: 404 });
    }
    actualQuery = metadata.question;
    const scriptPath = join5(ASKED_DIR3, `${historyId}.ts`);
    const { existsSync: existsSync3 } = await import("fs");
    if (existsSync3(scriptPath)) {
      const { readFile: readFile3 } = await import("fs/promises");
      scriptContent = await readFile3(scriptPath, "utf-8");
      useCachedScript = true;
    }
  } else {
    const previousScript = await findPreviousScript(query);
    useCachedScript = !!previousScript;
    scriptContent = previousScript?.scriptContent;
  }
  const now = new Date().toISOString();
  const nowMs = Date.now();
  function buildSchemaSection() {
    const { Database } = __require("bun:sqlite");
    const db = new Database("/home/exedev/app/db.sqlite", { readonly: true });
    try {
      const sensors = db.query("SELECT * FROM sensors ORDER BY id").all();
      const readingsSchema = db.query("PRAGMA table_info(readings)").all();
      const aggSchema = db.query("PRAGMA table_info(readings_aggregated)").all();
      const indexes = db.query(`
      SELECT name, tbl_name 
      FROM sqlite_master 
      WHERE type='index' AND sql IS NOT NULL
    `).all();
      let schema = `DATABASE SCHEMA:

`;
      schema += `Table: readings (raw sensor data, 7-day retention)
`;
      schema += `Columns:
`;
      readingsSchema.forEach((col) => {
        const pk = col.pk ? " PRIMARY KEY" : "";
        const notnull = col.notnull ? " NOT NULL" : "";
        schema += `  - ${col.name}: ${col.type}${pk}${notnull}
`;
      });
      schema += `Note: ts is milliseconds since epoch (e.g., Date.now())

`;
      schema += `Table: readings_aggregated (per-minute summaries, permanent retention)
`;
      schema += `Columns:
`;
      aggSchema.forEach((col) => {
        const pk = col.pk ? " PRIMARY KEY" : "";
        const notnull = col.notnull ? " NOT NULL" : "";
        schema += `  - ${col.name}: ${col.type}${pk}${notnull}
`;
      });
      schema += `Note: Use this table for queries > 2 hours for better performance

`;
      const readingsIndexes = indexes.filter((i) => i.tbl_name === "readings");
      const aggIndexes = indexes.filter((i) => i.tbl_name === "readings_aggregated");
      schema += "Indexes on readings: ";
      schema += readingsIndexes.map((i) => i.name).join(", ") + `
`;
      schema += "Indexes on readings_aggregated: ";
      schema += aggIndexes.map((i) => i.name).join(", ") + `

`;
      schema += `AVAILABLE SENSORS:

`;
      sensors.forEach((s) => {
        const display = s.display_name || s.name;
        const unit = s.unit || "n/a";
        schema += `${s.id}. ${s.name} \u2192 "${display}" (${unit})
`;
      });
      schema += `
COMMON SENSOR THRESHOLDS:
`;
      schema += `- CO\u2082 (id=1): good <800ppm, warning 800-1000, critical >1000
`;
      schema += `- PM2.5 (id=9): good <12, warning 12-35, critical >35 \xB5g/m\xB3
`;
      schema += `- VOC Index (id=20): good <100, warning 100-250, critical >250
`;
      schema += `- Temperature (id=16): typical 20-30\xB0C
`;
      schema += `- Humidity (id=18): comfortable 40-60%
`;
      return schema;
    } finally {
      db.close();
    }
  }
  const schemaSection = buildSchemaSection();
  const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${actualQuery || query}"

DATABASE LOCATION: /db/db.sqlite
NOTE: The database is mounted read-only inside the sandbox at /db/db.sqlite

DATABASE SCHEMA:
${schemaSection}

CURRENT TIME: ${now} (${nowMs} ms)

YOUR TASK:
Write a TypeScript script called "analyze.ts" and save it to: /work/analyze.ts

The script MUST:
1. Query /db/db.sqlite using bun:sqlite (open in readonly mode)
2. Answer the user's question with data
3. Output ONLY valid JSON to stdout (use console.log())
4. Follow the EXACT DashboardResponse schema below

IMPORTANT - WRITE REUSABLE SCRIPTS:
- If the question mentions "today", "now", "current", or relative times: Calculate these INSIDE the script using Date.now()
- DO NOT hardcode timestamps - scripts are re-executed to get fresh data
- Scripts should produce correct results whenever they run, not just at generation time
- Example: For "today's peak", use: const startOfToday = new Date().setHours(0,0,0,0)

EXAMPLE - BAD (hardcoded):
  const today = 1763308454049; // \u274C Will be wrong when re-run tomorrow


COMPLETE WORKING EXAMPLES (adapt these patterns for your query):

Example 1: Simple query with statistics
  import { Database } from "bun:sqlite";
  const db = new Database("/db/db.sqlite", { readonly: true });
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const stmt = db.prepare("SELECT ts, value FROM readings WHERE sensor_id = ? AND ts >= ? ORDER BY ts ASC");
  const readings = stmt.all(1, oneHourAgo);
  const values = readings.map(r => r.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const response = { summary: "CO\u2082 averaged " + Math.round(avg) + " ppm", blocks: [...] };
  console.log(JSON.stringify(response, null, 2));
  db.close();

Example 2: Using aggregated data (for longer time ranges)
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const stmt = db.prepare("SELECT minute_ts, avg_value FROM readings_aggregated WHERE sensor_id = ? AND minute_ts >= ?");
  const aggData = stmt.all(9, oneDayAgo);  // PM2.5
  const dailyAvg = aggData.reduce((sum, r) => sum + r.avg_value, 0) / aggData.length;

Example 3: Time-based comparisons
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
  const todayData = db.prepare("SELECT AVG(value) as avg FROM readings WHERE sensor_id = 1 AND ts >= ?").get(startOfToday);
  const yesterdayData = db.prepare("SELECT AVG(value) as avg FROM readings WHERE sensor_id = 1 AND ts >= ? AND ts < ?").get(startOfYesterday, startOfToday);
  const change = todayData.avg - yesterdayData.avg;

SENSOR IDs: 1=CO\u2082, 9=PM2.5, 16=temp, 18=humidity, 20=VOC (see full list above)
TIPS: Use prepared statements, close db when done, timestamps in milliseconds, use aggregated table for >2hr queries

REQUIRED OUTPUT SCHEMA:

${dashboard_types_default}

Now write analyze.ts to ${analyzePath} that answers: "${query}"`;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let finalScriptContent = scriptContent;
        let dashboardResult;
        for await (const event of streamShelleyExecutionSandboxed(actualQuery || query, analyzePath, tempDir, prompt, useCachedScript, scriptContent)) {
          const data = `event: ${event.type}
data: ${JSON.stringify(event.data)}

`;
          controller.enqueue(new TextEncoder().encode(data));
          if (event.type === "result") {
            dashboardResult = event.data;
          }
          if (event.type === "done") {
            finalScriptContent = event.data.scriptContent;
          }
        }
        if (dashboardResult && finalScriptContent) {
          const scriptEvent = `event: script
data: ${JSON.stringify({ content: finalScriptContent })}

`;
          controller.enqueue(new TextEncoder().encode(scriptEvent));
          const conversationId = `cli-${Date.now()}`;
          const historyId2 = await saveToHistory(actualQuery || query, dashboardResult, conversationId, finalScriptContent, useCachedScript);
          const finalEvent = `event: saved
data: ${JSON.stringify({ historyId: historyId2 })}

`;
          controller.enqueue(new TextEncoder().encode(finalEvent));
        }
        controller.close();
        await rm2(tempDir, { recursive: true, force: true }).catch(() => {});
      } catch (error) {
        const errorEvent = `event: error
data: ${JSON.stringify({ message: error.message })}

`;
        controller.enqueue(new TextEncoder().encode(errorEvent));
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
var init_ask_stream_route_sandbox = __esm(async () => {
  init_ask_history_lookup();
  init_ask_stream_sandbox();
  init_dashboard_types();
  await init_ask_history();
});

// src/ask-api-routes.ts
var exports_ask_api_routes = {};
__export(exports_ask_api_routes, {
  handleAskApiRoute: () => handleAskApiRoute
});
function handleAskApiRoute(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  try {
    if (path === "/api/ask/history" && method === "GET") {
      return handleGetHistory(url);
    }
    if (path === "/api/ask/starred" && method === "GET") {
      return handleGetStarred();
    }
    if (path.startsWith("/api/ask/star/")) {
      const id = path.split("/").pop();
      if (!id)
        return Response.json({ error: "Missing ID" }, { status: 400 });
      if (method === "POST") {
        return handleStarItem(id);
      } else if (method === "DELETE") {
        return handleUnstarItem(id);
      }
    }
    if (path.startsWith("/api/ask/trash/")) {
      const id = path.split("/").pop();
      if (!id)
        return Response.json({ error: "Missing ID" }, { status: 400 });
      if (method === "POST") {
        return handleTrashItem(id);
      } else if (method === "DELETE") {
        return handleUntrashItem(id);
      }
    }
    return null;
  } catch (error) {
    console.error("Error in ask API route:", error);
    return Response.json({
      error: "Internal server error",
      message: error.message
    }, { status: 500 });
  }
}
async function handleGetHistory(url) {
  const limit = parseInt(url.searchParams.get("limit") || "1000");
  const starred = url.searchParams.get("starred") === "true" ? true : undefined;
  const trashed = url.searchParams.get("trashed") === "true" ? true : undefined;
  const items = await getHistory({ limit, starred, trashed });
  return Response.json({ items });
}
async function handleGetStarred() {
  const items = await getStarredItems(5);
  return Response.json({ items });
}
async function handleStarItem(id) {
  const success = await starItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
async function handleUnstarItem(id) {
  const success = await unstarItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
async function handleTrashItem(id) {
  const success = await trashItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
async function handleUntrashItem(id) {
  const success = await untrashItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
var init_ask_api_routes = __esm(async () => {
  await init_ask_history();
});

// src/index.ts
var {serve } = globalThis.Bun;
import { Database } from "bun:sqlite";

// src/index.html
var src_default = __jsonParse("{\"index\":\"./index.html\",\"files\":[{\"input\":\"index.html\",\"path\":\"./index-1e7t7e5d.js\",\"loader\":\"js\",\"isEntry\":true,\"headers\":{\"etag\":\"FE2pxc4OABc\",\"content-type\":\"text/javascript;charset=utf-8\"}},{\"input\":\"index.html\",\"path\":\"./index.html\",\"loader\":\"html\",\"isEntry\":true,\"headers\":{\"etag\":\"IKzhSAWHPP0\",\"content-type\":\"text/html;charset=utf-8\"}}]}");

// src/upload.html
var upload_default = __jsonParse("{\"index\":\"./upload.html\",\"files\":[{\"input\":\"upload.html\",\"path\":\"./upload-qa3yryjv.js\",\"loader\":\"js\",\"isEntry\":true,\"headers\":{\"etag\":\"zMNtH0FJ55Y\",\"content-type\":\"text/javascript;charset=utf-8\"}},{\"input\":\"upload.html\",\"path\":\"./upload.html\",\"loader\":\"html\",\"isEntry\":true,\"headers\":{\"etag\":\"y2ghMtGu-BE\",\"content-type\":\"text/html;charset=utf-8\"}}]}");

// src/ask.html
var ask_default = __jsonParse("{\"index\":\"./ask.html\",\"files\":[{\"input\":\"ask.html\",\"path\":\"./ask-7kzvfxgf.js\",\"loader\":\"js\",\"isEntry\":true,\"headers\":{\"etag\":\"WWnsAekUEHE\",\"content-type\":\"text/javascript;charset=utf-8\"}},{\"input\":\"ask.html\",\"path\":\"./ask.html\",\"loader\":\"html\",\"isEntry\":true,\"headers\":{\"etag\":\"7AIzRp3YtVg\",\"content-type\":\"text/html;charset=utf-8\"}}]}");

// src/test-stream.html
var test_stream_default = __jsonParse("{\"index\":\"./test-stream.html\",\"files\":[{\"input\":\"test-stream.html\",\"path\":\"./test-stream-fsjay33b.js\",\"loader\":\"js\",\"isEntry\":true,\"headers\":{\"etag\":\"ICH9GKAIFzk\",\"content-type\":\"text/javascript;charset=utf-8\"}},{\"input\":\"test-stream.html\",\"path\":\"./test-stream.html\",\"loader\":\"html\",\"isEntry\":true,\"headers\":{\"etag\":\"dROhEb1ZPw4\",\"content-type\":\"text/html;charset=utf-8\"}}]}");

// src/seed-data.ts
var SENSOR_SEED_DATA = [
  { id: 1, name: "co2_ppm", display_name: "CO\u2082", unit: "ppm" },
  { id: 2, name: "sen55_temp_c", display_name: "Temperature (SEN55)", unit: "\xB0C" },
  { id: 3, name: "sen55_humidity_pct", display_name: "Humidity", unit: "%" },
  { id: 4, name: "voc_index", display_name: "VOC Index", unit: "" },
  { id: 5, name: "nox_index", display_name: "NOx Index", unit: "" },
  { id: 6, name: "pressure_hpa", display_name: "Pressure", unit: "hPa" },
  { id: 7, name: "dps_temp_c", display_name: "Temperature (DPS310)", unit: "\xB0C" },
  { id: 8, name: "pm1", display_name: "PM 1.0", unit: "\xB5g/m\xB3" },
  { id: 9, name: "pm2_5", display_name: "PM 2.5", unit: "\xB5g/m\xB3" },
  { id: 10, name: "pm4", display_name: "PM 4.0", unit: "\xB5g/m\xB3" },
  { id: 11, name: "pm10", display_name: "PM 10", unit: "\xB5g/m\xB3" },
  { id: 12, name: "pm0_3_to_1", display_name: "PM 0.3-1.0\u03BCm", unit: "\xB5g/m\xB3" },
  { id: 13, name: "pm1_to_2_5", display_name: "PM 1.0-2.5\u03BCm", unit: "\xB5g/m\xB3" },
  { id: 14, name: "pm2_5_to_4", display_name: "PM 2.5-4.0\u03BCm", unit: "\xB5g/m\xB3" },
  { id: 15, name: "pm4_to_10", display_name: "PM 4.0-10\u03BCm", unit: "\xB5g/m\xB3" },
  { id: 16, name: "no2", display_name: "NO\u2082", unit: "ppm" },
  { id: 17, name: "co", display_name: "CO", unit: "ppm" },
  { id: 18, name: "h2", display_name: "Hydrogen", unit: "ppm" },
  { id: 19, name: "ethanol", display_name: "Ethanol", unit: "ppm" },
  { id: 20, name: "ch4", display_name: "Methane", unit: "ppm" },
  { id: 21, name: "nh3", display_name: "Ammonia", unit: "ppm" },
  { id: 22, name: "esp_temp_c", display_name: "ESP Temperature", unit: "\xB0C" },
  { id: 23, name: "wifi_rssi_dbm", display_name: "Signal Strength", unit: "dBm" },
  { id: 24, name: "uptime_s", display_name: "Uptime", unit: "seconds" }
];

// src/ask-helper.ts
init_ask_history_lookup();
await init_ask_history();
import { mkdtemp, rm, writeFile as writeFile2 } from "fs/promises";
import { tmpdir } from "os";
import { join as join3 } from "path";
async function askShelley(question) {
  const tempDir = await mkdtemp(join3(tmpdir(), "airq-ask-"));
  const analyzePath = join3(tempDir, "analyze.ts");
  let scriptContent;
  let usedCachedScript = false;
  let previousId;
  const previousScript = await findPreviousScript(question);
  if (previousScript) {
    console.log(`\u267B\uFE0F  Using cached script from ${previousScript.previousId}`);
    scriptContent = previousScript.scriptContent;
    usedCachedScript = true;
    previousId = previousScript.previousId;
    await writeFile2(analyzePath, scriptContent);
  } else {
    console.log(`\uD83E\uDD16 No cached script found, calling Shelley...`);
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const sixHoursAgo = nowMs - 6 * 60 * 60 * 1000;
    const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${question}"

DATABASE LOCATION: /home/exedev/app/db.sqlite

DATABASE SCHEMA:
- Table: sensors
  Columns: id (INTEGER PRIMARY KEY), name (TEXT), display_name (TEXT), unit (TEXT)
  
- Table: readings  
  Columns: id, ts (INTEGER milliseconds since epoch), sensor_id (FOREIGN KEY), value (REAL)
  Indexes: idx_readings_ts, idx_readings_sensor_id
  Note: ts is stored in milliseconds (e.g., ${nowMs} = ${now})

AVAILABLE SENSORS (name \u2192 display_name, unit):
- co2_ppm \u2192 "CO\u2082", ppm (good < 800, warning 800-1000, critical > 1000)
- pm2_5_ug_m3 \u2192 "PM 2.5", \xB5g/m\xB3 (good < 12, warning 12-35, critical > 35)
- sen55_temp_c \u2192 "Temperature", \xB0C (typical: 20-30)
- sen55_humidity_pct \u2192 "Humidity", % (comfortable 40-60)
- sen55_voc_index \u2192 "VOC Index", index (good < 100, warning 100-250, critical > 250)
(+ 18 more sensors available)

CURRENT TIME: ${now} (${nowMs} ms)
SIX HOURS AGO: ${sixHoursAgo} ms

YOUR TASK:
Write a TypeScript script called "analyze.ts" and save it to: ${analyzePath}

The script MUST:
1. Query /home/exedev/app/db.sqlite using bun:sqlite
2. Answer the user's question with data
3. Output ONLY valid JSON to stdout (no console.log, no errors)
4. Follow the DashboardResponse schema

CRITICAL: stdout must be ONLY valid JSON. Use console.error() for debugging.

TYPESCRIPT TEMPLATE:

#!/usr/bin/env bun
import { Database } from "bun:sqlite";

interface DashboardResponse {
  summary: string;
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

interface TextBlock {
  type: "text";
  title?: string;
  content: string;
  variant?: "info" | "warning" | "success" | "error";
}

interface MetricBlock {
  type: "metric";
  title: string;
  value: number;
  unit: string;
  status?: "good" | "warning" | "critical";
  trend?: {
    direction: "up" | "down" | "stable";
    percentage?: number;
    period?: string;
  };
}

interface ChartBlock {
  type: "chart";
  title: string;
  chartType: "line" | "bar" | "area";
  xAxis: { label: string; type: "time" | "category" };
  yAxis: { label: string; unit?: string; min?: number; max?: number };
  series: Array<{
    name: string;
    color?: string;
    data: Array<{ x: string | number; y: number }>;
  }>;
  annotations?: Array<{
    type: "threshold";
    value: number;
    label: string;
    color?: string;
  }>;
}

try {
  const db = new Database("/home/exedev/app/db.sqlite");
  
  // Get sensor
  const sensor = db.query("SELECT id, display_name, unit FROM sensors WHERE name = ?").get("co2_ppm");
  const sensorId = sensor.id;
  
  // Get current value
  const current = db.query("SELECT value FROM readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1").get(sensorId);
  
  // Get recent data
  const recentData = db.query(\`
    SELECT ts, value 
    FROM readings 
    WHERE sensor_id = ? AND ts >= ?
    ORDER BY ts ASC
  \`).all(sensorId, ${sixHoursAgo});
  
  const response: DashboardResponse = {
    summary: \`Current \${sensor.display_name} is \${current.value} \${sensor.unit}\`,
    blocks: [
      {
        type: "metric",
        title: \`Current \${sensor.display_name}\`,
        value: current.value,
        unit: sensor.unit,
        status: "good"
      },
      {
        type: "chart",
        title: \`\${sensor.display_name} - Recent Readings\`,
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "Concentration", unit: sensor.unit },
        series: [{
          name: sensor.display_name,
          color: "#3b82f6",
          data: recentData.map(r => ({
            x: new Date(r.ts).toISOString(),
            y: r.value
          }))
        }]
      }
    ]
  };
  
  console.log(JSON.stringify(response, null, 2));
  db.close();
  
} catch (error) {
  console.error("Error:", error);
  console.log(JSON.stringify({
    summary: "Error analyzing data",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  }));
}

Now write analyze.ts to ${analyzePath} that answers: "${question}"`;
    const shelleyProc = Bun.spawn(["shelley", "-config", "/exe.dev/shelley.json", "-model", "claude-sonnet-4.5", "prompt", "-timeout", "180s", prompt], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
      }
    });
    const shelleyStdout = await new Response(shelleyProc.stdout).text();
    const shelleyStderr = await new Response(shelleyProc.stderr).text();
    const shelleyExit = await shelleyProc.exited;
    console.log(`\uD83D\uDCDD Shelley exit: ${shelleyExit}, output: ${shelleyStdout.length} chars`);
    if (shelleyStderr)
      console.log(`\uD83D\uDCDD Shelley stderr:
${shelleyStderr}`);
    if (shelleyExit !== 0) {
      throw new Error(`Shelley failed with exit code ${shelleyExit}: ${shelleyStderr}`);
    }
    const scriptExists = await Bun.file(analyzePath).exists();
    console.log(`\uD83D\uDCC4 Script exists at ${analyzePath}: ${scriptExists}`);
    if (!scriptExists) {
      console.error("\u26A0\uFE0F analyze.ts was not created by Shelley");
      console.error(`\uD83D\uDCCB Shelley response:
`, shelleyStdout.substring(0, 1000));
      throw new Error("Shelley did not create the analyze script");
    }
    scriptContent = await Bun.file(analyzePath).text();
    console.log(`\u2705 Script created (${scriptContent.length} bytes)`);
  }
  console.log("\uD83D\uDE80 Executing analyze.ts...");
  const analyzeProc = Bun.spawn([`${process.env.HOME}/.bun/bin/bun`, analyzePath], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: tempDir,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
    }
  });
  const jsonOutput = await new Response(analyzeProc.stdout).text();
  const analyzeStderr = await new Response(analyzeProc.stderr).text();
  const analyzeExit = await analyzeProc.exited;
  console.log(`\uD83D\uDCCA Script exit: ${analyzeExit}, output: ${jsonOutput.length} chars`);
  if (analyzeStderr)
    console.log(`\uD83D\uDCCA Stderr:
${analyzeStderr}`);
  if (analyzeExit !== 0) {
    throw new Error(`Analyze script failed with exit code ${analyzeExit}`);
  }
  const dashboardResponse = JSON.parse(jsonOutput.trim());
  console.log(`\u2705 Parsed dashboard with ${dashboardResponse.blocks.length} blocks`);
  const questionCount = await getQuestionCount(question);
  console.log(`\uD83D\uDCCA Question asked ${questionCount} time(s) before`);
  const conversationId = `cli-${Date.now()}`;
  const historyId = await saveToHistory(question, dashboardResponse, conversationId, scriptContent, usedCachedScript);
  console.log(`\uD83D\uDCBE Saved to history: ${historyId} ${usedCachedScript ? "(reused script)" : "(new script)"}`);
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  return {
    answer: dashboardResponse,
    conversationId,
    scriptPath: analyzePath,
    usedCachedScript,
    previousId
  };
}

// src/sensor-registry.ts
var SENSOR_REGISTRY = {
  co2_ppm: {
    displayName: "CO\u2082",
    defaultVisible: true,
    unit: "ppm",
    decimalPlaces: 0,
    yAxis: { min: 0, max: 2000 },
    defaultTimeWindow: 6,
    category: "fast",
    healthPriority: "primary",
    description: "Carbon dioxide - primary ventilation indicator",
    zones: [
      { min: 0, max: 400, label: "Excellent", color: "green", description: "Outdoor baseline" },
      { min: 400, max: 800, label: "Good", color: "green", description: "Optimal indoor" },
      { min: 800, max: 1000, label: "Acceptable", color: "yellow", description: "Minor ventilation improvement" },
      { min: 1000, max: 1400, label: "Moderate", color: "orange", description: "Increase ventilation" },
      { min: 1400, max: 2000, label: "Poor", color: "red", description: "Ventilation required" },
      { min: 2000, max: Infinity, label: "Very Poor", color: "purple", description: "Immediate action" }
    ],
    thresholdLines: [
      { value: 800, label: "800 ppm (Good limit)", color: "#fbbf24" },
      { value: 1000, label: "1000 ppm (Acceptable limit)", color: "#f97316" },
      { value: 1400, label: "1400 ppm (Poor)", color: "#dc2626" }
    ],
    standards: ["ASHRAE", "EPA"]
  },
  sen55_temp_c: {
    displayName: "Temperature",
    defaultVisible: true,
    unit: "\xB0C",
    decimalPlaces: 1,
    yAxis: { min: 15, max: 30 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Indoor temperature from SEN55 - comfort indicator",
    zones: [
      { min: 0, max: 18, label: "Cold", color: "blue" },
      { min: 18, max: 20.5, label: "Cool", color: "green" },
      { min: 20.5, max: 25.5, label: "Optimal", color: "green", description: "ASHRAE comfort" },
      { min: 25.5, max: 27, label: "Warm", color: "yellow" },
      { min: 27, max: Infinity, label: "Hot", color: "orange" }
    ],
    thresholdLines: [
      { value: 20, label: "Comfort lower", color: "#10b981", lineStyle: "dashed" },
      { value: 26, label: "Comfort upper", color: "#10b981", lineStyle: "dashed" }
    ],
    standards: ["ASHRAE 55"]
  },
  sen55_humidity_pct: {
    displayName: "Humidity",
    defaultVisible: true,
    unit: "%",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Relative humidity - comfort and mold risk indicator",
    zones: [
      { min: 0, max: 30, label: "Too Dry", color: "orange", description: "Respiratory irritation" },
      { min: 30, max: 40, label: "Good", color: "green" },
      { min: 40, max: 60, label: "Optimal", color: "green", description: "ASHRAE recommended" },
      { min: 60, max: 70, label: "Moderate", color: "yellow", description: "Mold risk increases" },
      { min: 70, max: 80, label: "High", color: "orange", description: "Mold growth likely" },
      { min: 80, max: Infinity, label: "Very High", color: "red", description: "Condensation risk" }
    ],
    thresholdLines: [
      { value: 30, label: "30% (Lower optimal)", color: "#10b981" },
      { value: 60, label: "60% (Upper optimal)", color: "#10b981" },
      { value: 70, label: "70% (Mold risk)", color: "#dc2626" }
    ],
    standards: ["ASHRAE"]
  },
  voc_index: {
    displayName: "VOC Index",
    defaultVisible: true,
    unit: "",
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Volatile organic compounds index - chemical exposure indicator",
    zones: [
      { min: 0, max: 50, label: "Excellent", color: "green", description: "Much cleaner than average" },
      { min: 50, max: 100, label: "Good", color: "green", description: "At or below average" },
      { min: 100, max: 200, label: "Moderate", color: "yellow", description: "Slightly elevated" },
      { min: 200, max: 300, label: "Poor", color: "orange" },
      { min: 300, max: 400, label: "Very Poor", color: "red" },
      { min: 400, max: Infinity, label: "Hazardous", color: "purple" }
    ],
    thresholdLines: [
      { value: 100, label: "Average baseline", color: "#fbbf24" },
      { value: 200, label: "Elevated", color: "#f97316" }
    ]
  },
  nox_index: {
    displayName: "NOx Index",
    defaultVisible: true,
    unit: "",
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 6,
    category: "fast",
    healthPriority: "secondary",
    description: "Nitrogen oxides index from SEN55",
    zones: [
      { min: 0, max: 100, label: "Good", color: "green" },
      { min: 100, max: 200, label: "Moderate", color: "yellow" },
      { min: 200, max: 300, label: "Poor", color: "orange" },
      { min: 300, max: Infinity, label: "Unhealthy", color: "red" }
    ],
    thresholdLines: [
      { value: 100, label: "Average baseline", color: "#fbbf24" }
    ]
  },
  pressure_hpa: {
    displayName: "Pressure",
    unit: "hPa",
    decimalPlaces: 1,
    yAxis: { min: 980, max: 1040 },
    defaultTimeWindow: 48,
    category: "slow",
    healthPriority: "support",
    description: "Atmospheric pressure from DPS310 - weather indicator",
    zones: [
      { min: 0, max: 980, label: "Very Low", color: "blue" },
      { min: 980, max: 1000, label: "Low", color: "green" },
      { min: 1000, max: 1020, label: "Normal", color: "green" },
      { min: 1020, max: 1040, label: "High", color: "green" },
      { min: 1040, max: Infinity, label: "Very High", color: "blue" }
    ],
    thresholdLines: [
      { value: 1013.25, label: "Sea level standard", color: "#6b7280", lineStyle: "dashed" }
    ]
  },
  dps_temp_c: {
    displayName: "Temperature (DPS310)",
    unit: "\xB0C",
    decimalPlaces: 1,
    yAxis: { min: 15, max: 35 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "Temperature from DPS310 barometric sensor",
    zones: [
      { min: 0, max: 18, label: "Cold", color: "blue" },
      { min: 18, max: 26, label: "Normal", color: "green" },
      { min: 26, max: Infinity, label: "Warm", color: "yellow" }
    ]
  },
  pm2_5: {
    displayName: "PM2.5",
    defaultVisible: true,
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 50, suggestedMax: 25 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "primary",
    description: "Particulate matter 2.5 micrometers - respiratory health indicator",
    zones: [
      { min: 0, max: 5, label: "Excellent", color: "green", description: "WHO annual guideline" },
      { min: 5, max: 12, label: "Good", color: "green", description: "EPA Good" },
      { min: 12, max: 35, label: "Moderate", color: "yellow", description: "EPA acceptable" },
      { min: 35, max: 55, label: "Unhealthy (Sensitive)", color: "orange" },
      { min: 55, max: 150, label: "Unhealthy", color: "red" },
      { min: 150, max: Infinity, label: "Very Unhealthy", color: "purple" }
    ],
    thresholdLines: [
      { value: 5, label: "WHO guideline", color: "#10b981" },
      { value: 12, label: "EPA Good limit", color: "#fbbf24" },
      { value: 35, label: "EPA 24h standard", color: "#f97316" }
    ],
    standards: ["WHO", "EPA"]
  },
  pm1: {
    displayName: "PM1.0",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 25, suggestedMax: 15 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Particulate matter 1.0 micrometers",
    zones: [
      { min: 0, max: 5, label: "Excellent", color: "green" },
      { min: 5, max: 10, label: "Good", color: "green" },
      { min: 10, max: 20, label: "Moderate", color: "yellow" },
      { min: 20, max: Infinity, label: "Poor", color: "orange" }
    ],
    thresholdLines: [
      { value: 5, label: "Excellent limit", color: "#10b981" }
    ]
  },
  pm4: {
    displayName: "PM4.0",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Particulate matter 4.0 micrometers",
    zones: [
      { min: 0, max: 10, label: "Excellent", color: "green" },
      { min: 10, max: 25, label: "Good", color: "green" },
      { min: 25, max: 50, label: "Moderate", color: "yellow" },
      { min: 50, max: Infinity, label: "Poor", color: "orange" }
    ]
  },
  pm10: {
    displayName: "PM10",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "secondary",
    description: "Particulate matter 10 micrometers",
    zones: [
      { min: 0, max: 15, label: "Excellent", color: "green", description: "WHO annual guideline" },
      { min: 15, max: 45, label: "Good", color: "green", description: "WHO 24h guideline" },
      { min: 45, max: 154, label: "Moderate", color: "yellow", description: "EPA moderate" },
      { min: 154, max: Infinity, label: "Unhealthy", color: "orange" }
    ],
    thresholdLines: [
      { value: 15, label: "WHO annual", color: "#10b981" },
      { value: 45, label: "WHO 24h", color: "#fbbf24" }
    ],
    standards: ["WHO", "EPA"]
  },
  pm0_3_to_1: {
    displayName: "PM 0.3-1.0\u03BCm",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 25 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "Ultra-fine particles 0.3-1.0 micrometers",
    zones: [
      { min: 0, max: 5, label: "Excellent", color: "green" },
      { min: 5, max: 10, label: "Good", color: "green" },
      { min: 10, max: 20, label: "Moderate", color: "yellow" },
      { min: 20, max: Infinity, label: "Poor", color: "orange" }
    ]
  },
  pm1_to_2_5: {
    displayName: "PM 1.0-2.5\u03BCm",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 25 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "Fine particles 1.0-2.5 micrometers",
    zones: [
      { min: 0, max: 3, label: "Excellent", color: "green" },
      { min: 3, max: 7, label: "Good", color: "green" },
      { min: 7, max: 15, label: "Moderate", color: "yellow" },
      { min: 15, max: Infinity, label: "Poor", color: "orange" }
    ]
  },
  pm2_5_to_4: {
    displayName: "PM 2.5-4.0\u03BCm",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 25 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "Coarse particles 2.5-4.0 micrometers",
    zones: [
      { min: 0, max: 5, label: "Excellent", color: "green" },
      { min: 5, max: 10, label: "Good", color: "green" },
      { min: 10, max: 20, label: "Moderate", color: "yellow" },
      { min: 20, max: Infinity, label: "Poor", color: "orange" }
    ]
  },
  pm4_to_10: {
    displayName: "PM 4.0-10\u03BCm",
    unit: "\xB5g/m\xB3",
    decimalPlaces: 1,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "Large particles 4.0-10 micrometers",
    zones: [
      { min: 0, max: 10, label: "Excellent", color: "green" },
      { min: 10, max: 25, label: "Good", color: "green" },
      { min: 25, max: 50, label: "Moderate", color: "yellow" },
      { min: 50, max: Infinity, label: "Poor", color: "orange" }
    ]
  },
  co: {
    displayName: "CO",
    unit: "ppm",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "primary",
    description: "Carbon monoxide - acute toxicity indicator",
    zones: [
      { min: 0, max: 1, label: "Excellent", color: "green", description: "Outdoor/ideal" },
      { min: 1, max: 5, label: "Good", color: "green", description: "Typical indoor" },
      { min: 5, max: 9, label: "Moderate", color: "yellow", description: "EPA 8h max" },
      { min: 9, max: 35, label: "Elevated", color: "orange", description: "EPA 1h max" },
      { min: 35, max: 50, label: "Unhealthy", color: "red", description: "OSHA TWA" },
      { min: 50, max: Infinity, label: "Dangerous", color: "purple" }
    ],
    thresholdLines: [
      { value: 9, label: "EPA 8h limit", color: "#f97316" },
      { value: 35, label: "EPA 1h limit", color: "#dc2626" }
    ],
    standards: ["EPA", "WHO", "OSHA"]
  },
  no2: {
    displayName: "NO\u2082",
    unit: "ppm",
    decimalPlaces: 3,
    yAxis: { min: 0, max: 1 },
    defaultTimeWindow: 6,
    category: "fast",
    healthPriority: "secondary",
    description: "Nitrogen dioxide - respiratory irritant from combustion",
    zones: [
      { min: 0, max: 0.053, label: "Excellent", color: "green", description: "EPA annual std" },
      { min: 0.053, max: 0.1, label: "Good", color: "yellow" },
      { min: 0.1, max: 0.2, label: "Moderate", color: "orange", description: "EPA 1h std" },
      { min: 0.2, max: 0.5, label: "Elevated", color: "orange", description: "Kitchen peaks" },
      { min: 0.5, max: Infinity, label: "Unhealthy", color: "red" }
    ],
    thresholdLines: [
      { value: 0.053, label: "EPA annual", color: "#10b981" },
      { value: 0.1, label: "EPA 1h", color: "#f97316" }
    ],
    standards: ["EPA"]
  },
  h2: {
    displayName: "Hydrogen",
    unit: "ppm",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 1,
    category: "leak-detection",
    healthPriority: "safety",
    description: "Hydrogen - leak and explosion hazard detection",
    zones: [
      { min: 0, max: 10, label: "Normal", color: "green" },
      { min: 10, max: 100, label: "Elevated", color: "yellow" },
      { min: 100, max: 1000, label: "High", color: "orange" },
      { min: 1000, max: Infinity, label: "Dangerous", color: "red", description: "Leak suspected" }
    ]
  },
  ethanol: {
    displayName: "Ethanol",
    unit: "ppm",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 20 },
    defaultTimeWindow: 6,
    category: "fast",
    healthPriority: "support",
    description: "Ethanol vapor - occupancy and cleaning indicator",
    zones: [
      { min: 0, max: 1, label: "Low", color: "green" },
      { min: 1, max: 5, label: "Normal", color: "green", description: "Typical occupancy" },
      { min: 5, max: 100, label: "Elevated", color: "yellow" },
      { min: 100, max: Infinity, label: "High", color: "orange" }
    ],
    thresholdLines: [
      { value: 5, label: "Normal upper limit", color: "#fbbf24" }
    ]
  },
  ch4: {
    displayName: "Methane",
    unit: "ppm",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 1,
    category: "leak-detection",
    healthPriority: "safety",
    description: "Methane - leak and explosion hazard detection",
    zones: [
      { min: 0, max: 5, label: "Normal", color: "green" },
      { min: 5, max: 1000, label: "Elevated", color: "yellow", description: "Investigate source" },
      { min: 1000, max: 5000, label: "High", color: "orange", description: "NIOSH limit" },
      { min: 5000, max: Infinity, label: "Dangerous", color: "red", description: "Asphyxiation risk" }
    ],
    thresholdLines: [
      { value: 1000, label: "NIOSH 8h limit", color: "#f97316" }
    ],
    standards: ["NIOSH"]
  },
  nh3: {
    displayName: "Ammonia",
    unit: "ppm",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 10 },
    defaultTimeWindow: 6,
    category: "fast",
    healthPriority: "secondary",
    description: "Ammonia - odor and irritation indicator",
    zones: [
      { min: 0, max: 0.05, label: "Excellent", color: "green" },
      { min: 0.05, max: 1, label: "Good", color: "green" },
      { min: 1, max: 1.5, label: "Odor Threshold", color: "yellow" },
      { min: 1.5, max: 20, label: "Moderate", color: "orange" },
      { min: 20, max: 25, label: "Unhealthy", color: "red", description: "OSHA 8h TWA" },
      { min: 25, max: Infinity, label: "Very Unhealthy", color: "purple" }
    ],
    thresholdLines: [
      { value: 1.5, label: "Odor threshold", color: "#fbbf24" },
      { value: 20, label: "Irritation begins", color: "#f97316" },
      { value: 25, label: "OSHA TWA", color: "#dc2626" }
    ],
    standards: ["OSHA"]
  },
  esp_temp_c: {
    displayName: "ESP Temperature",
    unit: "\xB0C",
    decimalPlaces: 1,
    yAxis: { min: 20, max: 60 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "ESP32 internal temperature - device health indicator",
    zones: [
      { min: 0, max: 45, label: "Normal", color: "green" },
      { min: 45, max: 60, label: "Warm", color: "yellow" },
      { min: 60, max: 75, label: "Hot", color: "orange" },
      { min: 75, max: Infinity, label: "Critical", color: "red" }
    ],
    thresholdLines: [
      { value: 60, label: "Check ventilation", color: "#f97316" }
    ]
  },
  wifi_rssi_dbm: {
    displayName: "WiFi Signal",
    unit: "dBm",
    decimalPlaces: 0,
    yAxis: { min: -90, max: -30 },
    defaultTimeWindow: 24,
    category: "moderate",
    healthPriority: "support",
    description: "WiFi signal strength - connectivity indicator",
    zones: [
      { min: -50, max: Infinity, label: "Excellent", color: "green" },
      { min: -60, max: -50, label: "Good", color: "green" },
      { min: -70, max: -60, label: "Fair", color: "yellow" },
      { min: -80, max: -70, label: "Weak", color: "orange" },
      { min: -Infinity, max: -80, label: "Poor", color: "red" }
    ],
    thresholdLines: [
      { value: -70, label: "Minimum reliable", color: "#fbbf24" }
    ]
  },
  uptime_s: {
    displayName: "Uptime",
    unit: "s",
    decimalPlaces: 0,
    yAxis: { min: 0, max: 86400 },
    defaultTimeWindow: 24,
    category: "slow",
    healthPriority: "support",
    description: "Device uptime - stability indicator",
    zones: [
      { min: 0, max: Infinity, label: "Running", color: "green" }
    ]
  }
};

// src/sensor-utils.ts
function getSensorMetadata(sensorId) {
  return SENSOR_REGISTRY[sensorId] || createFallbackMetadata(sensorId);
}
function createFallbackMetadata(sensorId) {
  return {
    displayName: prettyId(sensorId),
    unit: "",
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 6,
    category: "moderate",
    healthPriority: "support",
    zones: []
  };
}
function getCurrentZone(value, metadata) {
  for (const zone of metadata.zones) {
    if (value >= zone.min && value < zone.max) {
      return zone;
    }
  }
  return null;
}
function prettyId(id) {
  return id.replace(/^sensor-/, "").replace(/_weight_concentration$/, "").replace(/__/g, " ").replace(/_/g, " ").replace(/\bco2\b/i, "CO\u2082").replace(/\bpm\b/i, "PM").replace(/\bvoc\b/i, "VOC").replace(/\bnox\b/i, "NOx").replace(/\bno2\b/i, "NO\u2082").trim();
}

// src/index.ts
var PORT = parseInt(process.env.PORT || "443", 10);
var DEFAULT_AIR_SENSOR_URL = process.env.AIR_SENSOR_URL || "http://10.0.0.37/";
var DEDUPE_WINDOW_MS = 1e4;
var SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
var db = new Database("db.sqlite");
db.run(`
  CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    unit TEXT
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    value REAL,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS readings_aggregated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    avg_value REAL NOT NULL,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    UNIQUE(minute_ts, sensor_id),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_sensor_id ON readings(sensor_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON readings(sensor_id, ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_minute_ts ON readings_aggregated(minute_ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_sensor_id ON readings_aggregated(sensor_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_lookup ON readings_aggregated(sensor_id, minute_ts)`);
var sensorCache = new Map;
function initializeSensors() {
  const insertSensor = db.prepare(`
    INSERT OR IGNORE INTO sensors (id, name, display_name, unit)
    VALUES (?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    for (const sensor of SENSOR_SEED_DATA) {
      insertSensor.run(sensor.id, sensor.name, sensor.display_name, sensor.unit);
    }
  });
  transaction();
}
function loadSensors() {
  const sensors = db.prepare(`SELECT id, name, unit, display_name FROM sensors`).all();
  for (const sensor of sensors) {
    sensorCache.set(sensor.name, {
      sensor_id: sensor.id,
      unit: sensor.unit,
      display_name: sensor.display_name
    });
  }
  console.log(`\uD83D\uDCCB Loaded ${sensorCache.size} sensor mappings`);
}
initializeSensors();
loadSensors();
function getSensor(sensorName) {
  const info = sensorCache.get(sensorName);
  if (!info) {
    console.warn(`\u26A0\uFE0F  Unknown sensor: ${sensorName} - skipping reading`);
    return null;
  }
  return info;
}
var dedupeCache = new Map;
function isDuplicate(sensor_id, value, ts) {
  const key = `${sensor_id}|${value}`;
  const lastSeen = dedupeCache.get(key);
  if (lastSeen && Math.abs(ts - lastSeen) < DEDUPE_WINDOW_MS) {
    return true;
  }
  dedupeCache.set(key, ts);
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [key, ts] of dedupeCache.entries()) {
    if (ts < cutoff) {
      dedupeCache.delete(key);
    }
  }
}, 30000);
var aggregationBuffer = new Map;
var upsertAggregation = db.prepare(`
  INSERT INTO readings_aggregated (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(minute_ts, sensor_id) DO UPDATE SET
    avg_value = ((avg_value * sample_count) + (excluded.avg_value * excluded.sample_count)) /
                (sample_count + excluded.sample_count),
    min_value = MIN(min_value, excluded.min_value),
    max_value = MAX(max_value, excluded.max_value),
    sample_count = sample_count + excluded.sample_count
`);
function addToAggregation(ts, sensor_id, value) {
  const minute_ts = Math.floor(ts / 60000) * 60000;
  const key = `${sensor_id}:${minute_ts}`;
  let agg = aggregationBuffer.get(key);
  if (!agg) {
    agg = { minute_ts, sensor_id, values: [] };
    aggregationBuffer.set(key, agg);
  }
  agg.values.push(value);
}
setInterval(() => {
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000) * 60000;
  const toFlush = [];
  for (const [key, agg] of aggregationBuffer.entries()) {
    if (agg.minute_ts < currentMinute) {
      toFlush.push([key, agg]);
    }
  }
  if (toFlush.length === 0)
    return;
  const transaction = db.transaction(() => {
    for (const [key, agg] of toFlush) {
      if (agg.values.length === 0)
        continue;
      const avg = agg.values.reduce((a, b) => a + b, 0) / agg.values.length;
      const min = Math.min(...agg.values);
      const max = Math.max(...agg.values);
      upsertAggregation.run(agg.minute_ts, agg.sensor_id, avg, min, max, agg.values.length);
      aggregationBuffer.delete(key);
    }
  });
  transaction();
  console.log(`\uD83D\uDCCA Flushed ${toFlush.length} minute aggregations`);
}, 60000);
var deleteOldRawReadings = db.prepare(`DELETE FROM readings WHERE ts < ?`);
function cleanupOldData() {
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
  const result = deleteOldRawReadings.run(sevenDaysAgo);
  console.log(`\uD83E\uDDF9 Deleted ${result.changes} raw readings older than 7 days`);
  if (result.changes > 0) {
    db.run("VACUUM");
    console.log(`\uD83D\uDCBE Database vacuumed to reclaim space`);
  }
}
function scheduleCleanup() {
  const now = new Date;
  const next2AM = new Date(now);
  next2AM.setHours(2, 0, 0, 0);
  if (next2AM.getTime() <= now.getTime()) {
    next2AM.setDate(next2AM.getDate() + 1);
  }
  const msUntil2AM = next2AM.getTime() - now.getTime();
  const hoursUntil = (msUntil2AM / (1000 * 60 * 60)).toFixed(1);
  console.log(`\uD83D\uDD50 Next cleanup scheduled in ${hoursUntil} hours (at ${next2AM.toLocaleString()})`);
  setTimeout(() => {
    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  }, msUntil2AM);
}
scheduleCleanup();
var insertReading = db.prepare(`
  INSERT INTO readings (ts, sensor_id, value)
  VALUES (?, ?, ?)
`);
function getReadings(since, until) {
  const now = Date.now();
  const sevenDaysAgo = now - SEVEN_DAYS_MS;
  const untilTs = until || now;
  const results = [];
  if (since >= sevenDaysAgo && untilTs >= sevenDaysAgo) {
    const rawQuery = db.prepare(`
      SELECT
        r.ts, s.name as sensorId, s.display_name as sensorName,
        r.value, s.unit
      FROM readings r
      JOIN sensors s ON r.sensor_id = s.id
      WHERE r.ts >= ? AND r.ts <= ?
      ORDER BY r.ts ASC
    `);
    results.push(...rawQuery.all(Math.max(since, sevenDaysAgo), untilTs));
  }
  if (since < sevenDaysAgo) {
    const aggQuery = db.prepare(`
      SELECT
        a.minute_ts as ts, s.name as sensorId, s.display_name as sensorName,
        a.avg_value as value, a.min_value, a.max_value, a.sample_count,
        s.unit, 'aggregated' as data_type
      FROM readings_aggregated a
      JOIN sensors s ON a.sensor_id = s.id
      WHERE a.minute_ts >= ? AND a.minute_ts < ?
      ORDER BY a.minute_ts ASC
    `);
    results.push(...aggQuery.all(since, Math.min(untilTs, sevenDaysAgo)));
  }
  return results.sort((a, b) => a.ts - b.ts);
}
var sseClients = new Map;
function broadcastToClients(readings) {
  if (sseClients.size === 0)
    return;
  const timestamp = Date.now();
  let disconnected = [];
  for (const [clientId, client] of sseClients.entries()) {
    try {
      for (const reading of readings) {
        let state = reading.state || "";
        if (reading.value !== null && reading.value !== undefined && reading.sensorId) {
          const metadata = getSensorMetadata(reading.sensorId);
          const zone = getCurrentZone(reading.value, metadata);
          if (zone) {
            state = zone.label;
          }
        }
        const eventData = {
          id: reading.sensorId,
          value: reading.value,
          state,
          ts: reading.ts ?? Date.now()
        };
        const message = `event: state
data: ${JSON.stringify(eventData)}
id: ${reading.eventId || `${timestamp}:${reading.sensorId}`}

`;
        client.controller.enqueue(new TextEncoder().encode(message));
      }
    } catch (error) {
      console.warn(`Failed to send to client ${clientId}, marking for removal`);
      disconnected.push(clientId);
    }
  }
  for (const clientId of disconnected) {
    sseClients.delete(clientId);
    console.log(`\uD83D\uDD0C Client ${clientId} disconnected (total: ${sseClients.size})`);
  }
}
setInterval(() => {
  if (sseClients.size === 0)
    return;
  const ping = `event: ping
data: ${Date.now()}

`;
  const encoded = new TextEncoder().encode(ping);
  let disconnected = [];
  for (const [clientId, client] of sseClients.entries()) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      disconnected.push(clientId);
    }
  }
  for (const clientId of disconnected) {
    sseClients.delete(clientId);
  }
}, 30000);
var server = serve({
  idleTimeout: 255,
  port: PORT,
  routes: {
    "/": src_default,
    "/upload": upload_default,
    "/ask": ask_default,
    "/ask.html": ask_default,
    "/upload.html": upload_default,
    "/test-stream.html": test_stream_default,
    "/api/stream": async (req) => {
      const clientId = crypto.randomUUID();
      let heartbeat = null;
      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        sseClients.delete(clientId);
      };
      const stream = new ReadableStream({
        start(controller) {
          sseClients.set(clientId, {
            id: clientId,
            controller,
            connectedAt: Date.now()
          });
          console.log(`\uD83D\uDD0C Client ${clientId} connected to SSE stream (total: ${sseClients.size})`);
          const welcome = `event: connected
data: ${JSON.stringify({ clientId, timestamp: Date.now() })}

`;
          controller.enqueue(new TextEncoder().encode(welcome));
          heartbeat = setInterval(() => {
            try {
              const ping = `event: ping
data: ${Date.now()}

`;
              controller.enqueue(new TextEncoder().encode(ping));
            } catch {
              cleanup();
            }
          }, 30000);
          req.signal.addEventListener("abort", () => {
            cleanup();
            console.log(`\uD83D\uDD0C Client ${clientId} disconnected (total: ${sseClients.size})`);
          });
        },
        cancel() {
          cleanup();
          console.log(`\uD83D\uDD0C Client ${clientId} cancelled stream (total: ${sseClients.size})`);
        }
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*"
        }
      });
    },
    "/api/readings": {
      async POST(req) {
        try {
          const readings = await req.json();
          if (!Array.isArray(readings)) {
            return Response.json({ error: "Expected array of readings" }, { status: 400 });
          }
          let inserted = 0;
          let duplicates = 0;
          const broadcastReadings = [];
          const transaction = db.transaction((rows) => {
            for (const r of rows) {
              const sensorInfo = getSensor(r.sensorId);
              if (!sensorInfo)
                continue;
              if (isDuplicate(sensorInfo.sensor_id, r.value ?? null, r.ts)) {
                duplicates++;
                continue;
              }
              insertReading.run(r.ts, sensorInfo.sensor_id, r.value ?? null);
              inserted++;
              if (r.value !== null && r.value !== undefined) {
                addToAggregation(r.ts, sensorInfo.sensor_id, r.value);
              }
              broadcastReadings.push(r);
            }
          });
          transaction(readings);
          if (broadcastReadings.length > 0) {
            broadcastToClients(broadcastReadings);
          }
          return Response.json({
            success: true,
            count: readings.length,
            inserted,
            duplicates
          });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
      async GET(req) {
        const url = new URL(req.url);
        const since = parseInt(url.searchParams.get("since") || "0");
        const until = url.searchParams.get("until") ? parseInt(url.searchParams.get("until")) : undefined;
        const readings = getReadings(since, until);
        return Response.json(readings);
      }
    },
    "/api/submit": {
      async POST(req) {
        try {
          const data = await req.json();
          if (!data.measurements) {
            return Response.json({
              error: "Missing required field: measurements"
            }, { status: 400 });
          }
          const timestamp = Date.now();
          const deviceTimestamp = data.timestamp;
          const sensorMappings = {
            co2_ppm: data.measurements.co2_ppm,
            sen55_temp_c: data.measurements.sen55_temp_c,
            sen55_humidity_pct: data.measurements.sen55_humidity_pct,
            voc_index: data.measurements.voc_index,
            nox_index: data.measurements.nox_index,
            pressure_hpa: data.measurements.pressure_hpa,
            dps_temp_c: data.measurements.dps_temp_c,
            pm1: data.measurements.pm_ug_m3?.pm1,
            pm2_5: data.measurements.pm_ug_m3?.pm2_5,
            pm4: data.measurements.pm_ug_m3?.pm4,
            pm10: data.measurements.pm_ug_m3?.pm10,
            pm0_3_to_1: data.measurements.pm_ug_m3?.pm0_3_to_1,
            pm1_to_2_5: data.measurements.pm_ug_m3?.pm1_to_2_5,
            pm2_5_to_4: data.measurements.pm_ug_m3?.pm2_5_to_4,
            pm4_to_10: data.measurements.pm_ug_m3?.pm4_to_10,
            no2: data.measurements.gases_ppm?.no2,
            co: data.measurements.gases_ppm?.co,
            h2: data.measurements.gases_ppm?.h2,
            ethanol: data.measurements.gases_ppm?.ethanol,
            ch4: data.measurements.gases_ppm?.ch4,
            nh3: data.measurements.gases_ppm?.nh3,
            esp_temp_c: data.diagnostics?.esp_temp_c,
            wifi_rssi_dbm: data.diagnostics?.wifi_rssi_dbm,
            uptime_s: data.diagnostics?.uptime_s
          };
          let inserted = 0;
          let duplicates = 0;
          let errors = 0;
          const broadcastReadings = [];
          const transaction = db.transaction(() => {
            for (const [sensorName, value] of Object.entries(sensorMappings)) {
              if (value == null || typeof value === "number" && isNaN(value)) {
                continue;
              }
              const sensorInfo = getSensor(sensorName);
              if (!sensorInfo) {
                console.warn(`Unknown sensor: ${sensorName}`);
                errors++;
                continue;
              }
              if (isDuplicate(sensorInfo.sensor_id, value, timestamp)) {
                duplicates++;
                continue;
              }
              insertReading.run(timestamp, sensorInfo.sensor_id, value);
              inserted++;
              if (value !== null && value !== undefined) {
                addToAggregation(timestamp, sensorInfo.sensor_id, value);
              }
              broadcastReadings.push({
                sensorId: sensorName,
                value,
                ts: timestamp
              });
            }
          });
          transaction();
          if (broadcastReadings.length > 0) {
            broadcastToClients(broadcastReadings);
          }
          const logEntry = {
            timestamp: new Date().toISOString(),
            device: data.device || "unknown",
            fw_version: data.fw_version,
            device_timestamp_claimed: deviceTimestamp,
            server_timestamp_used: timestamp,
            inserted,
            duplicates,
            errors,
            measurements: data.measurements,
            diagnostics: data.diagnostics
          };
          console.log(`\uD83D\uDCE5 Device submission: ${data.device || "unknown"} - ${inserted} inserted, ${duplicates} duplicates, ${errors} errors`);
          console.log(`\uD83D\uDCCB Submission details: ${JSON.stringify(logEntry)}`);
          return Response.json({
            success: true,
            device: data.device,
            timestamp: data.timestamp,
            inserted,
            duplicates,
            errors,
            message: `Processed ${inserted + duplicates + errors} sensor readings`
          });
          return Response.json({
            success: true,
            device: data.device,
            timestamp: data.timestamp,
            inserted,
            duplicates,
            errors,
            message: `Processed ${inserted + duplicates + errors} sensor readings`
          });
        } catch (error) {
          console.error("Error processing device submission:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      }
    },
    "/api/ask/stream": {
      async GET(req) {
        try {
          const { handleAskStreamSandboxed: handleAskStreamSandboxed2 } = await init_ask_stream_route_sandbox().then(() => exports_ask_stream_route_sandbox);
          return await handleAskStreamSandboxed2(req);
        } catch (error) {
          console.error("Error in /api/ask/stream:", error);
          return Response.json({
            error: "Internal server error",
            message: error.message
          }, { status: 500 });
        }
      }
    },
    "/api/ask": {
      async GET(req) {
        const url = new URL(req.url);
        const query = url.searchParams.get("q") || url.searchParams.get("query");
        if (!query) {
          return Response.json({
            error: "Missing query parameter. Use ?q=your_question"
          }, { status: 400 });
        }
        try {
          const { answer, conversationId, usedCachedScript, previousId } = await askShelley(query);
          const isDashboard = typeof answer === "object" && answer !== null && "blocks" in answer;
          return Response.json({
            question: query,
            answer,
            isDashboard,
            conversationId,
            usedCachedScript,
            previousId,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error("Error in /api/ask:", error);
          return Response.json({
            error: "Internal server error",
            message: error.message
          }, { status: 500 });
        }
      }
    },
    "/api/config": async () => {
      return Response.json({
        defaultSensorUrl: DEFAULT_AIR_SENSOR_URL,
        serverTime: Date.now()
      });
    }
  },
  async fetch(req) {
    const { handleAskApiRoute: handleAskApiRoute2 } = await init_ask_api_routes().then(() => exports_ask_api_routes);
    const askApiResponse = await handleAskApiRoute2(req);
    if (askApiResponse)
      return askApiResponse;
    return new Response("Not Found", { status: 404 });
  },
  development: true
});
console.log(`\uD83D\uDE80 Server running at http://localhost:${PORT}/`);
console.log(`\uD83D\uDC40 Viewer available at http://localhost:${PORT}/`);
console.log(`\uD83D\uDCE4 Uploader available at http://localhost:${PORT}/upload.html`);
console.log(`\uD83D\uDCCA API base at http://localhost:${PORT}/api`);
console.log(`\uD83D\uDCBE Database: db.sqlite`);
console.log(`\uD83D\uDD04 Deduplication: 10s window`);
console.log(`\uD83D\uDCE6 Aggregation: Real-time minutely summaries`);
console.log(`\uD83D\uDDC4\uFE0F  Retention: 7 days raw + permanent aggregates`);
