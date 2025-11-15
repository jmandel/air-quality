import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { DashboardResponse } from "./dashboard-types";

export async function askShelley(question: string): Promise<{ 
  answer: DashboardResponse | string, 
  conversationId: string,
  usedMock?: boolean
}> {
  // For now, use mock implementation until Shelley LLM access is configured
  // TODO: Replace with full Shelley integration once API keys are available
  
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  try {
    // Copy the mock template
    const templatePath = "/home/exedev/app/mock-analyze-template.ts";
    const template = await Bun.file(templatePath).text();
    await Bun.write(analyzePath, template);
    
    // Run the analyze script
    const analyzeProc = Bun.spawn([
      "bun",
      analyzePath
    ], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
      }
    });
    
    const jsonOutput = await new Response(analyzeProc.stdout).text();
    const stderrOutput = await new Response(analyzeProc.stderr).text();
    const analyzeExit = await analyzeProc.exited;
    
    if (analyzeExit !== 0) {
      console.error("Script stderr:", stderrOutput);
    }
    
    // Parse the JSON output
    const dashboardResponse = JSON.parse(jsonOutput.trim()) as DashboardResponse;
    
    // Clean up
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    
    return {
      answer: dashboardResponse,
      conversationId: `mock-${Date.now()}`,
      usedMock: true
    };
    
  } catch (error) {
    console.error("Error running analyze script:", error);
    
    // Clean up
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    
    throw error;
  }
}
