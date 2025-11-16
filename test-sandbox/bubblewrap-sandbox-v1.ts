/**
 * Bubblewrap Sandbox for Shelley-generated scripts
 * 
 * Provides isolated execution environment for untrusted code generation
 */

import { mkdir, rm, chmod, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "bun";

export interface SandboxConfig {
  /** Path to the script to execute */
  scriptPath: string;
  
  /** Path to database (will be mounted read-only) */
  dbPath: string;
  
  /** Working directory for script execution */
  workDir: string;
  
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  
  /** Whether to allow network access (default: true for Shelley) */
  allowNetwork?: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Execute a script in a bubblewrap sandbox
 */
export async function runInSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const {
    scriptPath,
    dbPath,
    workDir,
    timeoutMs = 30000,
    allowNetwork = true
  } = config;

  // Ensure work directory exists
  await mkdir(workDir, { recursive: true });

  try {
    // Build bubblewrap arguments
    const bwrapArgs = buildBwrapArgs(workDir, allowNetwork);
    
    // Bun is already mounted at /bun in the sandbox
    // Spawn the sandboxed process
    const proc = spawn(["bwrap", ...bwrapArgs, "/bun/bin/bun", "/work/analyze.ts"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        DATABASE_PATH: "/work/db.sqlite",
      }
    });

    // Handle timeout
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);

    // Wait for completion
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    clearTimeout(timeoutHandle);

    return {
      stdout: stdoutBuf,
      stderr: stderrBuf,
      exitCode: exitCode || 0,
      timedOut
    };

  } catch (error: any) {
    return {
      stdout: "",
      stderr: error.message || String(error),
      exitCode: 1,
      timedOut: false
    };
  }
}

/**
 * Build bubblewrap arguments for filesystem isolation
 */
function buildBwrapArgs(workDir: string, allowNetwork: boolean): string[] {
  const bunDir = join(process.env.HOME || "/home/exedev", ".bun");
  
  const args = [
    // System directories (read-only)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/sbin", "/sbin",
    
    // DNS resolution
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    
    // SSL certificates (for HTTPS)
    "--ro-bind", "/etc/ssl", "/etc/ssl",
    "--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates",
    
    // Bun runtime
    "--ro-bind", bunDir, "/bun",
    
    // Work directory (read-write for script output)
    "--bind", workDir, "/work",
    
    // System necessities
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    
    // Security
    "--die-with-parent",  // Kill if parent dies
    "--new-session",      // New session ID
    
    // Working directory
    "--chdir", "/work"
  ];

  // Network access
  if (allowNetwork) {
    args.push("--share-net");
  } else {
    args.push("--unshare-net");
  }

  return args;
}

/**
 * Generate a Shelley config with embedded token for sandbox use
 */
export async function createShelleyConfig(
  workDir: string
): Promise<string> {
  // Get fresh token
  const tokenProc = spawn(["sudo", "/usr/local/bin/generate-gateway-token"], {
    stdout: "pipe"
  });
  const token = (await new Response(tokenProc.stdout).text()).trim();

  // Create config with embedded token
  const config = {
    default_model: "claude-sonnet-4.5",
    llm_gateway: "https://exe.dev",
    key_generator: `echo '${token}'`
  };

  const configPath = join(workDir, "shelley-config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));
  
  return configPath;
}

/**
 * Run Shelley in sandbox to generate a script
 */
export async function runShelleyInSandbox(
  prompt: string,
  workDir: string,
  timeoutMs = 60000
): Promise<SandboxResult> {
  // Create Shelley config
  await createShelleyConfig(workDir);

  const bwrapArgs = buildBwrapArgs(workDir, true);  // Network needed

  const proc = spawn(
    ["bwrap", ...bwrapArgs, "/usr/local/bin/shelley", "-config", "/work/shelley-config.json", "prompt", prompt],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp"
      }
    }
  );

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  clearTimeout(timeoutHandle);

  return {
    stdout: stdoutBuf,
    stderr: stderrBuf,
    exitCode: exitCode || 0,
    timedOut
  };
}
