/**
 * Test the bubblewrap-sandbox module
 */

import { runShelleyInSandbox, runInSandbox } from "./bubblewrap-sandbox";
import { mkdir, rm, copyFile } from "fs/promises";
import { join } from "path";

const TEST_DIR = "/tmp/sandbox-test";

async function testShelleyGeneration() {
  console.log("\n=== Test 1: Shelley generates script ===");
  
  await mkdir(TEST_DIR, { recursive: true });
  
  const prompt = `Write a TypeScript script called analyze.ts that:
1. Imports Database from 'bun:sqlite'
2. Opens /work/db.sqlite  
3. Queries: SELECT COUNT(*) as count FROM sensors
4. Outputs JSON: {"sensor_count": <number>} using console.log()`;

  try {
    const result = await runShelleyInSandbox(prompt, TEST_DIR, 60000);
    
    console.log("Exit code:", result.exitCode);
    console.log("Timed out:", result.timedOut);
    
    // Check if script was created
    const scriptExists = await Bun.file(join(TEST_DIR, "analyze.ts")).exists();
    console.log("Script created:", scriptExists);
    
    if (scriptExists) {
      const script = await Bun.file(join(TEST_DIR, "analyze.ts")).text();
      console.log("\n--- Generated script: ---");
      console.log(script);
      return true;
    }
    return false;
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
}

async function testScriptExecution() {
  console.log("\n=== Test 2: Execute generated script ===");
  
  await mkdir(TEST_DIR, { recursive: true });
  
  // Copy database using copyFile
  const dbPath = "/home/exedev/app/db.sqlite";
  await copyFile(dbPath, join(TEST_DIR, "db.sqlite"));
  
  // Create simple test script
  const script = `import { Database } from 'bun:sqlite';

const db = new Database('/work/db.sqlite');
const result = db.query('SELECT COUNT(*) as count FROM sensors').get();
console.log(JSON.stringify({ sensor_count: result.count }));
`;
  
  await Bun.write(join(TEST_DIR, "analyze.ts"), script);
  
  try {
    const result = await runInSandbox({
      scriptPath: join(TEST_DIR, "analyze.ts"),
      dbPath: join(TEST_DIR, "db.sqlite"),
      workDir: TEST_DIR,
      timeoutMs: 10000,
      allowNetwork: false
    });
    
    console.log("Exit code:", result.exitCode);
    console.log("Timed out:", result.timedOut);
    console.log("\nStdout:");
    console.log(result.stdout);
    
    if (result.stderr) {
      console.log("\nStderr:");
      console.log(result.stderr);
    }
    
    // Try to parse JSON
    try {
      const data = JSON.parse(result.stdout.trim());
      console.log("\nParsed JSON:", data);
      return data.sensor_count > 0;
    } catch (e) {
      console.log("Failed to parse JSON:", e);
      return false;
    }
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
}

async function testFilesystemIsolation() {
  console.log("\n=== Test 3: Filesystem isolation ===");
  
  await mkdir(TEST_DIR, { recursive: true });
  
  // Create script that tries to access forbidden paths
  const script = `const { existsSync, readFileSync } = require('fs');

const results = {
  can_read_etc_shadow: false,
  can_see_home: false
};

try {
  readFileSync('/etc/shadow', 'utf-8');
  results.can_read_etc_shadow = true;
} catch (e) {
  // Good - should fail
}

try {
  const homeExists = existsSync('/home');
  results.can_see_home = homeExists;
} catch (e) {
  // Should fail
}

console.log(JSON.stringify(results));
`;
  
  await Bun.write(join(TEST_DIR, "analyze.ts"), script);
  
  try {
    const result = await runInSandbox({
      scriptPath: join(TEST_DIR, "analyze.ts"),
      dbPath: "",
      workDir: TEST_DIR,
      timeoutMs: 5000,
      allowNetwork: false
    });
    
    console.log("Exit code:", result.exitCode);
    console.log("\nStdout:");
    console.log(result.stdout);
    
    if (result.stderr) {
      console.log("\nStderr:");
      console.log(result.stderr.substring(0, 500));
    }
    
    if (result.stdout.trim()) {
      const data = JSON.parse(result.stdout.trim());
      console.log("\nIsolation results:");
      console.log("- Can read /etc/shadow:", data.can_read_etc_shadow, data.can_read_etc_shadow ? "❌ BAD" : "✅ GOOD");
      console.log("- Can see /home:", data.can_see_home, data.can_see_home ? "❌ BAD" : "✅ GOOD");
      
      return !data.can_read_etc_shadow && !data.can_see_home;
    }
    return false;
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
}

// Run all tests
async function runAllTests() {
  console.log("=================================");
  console.log("BUBBLEWRAP SANDBOX TEST SUITE");
  console.log("=================================");
  
  const results = {
    shelleyGeneration: false,
    scriptExecution: false,
    filesystemIsolation: false
  };
  
  try {
    results.shelleyGeneration = await testShelleyGeneration();
  } catch (e: any) {
    console.error("Test 1 failed:", e.message);
  }
  
  try {
    results.scriptExecution = await testScriptExecution();
  } catch (e: any) {
    console.error("Test 2 failed:", e.message);
  }
  
  try {
    results.filesystemIsolation = await testFilesystemIsolation();
  } catch (e: any) {
    console.error("Test 3 failed:", e.message);
  }
  
  console.log("\n=================================");
  console.log("TEST RESULTS");
  console.log("=================================");
  console.log("Shelley generation:", results.shelleyGeneration ? "✅ PASS" : "❌ FAIL");
  console.log("Script execution:", results.scriptExecution ? "✅ PASS" : "❌ FAIL");
  console.log("Filesystem isolation:", results.filesystemIsolation ? "✅ PASS" : "❌ FAIL");
  console.log("=================================");
  
  const allPassed = Object.values(results).every(r => r);
  process.exit(allPassed ? 0 : 1);
}

runAllTests();
