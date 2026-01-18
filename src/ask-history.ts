/**
 * Simple history system for Ask queries
 * 
 * Stores everything in a single JSON file + individual script files.
 * Scripts are keyed by question slug for easy caching/reuse.
 */

import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const ASKED_DIR = join(import.meta.dir, "../asked");
const HISTORY_FILE = join(ASKED_DIR, "history.json");

// Ensure directory exists
await mkdir(ASKED_DIR, { recursive: true });

export interface HistoryEntry {
  id: string;           // slug of the question
  question: string;     // original question text
  starred: boolean;     // user starred this
  createdAt: string;    // first asked
  lastRunAt: string;    // most recent run
  runCount: number;     // how many times run
}

interface HistoryData {
  entries: HistoryEntry[];
}

/**
 * Load history from disk
 */
async function loadHistory(): Promise<HistoryData> {
  if (!existsSync(HISTORY_FILE)) {
    return { entries: [] };
  }
  try {
    const content = await readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { entries: [] };
  }
}

/**
 * Save history to disk
 */
async function saveHistory(data: HistoryData): Promise<void> {
  await writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}

/**
 * Create a slug from a question
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .substring(0, 60);
}

/**
 * Save a query result to history
 */
export async function saveToHistory(
  question: string,
  result: any,
  _conversationId: string,
  scriptContent: string,
  _usedCache?: boolean
): Promise<string> {
  const id = slugify(question);
  const now = new Date().toISOString();
  
  const history = await loadHistory();
  
  // Find existing entry or create new one
  let entry = history.entries.find(e => e.id === id);
  
  if (entry) {
    entry.lastRunAt = now;
    entry.runCount++;
  } else {
    entry = {
      id,
      question,
      starred: false,
      createdAt: now,
      lastRunAt: now,
      runCount: 1
    };
    history.entries.unshift(entry); // Add to front
  }
  
  // Sort by lastRunAt descending
  history.entries.sort((a, b) => b.lastRunAt.localeCompare(a.lastRunAt));
  
  await saveHistory(history);
  
  // Save script file
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  await writeFile(scriptPath, scriptContent);
  
  // Save latest result
  const resultPath = join(ASKED_DIR, `${id}.result.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  
  return id;
}

/**
 * Get all history entries
 */
export async function getHistory(options: { limit?: number } = {}): Promise<HistoryEntry[]> {
  const history = await loadHistory();
  let entries = history.entries;
  
  if (options.limit) {
    entries = entries.slice(0, options.limit);
  }
  
  return entries;
}

/**
 * Get metadata for a specific entry
 */
export async function getHistoryMetadata(id: string): Promise<HistoryEntry | null> {
  const history = await loadHistory();
  return history.entries.find(e => e.id === id) || null;
}

/**
 * Star/unstar an entry
 */
export async function toggleStar(id: string): Promise<boolean> {
  const history = await loadHistory();
  const entry = history.entries.find(e => e.id === id);
  
  if (!entry) return false;
  
  entry.starred = !entry.starred;
  await saveHistory(history);
  
  return entry.starred;
}

/**
 * Delete an entry
 */
export async function deleteEntry(id: string): Promise<boolean> {
  const history = await loadHistory();
  const index = history.entries.findIndex(e => e.id === id);
  
  if (index === -1) return false;
  
  history.entries.splice(index, 1);
  await saveHistory(history);
  
  // Delete script and result files
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  const resultPath = join(ASKED_DIR, `${id}.result.json`);
  
  if (existsSync(scriptPath)) await unlink(scriptPath);
  if (existsSync(resultPath)) await unlink(resultPath);
  
  return true;
}

/**
 * Get script content for an entry
 */
export async function getScript(id: string): Promise<string | null> {
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  
  if (!existsSync(scriptPath)) return null;
  
  return readFile(scriptPath, "utf-8");
}

/**
 * Get cached result for an entry
 */
export async function getResult(id: string): Promise<any | null> {
  const resultPath = join(ASKED_DIR, `${id}.result.json`);
  
  if (!existsSync(resultPath)) return null;
  
  try {
    const content = await readFile(resultPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
