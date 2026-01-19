/**
 * Sandboxed Shelley Server
 * 
 * Runs a Shelley instance inside bubblewrap with restricted filesystem access.
 * The sandboxed agent can only see:
 * - /work - working directory for the conversation
 * - /work/db.sqlite - read-only air quality database
 * - /sandbox - shelley's own database
 * - System binaries and libraries (read-only)
 */

import { spawn, type Subprocess } from "bun";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const SHELLEY_BIN = "/usr/local/bin/shelley";
const SHELLEY_CONFIG = "/exe.dev/shelley.json";
const SANDBOX_PORT = 9998;

interface SandboxedShelley {
  port: number;
  process: Subprocess;
  workDir: string;
  sandboxDir: string;
  cleanup: () => Promise<void>;
}

let currentInstance: SandboxedShelley | null = null;

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
 * Start a sandboxed Shelley server
 */
export async function startSandboxedShelley(airDbPath: string): Promise<SandboxedShelley> {
  // Clean up any existing instance
  if (currentInstance) {
    await currentInstance.cleanup();
  }
  
  // Create sandbox directories
  const sandboxDir = await mkdtemp(join(tmpdir(), "shelley-sandbox-"));
  const workDir = join(sandboxDir, "work");
  await mkdir(workDir, { recursive: true });
  
  const port = SANDBOX_PORT;
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
    if (currentInstance?.sandboxDir === sandboxDir) {
      currentInstance = null;
    }
  };
  
  currentInstance = {
    port,
    process: proc,
    workDir,
    sandboxDir,
    cleanup,
  };
  
  return currentInstance;
}

/**
 * Get the current sandboxed Shelley instance, starting one if needed
 */
export async function getSandboxedShelley(airDbPath: string): Promise<SandboxedShelley> {
  if (currentInstance) {
    // Check if the process is still running
    try {
      const response = await fetch(`http://localhost:${currentInstance.port}/`);
      if (response.ok) {
        return currentInstance;
      }
    } catch {
      // Process died, clean up
      await currentInstance.cleanup();
    }
  }
  
  return startSandboxedShelley(airDbPath);
}

/**
 * Shut down the sandboxed Shelley instance
 */
export async function stopSandboxedShelley(): Promise<void> {
  if (currentInstance) {
    await currentInstance.cleanup();
  }
}

/**
 * Get the API base URL for the sandboxed Shelley
 */
export function getSandboxedShelleyAPI(): string {
  return `http://localhost:${SANDBOX_PORT}/api`;
}
