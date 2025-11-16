import { spawn } from "bun";
import { writeFile } from "fs/promises";

/**
 * Stream Shelley execution progress to the client
 */
export async function* streamShelleyExecution(
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
    yield { type: "status", data: "Calling Shelley to generate analysis script..." };
    
    // Spawn Shelley
    const shelleyProc = spawn(
      ["shelley", "-config", "/exe.dev/shelley.json", "-model", "claude-sonnet-4.5", "prompt", "-timeout", "180s", prompt],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
        }
      }
    );
    
    // Stream stdout line by line (Shelley writes progress here)
    const stdoutReader = shelleyProc.stdout.getReader();
    const stdoutDecoder = new TextDecoder();
    let stdoutBuffer = "";
    
    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;
      
      stdoutBuffer += stdoutDecoder.decode(value, { stream: true });
      const lines = stdoutBuffer.split("\n");
      // Keep the last incomplete line in the buffer
      const incompleteLine = lines.pop() || "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          // Send interesting lines (user messages, not just log lines)
          // Shelley user messages typically start with emoji like 👤 🤖 🔧
          if (trimmed.match(/^[👤🤖🔧]/)) {
            yield { type: "shelley_progress", data: trimmed };
          }
        }
      }
      
      stdoutBuffer = incompleteLine;
    }
    
    // Get final buffer and exit code
    if (stdoutBuffer.trim()) {
      const trimmed = stdoutBuffer.trim();
      if (trimmed.match(/^[👤🤖🔧]/)) {
        yield { type: "shelley_progress", data: trimmed };
      }
    }
    
    const exitCode = await shelleyProc.exited;
    
    yield { type: "shelley_complete", data: { exitCode, outputLength: stdoutBuffer.length } };
    
    if (exitCode !== 0) {
      yield { type: "error", data: { message: `Shelley failed with exit code ${exitCode}` } };
      throw new Error(`Shelley failed with exit code ${exitCode}`);
    }
    
    // Check if script was created
    const scriptExists = await Bun.file(analyzePath).exists();
    if (!scriptExists) {
      yield { type: "error", data: { message: "Shelley did not create the analyze script" } };
      throw new Error("Shelley did not create the analyze script");
    }
    
    scriptContent = await Bun.file(analyzePath).text();
    yield { type: "script_created", data: { size: scriptContent.length } };
  }
  
  // Execute the script
  yield { type: "status", data: "Executing analysis script..." };
  
  const analyzeProc = spawn([`${process.env.HOME}/.bun/bin/bun`, analyzePath], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: tempDir,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
    }
  });
  
  // Collect stdout in background (this is the JSON result)
  let analyzeStdoutBuffer = "";
  const analyzeStdoutReader = analyzeProc.stdout.getReader();
  const analyzeStdoutDecoder = new TextDecoder();
  const analyzeStdoutPromise = (async () => {
    while (true) {
      const { done, value } = await analyzeStdoutReader.read();
      if (done) break;
      analyzeStdoutBuffer += analyzeStdoutDecoder.decode(value, { stream: true });
    }
    return analyzeStdoutBuffer;
  })();
  
  // Stream stderr (if the script logs anything)
  const analyzeStderrReader = analyzeProc.stderr.getReader();
  const analyzeStderrDecoder = new TextDecoder();
  let analyzeStderrBuffer = "";
  
  while (true) {
    const { done, value } = await analyzeStderrReader.read();
    if (done) break;
    
    analyzeStderrBuffer += analyzeStderrDecoder.decode(value, { stream: true });
    const lines = analyzeStderrBuffer.split("\n");
    analyzeStderrBuffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.trim()) {
        yield { type: "script_progress", data: line.trim() };
      }
    }
  }
  
  const jsonOutput = await analyzeStdoutPromise;
  const analyzeExit = await analyzeProc.exited;
  
  yield { type: "script_complete", data: { exitCode: analyzeExit, outputLength: jsonOutput.length } };
  
  if (analyzeExit !== 0) {
    yield { type: "error", data: { message: `Script failed with exit code ${analyzeExit}` } };
    throw new Error(`Script failed with exit code ${analyzeExit}`);
  }
  
  // Parse and return result
  const dashboardResponse = JSON.parse(jsonOutput.trim());
  yield { type: "result", data: dashboardResponse };
  yield { type: "done", data: { scriptContent } };
}
