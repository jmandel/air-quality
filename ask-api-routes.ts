// API route handlers for ask history management

import type { Server } from "bun";
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
        return handleGetItem(id);
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

async function handleGetItem(id: string): Promise<Response> {
  const metadata = await getHistoryMetadata(id);
  if (!metadata) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json(metadata);
}
