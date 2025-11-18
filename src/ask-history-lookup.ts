import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const ASKED_DIR = join(import.meta.dir, "../asked");

/**
 * Find the most recent script for a given question
 * Returns the script content if found, null otherwise
 */
export async function findPreviousScript(question: string): Promise<{
  scriptContent: string;
  scriptPath: string;
  previousId: string;
} | null> {
  try {
    // Normalize the question for comparison
    const normalizedQuestion = question.trim().toLowerCase();
    
    // Read all metadata files
    const files = await readdir(ASKED_DIR);
    const metadataFiles = files.filter(f => f.endsWith('.json') && !f.includes('/'));
    
    // Find matching questions, sorted by timestamp (newest first)
    const matches: Array<{ id: string; timestamp: string; scriptPath: string }> = [];
    
    for (const file of metadataFiles) {
      const metadataPath = join(ASKED_DIR, file);
      const content = await readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(content);
      
      // Check if question matches (case-insensitive, trimmed)
      if (metadata.question?.trim().toLowerCase() === normalizedQuestion) {
        const id = metadata.id;
        const scriptPath = join(ASKED_DIR, `${id}.ts`);
        
        // Only include if script file exists
        if (existsSync(scriptPath)) {
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
    
    // Sort by timestamp descending (newest first)
    matches.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    // Get the most recent match
    const mostRecent = matches[0];
    const scriptContent = await readFile(mostRecent.scriptPath, 'utf-8');
    
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

/**
 * Get count of how many times a question has been asked
 */
export async function getQuestionCount(question: string): Promise<number> {
  try {
    const normalizedQuestion = question.trim().toLowerCase();
    
    const files = await readdir(ASKED_DIR);
    const metadataFiles = files.filter(f => f.endsWith('.json') && !f.includes('/'));
    
    let count = 0;
    for (const file of metadataFiles) {
      const metadataPath = join(ASKED_DIR, file);
      const content = await readFile(metadataPath, 'utf-8');
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
