/**
 * Sandboxed Shelley Server
 * 
 * Runs a Shelley instance inside bubblewrap with restricted filesystem access.
 * The sandboxed agent can only see:
 * - /work - working directory for the conversation
 * - /work/db.sqlite - read-only air quality database
 * - /sandbox - shelley's own database
 * - System binaries and libraries (read-only)
 * 
 * Each request gets a fresh sandbox on a random port, which is cleaned up
 * when the request completes.
 */

import { spawn, type Subprocess } from "bun";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const SHELLEY_BIN = "/usr/local/bin/shelley";
const SHELLEY_CONFIG = "/exe.dev/shelley.json";

// Port range for sandboxed Shelley instances
const MIN_PORT = 9900;
const MAX_PORT = 9950;

export interface SandboxedShelley {
  port: number;
  process: Subprocess;
  workDir: string;
  sandboxDir: string;
  apiUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Find an available port in the specified range
 */
async function findAvailablePort(): Promise<number> {
  const startPort = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
  
  for (let i = 0; i < (MAX_PORT - MIN_PORT); i++) {
    const port = MIN_PORT + ((startPort - MIN_PORT + i) % (MAX_PORT - MIN_PORT));
    try {
      // Try to connect - if it fails, port is likely available
      const response = await fetch(`http://localhost:${port}/`, { 
        signal: AbortSignal.timeout(100) 
      });
      // Port is in use, try next
    } catch {
      // Connection failed, port is likely available
      return port;
    }
  }
  
  throw new Error("No available ports in range");
}

/**
 * Build the bubblewrap arguments for running Shelley in a sandbox
 */
function buildBwrapArgs(
  sandboxDir: string,
  workDir: string,
  airDbPath: string,
  port: number
): string[] {
  return [
    // System binaries and libraries (read-only)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    
    // Network configuration (read-only)
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--ro-bind", "/etc/hosts", "/etc/hosts",
    "--ro-bind", "/etc/ssl", "/etc/ssl",
    "--ro-bind", "/etc/passwd", "/etc/passwd",
    "--ro-bind", "/etc/group", "/etc/group",
    
    // Shelley binary and config (read-only)
    "--ro-bind", SHELLEY_CONFIG, "/exe.dev/shelley.json",
    "--ro-bind", SHELLEY_BIN, SHELLEY_BIN,
    
    // Sandbox directory (read-write for shelley.db)
    "--bind", sandboxDir, "/sandbox",
    
    // Work directory (read-write for generated files)
    "--bind", workDir, "/work",
    
    // Air quality database (read-only) - MUST come after work bind
    "--ro-bind", airDbPath, "/work/db.sqlite",
    
    // System mounts
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    
    // Sandbox options
    "--die-with-parent",
    "--chdir", "/work",
    
    // The command to run
    "--",
    SHELLEY_BIN,
    "-config", "/exe.dev/shelley.json",
    "-db", "/sandbox/shelley.db",
    "serve",
    "-port", port.toString(),
  ];
}

/**
 * Start a new sandboxed Shelley server for a single request.
 * Returns a sandbox instance that should be cleaned up when done.
 */
export async function startSandboxedShelley(airDbPath: string): Promise<SandboxedShelley> {
  // Find an available port
  const port = await findAvailablePort();
  
  // Create sandbox directories
  const sandboxDir = await mkdtemp(join(tmpdir(), "shelley-sandbox-"));
  const workDir = join(sandboxDir, "work");
  await mkdir(workDir, { recursive: true });
  
  const bwrapArgs = buildBwrapArgs(sandboxDir, workDir, airDbPath, port);
  
  // Start the sandboxed Shelley process
  const proc = spawn(["bwrap", ...bwrapArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  
  // Wait for the server to be ready
  const maxWaitMs = 10000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) {
        break;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Verify server is running
  try {
    const response = await fetch(`http://localhost:${port}/`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (err) {
    proc.kill();
    await rm(sandboxDir, { recursive: true, force: true });
    throw new Error(`Failed to start sandboxed Shelley: ${err}`);
  }
  
  const cleanup = async () => {
    proc.kill();
    // Wait a bit for process to terminate
    await new Promise(resolve => setTimeout(resolve, 100));
    await rm(sandboxDir, { recursive: true, force: true });
  };
  
  return {
    port,
    process: proc,
    workDir,
    sandboxDir,
    apiUrl: `http://localhost:${port}/api`,
    cleanup,
  };
}
