// API route handlers for ask history management
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { ASKED_DIR } from "./ask-history";
import { getHistory, getStarredItems, getHistoryMetadata, starItem, unstarItem, trashItem, untrashItem } from "./ask-history";

export function handleAskApiRoute(req: Request): Response | null {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  
  try {
    // GET /api/ask/history
    if (path === "/api/ask/history" && method === "GET") {
      return handleGetHistory(url);
    }
    
    // GET /api/ask/starred
    if (path === "/api/ask/starred" && method === "GET") {
      return handleGetStarred();
    }
    
    // POST /api/ask/star/:id or DELETE /api/ask/star/:id
    if (path.startsWith("/api/ask/star/")) {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      if (method === "POST") {
        return handleStarItem(id);
      } else if (method === "DELETE") {
        return handleUnstarItem(id);
      }
    }
    
    // POST /api/ask/trash/:id or DELETE /api/ask/trash/:id
    if (path.startsWith("/api/ask/trash/")) {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      if (method === "POST") {
        return handleTrashItem(id);
      } else if (method === "DELETE") {
        return handleUntrashItem(id);
      }
    }
    
    // GET /api/ask/item/:id
    if (path.startsWith("/api/ask/item/")) {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      if (method === "GET") {
        return handleRerunItem(id);
      }
    }
    
    return null; // Not handled by this router
  } catch (error: any) {
    console.error("Error in ask API route:", error);
    return Response.json({ 
      error: "Internal server error",
      message: error.message 
    }, { status: 500 });
  }
}

async function handleGetHistory(url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") || "1000");
  const starred = url.searchParams.get("starred") === "true" ? true : undefined;
  const trashed = url.searchParams.get("trashed") === "true" ? true : undefined;
  
  const items = await getHistory({ limit, starred, trashed });
  return Response.json({ items });
}

async function handleGetStarred(): Promise<Response> {
  const items = await getStarredItems(5);
  return Response.json({ items });
}

async function handleStarItem(id: string): Promise<Response> {
  const success = await starItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

async function handleUnstarItem(id: string): Promise<Response> {
  const success = await unstarItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

async function handleTrashItem(id: string): Promise<Response> {
  const success = await trashItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

async function handleUntrashItem(id: string): Promise<Response> {
  const success = await untrashItem(id);
  if (!success) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

/**
 * Re-execute a script to get fresh data
 */
async function handleRerunItem(id: string): Promise<Response> {
  const metadata = await getHistoryMetadata(id);
  if (!metadata) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  // Read the script
  const scriptPath = join(ASKED_DIR, `${id}.ts`);
  if (!existsSync(scriptPath)) {
    return Response.json({ error: "Script not found" }, { status: 404 });
  }

  const scriptContent = await readFile(scriptPath, 'utf-8');
  
  // Execute the script to get fresh data (SANDBOXED)
  try {
    const { runInSandbox } = await import("./bubblewrap-sandbox-streaming");
    
    // The sandbox mounts ASKED_DIR as /work/, so we pass just the script path
    // which is already in ASKED_DIR
    const result = await runInSandbox({
      scriptPath: join(ASKED_DIR, `${id}.ts`),  // Full path on host
      dbPath: "/home/exedev/app/db.sqlite",
      workDir: ASKED_DIR,  // This gets mounted as /work/ inside sandbox
      timeoutMs: 30000,
      allowNetwork: false
    });

    if (result.exitCode !== 0) {
      console.error("Script execution failed:", result.stderr);
      return Response.json({ 
        error: "Script execution failed",
        details: result.stderr 
      }, { status: 500 });
    }

    // Parse the result
    const answer = JSON.parse(result.stdout.trim());
    
    return Response.json({
      ...metadata,
      latestAnswer: {
        timestamp: new Date().toISOString(),
        question: metadata.question,
        answer
      }
    });
  } catch (error: any) {
    console.error("Error re-executing script:", error);
    return Response.json({ 
      error: "Failed to execute script",
      message: error.message 
    }, { status: 500 });
  }
}
