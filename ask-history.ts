import { readdir, readFile, writeFile, mkdir, rename, unlink, symlink } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import type { DashboardResponse } from "./dashboard-types";

const ASKED_DIR = join(import.meta.dir, "asked");
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
}

interface AskMetadata {
  id: string;
  timestamp: string;
  question: string;
  answer: DashboardResponse | string;
  conversationId: string;
}

/**
 * Save a query and its results to the history
 */
export async function saveToHistory(
  question: string,
  answer: DashboardResponse | string,
  conversationId: string,
  scriptContent: string
): Promise<string> {
  const timestamp = new Date().toISOString();
  const id = `${timestamp.replace(/:/g, '-').replace(/\./g, '-')}_${slugify(question)}`;
  
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  
  const metadata: AskMetadata = {
    id,
    timestamp,
    question,
    answer,
    conversationId
  };
  
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  await writeFile(scriptPath, scriptContent);
  
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
  const metadataFiles = files.filter(f => f.endsWith('.json'));
  
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
    
    items.push({
      id,
      timestamp: metadata.timestamp,
      question: metadata.question,
      starred,
      trashed,
      scriptPath: join(ASKED_DIR, `${id}.ts`),
      metadataPath
    });
  }
  
  // Sort by timestamp descending (newest first)
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
    timestamp: metadata.timestamp,
    question: metadata.question,
    starred: existsSync(starredPath),
    trashed: existsSync(trashedPath),
    scriptPath: join(ASKED_DIR, `${id}.ts`),
    metadataPath
  };
}

/**
 * Get full metadata including answer
 */
export async function getHistoryMetadata(id: string): Promise<AskMetadata | null> {
  const metadataPath = join(ASKED_DIR, `${id}.json`);
  
  if (!existsSync(metadataPath)) {
    return null;
  }
  
  const content = await readFile(metadataPath, 'utf-8');
  return JSON.parse(content) as AskMetadata;
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
  
  const trashedMetadataPath = join(TRASHED_DIR, metadataBasename);
  const trashedScriptPath = join(TRASHED_DIR, scriptBasename);
  
  // Move files to trashed
  await rename(item.metadataPath, trashedMetadataPath);
  await rename(item.scriptPath, trashedScriptPath);
  
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
  
  const trashedMetadataPath = join(TRASHED_DIR, metadataBasename);
  const trashedScriptPath = join(TRASHED_DIR, scriptBasename);
  
  if (!existsSync(trashedMetadataPath)) {
    return false;
  }
  
  const metadataPath = join(ASKED_DIR, metadataBasename);
  const scriptPath = join(ASKED_DIR, scriptBasename);
  
  await rename(trashedMetadataPath, metadataPath);
  await rename(trashedScriptPath, scriptPath);
  
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
    .substring(0, 50);
}
