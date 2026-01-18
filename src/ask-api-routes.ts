/**
 * API route handlers for ask history management
 */
import { getHistory, toggleStar, deleteEntry, getScript, getResult } from "./ask-history";

export async function handleAskApiRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  
  try {
    // GET /api/ask/history
    if (path === "/api/ask/history" && method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const items = await getHistory({ limit });
      return Response.json({ items });
    }
    
    // POST /api/ask/star/:id - toggle star
    if (path.startsWith("/api/ask/star/") && method === "POST") {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      const starred = await toggleStar(id);
      return Response.json({ starred });
    }
    
    // DELETE /api/ask/history/:id - delete entry
    if (path.startsWith("/api/ask/history/") && method === "DELETE") {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      const success = await deleteEntry(id);
      if (!success) {
        return Response.json({ error: "Item not found" }, { status: 404 });
      }
      return Response.json({ success: true });
    }
    
    // GET /api/ask/script/:id - get script content
    if (path.startsWith("/api/ask/script/") && method === "GET") {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      const script = await getScript(id);
      if (!script) {
        return Response.json({ error: "Script not found" }, { status: 404 });
      }
      return new Response(script, {
        headers: { "Content-Type": "text/plain" }
      });
    }
    
    // GET /api/ask/result/:id - get cached result
    if (path.startsWith("/api/ask/result/") && method === "GET") {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      const result = await getResult(id);
      if (!result) {
        return Response.json({ error: "Result not found" }, { status: 404 });
      }
      return Response.json(result);
    }
    
    // POST /api/ask/trash/:id - alias for delete (backwards compat)
    if (path.startsWith("/api/ask/trash/") && method === "POST") {
      const id = path.split("/").pop();
      if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
      
      const success = await deleteEntry(id);
      if (!success) {
        return Response.json({ error: "Item not found" }, { status: 404 });
      }
      return Response.json({ success: true });
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
