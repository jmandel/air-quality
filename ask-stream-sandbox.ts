import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { runShelleyInSandbox, runInSandbox, createShelleyConfig } from "./bubblewrap-sandbox";

/**
 * Stream Shelley execution progress to the client (SANDBOXED VERSION)
 */
export async function* streamShelleyExecutionSandboxed(
  question: string,
  analyzePath: string,
  tempDir: string,
  prompt: string,
  useCachedScript: boolean,
  scriptContent?: string
): AsyncGenerator<{ type: string; data: any }> {
  
  if (useCachedScript && scriptContent) {
    yield { type: "status", data: "Using cached script..." };
    await writeFile(analyzePath, scriptContent);
    yield { type: "cached", data: true };
  } else {
    yield { type: "status", data: "🔒 Calling Shelley (sandboxed) to generate analysis script..." };
    
    // Create Shelley config with fresh token
    await createShelleyConfig(tempDir);
    
    // Run Shelley in sandbox
    yield { type: "status", data: "⚡ Generating script in isolated environment..." };
    
    const shelleyResult = await runShelleyInSandbox(prompt, tempDir, 180000);
    
    if (shelleyResult.exitCode !== 0) {
      yield { type: "error", data: { message: `Shelley failed: ${shelleyResult.stderr}` } };
      throw new Error(`Shelley failed with exit code ${shelleyResult.exitCode}`);
    }
    
    // Parse stdout for interesting messages
    const lines = shelleyResult.stdout.split('\n');
    let inConversation = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Skip structured log lines
      if (trimmed.match(/^time=.*level=.*msg=/)) continue;
      
      // Detect conversation boundaries
      if (trimmed.match(/^Created conversation:/)) {
        inConversation = true;
        continue;
      }
      if (trimmed.match(/^(Conversation completed|To continue:)/)) {
        inConversation = false;
        continue;
      }
      
      // Stream conversation messages
      if (inConversation && trimmed.match(/^[👤🤖🔧]/)) {
        yield { type: "shelley_progress", data: trimmed };
      }
    }
    
    yield { type: "shelley_complete", data: { exitCode: 0 } };
    
    // Check if script was created
    const scriptExists = await Bun.file(analyzePath).exists();
    if (!scriptExists) {
      yield { type: "error", data: { message: "Shelley did not create the analyze script" } };
      throw new Error("Shelley did not create the analyze script");
    }
    
    scriptContent = await Bun.file(analyzePath).text();
    
    yield { type: "script_created", data: { path: analyzePath, size: scriptContent.length } };
  }
  
  // Now execute the script in sandbox
  yield { type: "status", data: "🔒 Executing script (sandboxed)..." };
  
  const dbPath = "/home/exedev/app/db.sqlite";
  
  const scriptResult = await runInSandbox({
    scriptPath: analyzePath,
    dbPath: dbPath,
    workDir: tempDir,
    timeoutMs: 30000,
    allowNetwork: false  // Scripts don't need network
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
  
  // Stream any stderr messages
  if (scriptResult.stderr) {
    const stderrLines = scriptResult.stderr.split('\n').filter(l => l.trim());
    for (const line of stderrLines) {
      yield { type: "script_progress", data: line };
    }
  }
  
  // Parse and return result
  try {
    const dashboardResponse = JSON.parse(scriptResult.stdout.trim());
    yield { type: "result", data: dashboardResponse };
    yield { type: "done", data: { scriptContent } };
  } catch (e: any) {
    yield { type: "error", data: { 
      message: `Failed to parse script output: ${e.message}`,
      stdout: scriptResult.stdout
    } };
    throw new Error(`Failed to parse script output: ${e.message}`);
  }
}
