/**
 * Test full cycle: Shelley generates, script executes, with DIRECT DB mount
 */

import { runShelleyInSandbox, runInSandbox } from "./bubblewrap-sandbox-v2";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const TEST_DIR = "/tmp/sandbox-fullcycle-nocopy";

async function testFullCycle() {
  console.log("=== Full Cycle Test: Direct DB Mount (No Copy) ===\n");
  
  await mkdir(TEST_DIR, { recursive: true });
  
  // Updated prompt to tell Shelley the DB path inside sandbox
  const prompt = `Write a TypeScript script called analyze.ts that:
1. Imports Database from 'bun:sqlite'
2. Opens /db/db.sqlite (read-only)
3. Queries: SELECT COUNT(*) as count FROM sensors
4. Outputs JSON: {"sensor_count": <number>} using console.log()`;

  console.log("Step 1: Shelley generates script...");
  const genStart = Date.now();
  
  try {
    const genResult = await runShelleyInSandbox(prompt, TEST_DIR, 60000);
    const genElapsed = Date.now() - genStart;
    
    console.log(`✅ Generation complete (${genElapsed}ms)`);
    console.log("");
    
    // Check if script was created
    const scriptExists = await Bun.file(join(TEST_DIR, "analyze.ts")).exists();
    
    if (!scriptExists) {
      console.log("❌ Script not created");
      return false;
    }
    
    const script = await Bun.file(join(TEST_DIR, "analyze.ts")).text();
    console.log("Generated script:");
    console.log("---");
    console.log(script);
    console.log("---");
    console.log("");
    
    // Step 2: Execute the generated script with DIRECT DB mount
    console.log("Step 2: Execute script with direct DB mount...");
    const execStart = Date.now();
    
    const execResult = await runInSandbox({
      scriptPath: join(TEST_DIR, "analyze.ts"),
      dbPath: "/home/exedev/app/db.sqlite",  // DIRECT MOUNT!
      workDir: TEST_DIR,
      timeoutMs: 10000,
      allowNetwork: false
    });
    
    const execElapsed = Date.now() - execStart;
    
    console.log(`Exit code: ${execResult.exitCode}`);
    console.log(`Execution time: ${execElapsed}ms`);
    console.log(`Stdout: ${execResult.stdout.trim()}`);
    console.log("");
    
    if (execResult.exitCode === 0 && execResult.stdout.trim()) {
      const data = JSON.parse(execResult.stdout.trim());
      console.log("✅ SUCCESS!");
      console.log(`   Sensor count: ${data.sensor_count}`);
      console.log(`   Total time: ${genElapsed + execElapsed}ms`);
      console.log(`   DB mounted directly (no copy overhead)`);
      return true;
    }
    
    return false;
    
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
}

testFullCycle()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
  });
