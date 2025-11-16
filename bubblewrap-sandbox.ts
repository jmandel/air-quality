/**
 * Bubblewrap Sandbox for Shelley-generated scripts
 * 
 * Version 2: Direct DB mounting (no copy needed)
 */

import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "bun";

export interface SandboxConfig {
  /** Path to the script to execute */
  scriptPath: string;
  
  /** Path to database (will be mounted read-only, NOT copied) */
  dbPath: string;
  
  /** Working directory for script execution */
  workDir: string;
  
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  
  /** Whether to allow network access (default: false for scripts) */
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
 * 
 * Database is mounted directly (read-only) - NO COPY!
 */
export async function runInSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const {
    scriptPath,
    dbPath,
    workDir,
    timeoutMs = 30000,
    allowNetwork = false
  } = config;

  // Ensure work directory exists
  await mkdir(workDir, { recursive: true });

  try {
    // Build bubblewrap arguments with DIRECT DB mount
    const bwrapArgs = buildBwrapArgs(workDir, dbPath, allowNetwork);
    
    // Bun is mounted at /bun in the sandbox
    const proc = spawn(["bwrap", ...bwrapArgs, "/bun/bin/bun", "/work/analyze.ts"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        // Scripts should use /db/db.sqlite
        DATABASE_PATH: "/db/db.sqlite",
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
 * 
 * Database is mounted read-only at /db/db.sqlite (NO COPY!)
 */
function buildBwrapArgs(workDir: string, dbPath: string, allowNetwork: boolean): string[] {
  const bunDir = join(process.env.HOME || "/home/exedev", ".bun");
  
  const args = [
    // System directories (read-only)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/sbin", "/sbin",
    
    // DNS resolution (only if network enabled)
    ...(allowNetwork ? [
      "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
      "--ro-bind", "/etc/ssl", "/etc/ssl",
      "--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates"
    ] : []),
    
    // Bun runtime
    "--ro-bind", bunDir, "/bun",
    
    // Database - DIRECT MOUNT (read-only, no copy!)
    "--ro-bind", dbPath, "/db/db.sqlite",
    
    // Work directory (read-write for script output)
    "--bind", workDir, "/work",
    
    // System necessities
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    
    // Security
    "--die-with-parent",
    "--new-session",
    
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
 * Build bubblewrap arguments for Shelley execution
 * (Shelley needs network but not database)
 */
function buildShelleyBwrapArgs(workDir: string): string[] {
  const args = [
    // System directories (read-only)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/sbin", "/sbin",
    
    // DNS resolution and SSL (needed for API calls)
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--ro-bind", "/etc/ssl", "/etc/ssl",
    "--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates",
    
    // Work directory (read-write for generated scripts)
    "--bind", workDir, "/work",
    
    // System necessities
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    
    // Security
    "--die-with-parent",
    "--new-session",
    
    // Network (Shelley needs to call Claude API)
    "--share-net",
    
    // Working directory
    "--chdir", "/work"
  ];

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
  timeoutMs = 180000
): Promise<SandboxResult> {
  // Create Shelley config
  await createShelleyConfig(workDir);

  const bwrapArgs = buildShelleyBwrapArgs(workDir);

  const proc = spawn(
    ["bwrap", ...bwrapArgs, "/usr/local/bin/shelley", "-config", "/work/shelley-config.json", "prompt", "-timeout", "180s", prompt],
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
