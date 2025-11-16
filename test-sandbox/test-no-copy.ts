/**
 * Test direct DB mounting (no copy)
 */

import { runInSandbox } from "./bubblewrap-sandbox-v2";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const TEST_DIR = "/tmp/sandbox-nocopy-test";

async function testDirectMount() {
  console.log("=== Test: Direct DB Mount (No Copy) ===\n");
  
  await mkdir(TEST_DIR, { recursive: true });
  
  // Create test script that reads from /db/db.sqlite
  const script = `import { Database } from 'bun:sqlite';

const db = new Database('/db/db.sqlite', { readonly: true });
const result = db.query('SELECT COUNT(*) as count FROM sensors').get();
console.log(JSON.stringify({ sensor_count: result.count }));
db.close();
`;
  
  await Bun.write(join(TEST_DIR, "analyze.ts"), script);
  
  console.log("Script created (reads from /db/db.sqlite)");
  console.log("Database location (host): /home/exedev/app/db.sqlite");
  console.log("Database size:", await getFileSize("/home/exedev/app/db.sqlite"));
  console.log("");
  
  // Time the execution
  const startTime = Date.now();
  
  try {
    const result = await runInSandbox({
      scriptPath: join(TEST_DIR, "analyze.ts"),
      dbPath: "/home/exedev/app/db.sqlite",  // DIRECT MOUNT (no copy!)
      workDir: TEST_DIR,
      timeoutMs: 10000,
      allowNetwork: false
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log("Exit code:", result.exitCode);
    console.log("Stdout:", result.stdout.trim());
    console.log("");
    console.log("⏱️  Execution time:", elapsed, "ms");
    console.log("✅ Direct mount works - NO COPY NEEDED!");
    console.log("");
    
    if (result.exitCode === 0) {
      const data = JSON.parse(result.stdout.trim());
      console.log("Sensor count:", data.sensor_count);
      return true;
    }
    return false;
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
}

async function getFileSize(path: string): Promise<string> {
  const stat = await Bun.file(path).stat();
  const mb = (stat.size / 1024 / 1024).toFixed(2);
  return `${mb} MB`;
}

testDirectMount()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
  });
