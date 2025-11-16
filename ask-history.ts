import { readdir, readFile, writeFile, mkdir, rename, unlink, symlink } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import type { DashboardResponse } from "./dashboard-types";

export const ASKED_DIR = join(import.meta.dir, "asked");
const STARRED_DIR = join(ASKED_DIR, "starred");
const TRASHED_DIR = join(ASKED_DIR, "trashed");

// Ensure directories exist
await mkdir(ASKED_DIR, { recursive: true });
await mkdir(STARRED_DIR, { recursive: true });
await mkdir(TRASHED_DIR, { recursive: true });

export interface AskHistoryItem {
  id: string;
  timestamp: string;
  question: string;
  starred: boolean;
  trashed: boolean;
  scriptPath: string;
  metadataPath: string;
  runCount: number;
  lastRun: string;
}

interface AskMetadata {
  id: string;
  question: string;
  firstAsked: string;
  lastRun: string;
  runCount: number;
  runs: Array<{
    timestamp: string;
    conversationId: string;
    usedCachedScript?: boolean;
  }>;
}

/**
 * Generate a stable ID for a question (based on slugified question only)
 */
function generateQuestionId(question: string): string {
  return slugify(question);
}

/**
 * Save or update a query and its results to the history
 */
export async function saveToHistory(
  question: string,
  answer: DashboardResponse | string,
  conversationId: string,
  scriptContent: string,
  usedCachedScript?: boolean
): Promise<string> {
  const id = generateQuestionId(question);
  const timestamp = new Date().toISOString();
  
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  const answerPath = join(ASKED_DIR, `${id}-latest.json`);
  
  let metadata: AskMetadata;
  
  // Check if this question already exists
  if (existsSync(metadataPath)) {
    // Update existing
    const existing = JSON.parse(await readFile(metadataPath, 'utf-8')) as AskMetadata;
    metadata = {
      ...existing,
      lastRun: timestamp,
      runCount: existing.runCount + 1,
      runs: [
        ...existing.runs,
        { timestamp, conversationId, usedCachedScript }
      ]
    };
    console.log(`📝 Updated existing question (run #${metadata.runCount})`);
  } else {
    // Create new
    metadata = {
      id,
      question,
      firstAsked: timestamp,
      lastRun: timestamp,
      runCount: 1,
      runs: [{ timestamp, conversationId, usedCachedScript }]
    };
    console.log(`📝 Created new question entry`);
  }
  
  // Save metadata
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  // Save/update script
  await writeFile(scriptPath, scriptContent);
  
  // Save latest answer
  await writeFile(answerPath, JSON.stringify({
    timestamp,
    question,
    answer,
    conversationId
  }, null, 2));
  
  return id;
}

/**
 * Get history items, optionally filtered
 */
export async function getHistory(options: {
  limit?: number;
  starred?: boolean;
  trashed?: boolean;
} = {}): Promise<AskHistoryItem[]> {
  const files = await readdir(ASKED_DIR);
  const metadataFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('-latest.json'));
  
  const items: AskHistoryItem[] = [];
  
  for (const file of metadataFiles) {
    const metadataPath = join(ASKED_DIR, file);
    const content = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as AskMetadata;
    
    const id = metadata.id;
    const starredPath = join(STARRED_DIR, basename(metadataPath));
    const trashedPath = join(TRASHED_DIR, basename(metadataPath));
    
    const starred = existsSync(starredPath);
    const trashed = existsSync(trashedPath);
    
    // Apply filters
    if (options.starred !== undefined && starred !== options.starred) continue;
    if (options.trashed !== undefined && trashed !== options.trashed) continue;
    
    // Handle both old format (timestamp) and new format (lastRun)
    const effectiveTimestamp = metadata.lastRun || (metadata as any).timestamp || new Date().toISOString();
    
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
  
  // Sort by last run descending (most recent first)
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  // Apply limit
  if (options.limit) {
    return items.slice(0, options.limit);
  }
  
  return items;
}

/**
 * Get a single history item by ID
 */
export async function getHistoryItem(id: string): Promise<AskHistoryItem | null> {
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  
  if (!existsSync(metadataPath)) {
    return null;
  }
  
  const content = await readFile(metadataPath, 'utf-8');
  const metadata = JSON.parse(content) as AskMetadata;
  
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

/**
 * Get full metadata including answer and runs
 */
export async function getHistoryMetadata(id: string): Promise<any | null> {
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  const answerPath = join(ASKED_DIR, `${id}-latest.json`);
  
  if (!existsSync(metadataPath)) {
    return null;
  }
  
  const metadata = JSON.parse(await readFile(metadataPath, 'utf-8')) as AskMetadata;
  
  // Include latest answer if available
  let latestAnswer = null;
  if (existsSync(answerPath)) {
    latestAnswer = JSON.parse(await readFile(answerPath, 'utf-8'));
  }
  
  return {
    ...metadata,
    latestAnswer
  };
}

/**
 * Star a history item
 */
export async function starItem(id: string): Promise<boolean> {
  const item = await getHistoryItem(id);
  if (!item) return false;
  
  const starredPath = join(STARRED_DIR, basename(item.metadataPath));
  
  // Create symlink if it doesn't exist
  if (!existsSync(starredPath)) {
    await symlink(item.metadataPath, starredPath);
  }
  
  return true;
}

/**
 * Unstar a history item
 */
export async function unstarItem(id: string): Promise<boolean> {
  const item = await getHistoryItem(id);
  if (!item) return false;
  
  const starredPath = join(STARRED_DIR, basename(item.metadataPath));
  
  if (existsSync(starredPath)) {
    await unlink(starredPath);
  }
  
  return true;
}

/**
 * Trash a history item (move to trashed folder)
 */
export async function trashItem(id: string): Promise<boolean> {
  const item = await getHistoryItem(id);
  if (!item) return false;
  
  const metadataBasename = basename(item.metadataPath);
  const scriptBasename = basename(item.scriptPath);
  const answerBasename = `${id}-latest.json`;
  
  const trashedMetadataPath = join(TRASHED_DIR, metadataBasename);
  const trashedScriptPath = join(TRASHED_DIR, scriptBasename);
  const trashedAnswerPath = join(TRASHED_DIR, answerBasename);
  
  const answerPath = join(ASKED_DIR, answerBasename);
  
  // Move files to trashed
  await rename(item.metadataPath, trashedMetadataPath);
  await rename(item.scriptPath, trashedScriptPath);
  if (existsSync(answerPath)) {
    await rename(answerPath, trashedAnswerPath);
  }
  
  // Remove from starred if it was starred
  const starredPath = join(STARRED_DIR, metadataBasename);
  if (existsSync(starredPath)) {
    await unlink(starredPath);
  }
  
  return true;
}

/**
 * Untrash a history item (move back from trashed folder)
 */
export async function untrashItem(id: string): Promise<boolean> {
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

/**
 * Get starred items (top pills)
 */
export async function getStarredItems(limit: number = 5): Promise<AskHistoryItem[]> {
  return getHistory({ starred: true, trashed: false, limit });
}

/**
 * Helper to create URL-safe slugs
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 80); // Longer since no timestamp prefix
}
