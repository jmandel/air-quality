/**
 * Lookup cached scripts for questions
 */

import { ASKED_DIR, getHistory, getScript } from "./ask-history";

/**
 * Find a cached script for a question (exact match by slug)
 */
export async function findPreviousScript(question: string): Promise<{
  scriptContent: string;
  previousId: string;
} | null> {
  const history = await getHistory();
  
  // Normalize question for comparison  
  const normalized = question.trim().toLowerCase();
  
  // Find entry with matching question
  const entry = history.find(e => 
    e.question.trim().toLowerCase() === normalized
  );
  
  if (!entry) return null;
  
  const scriptContent = await getScript(entry.id);
  if (!scriptContent) return null;
  
  return {
    scriptContent,
    previousId: entry.id
  };
}
