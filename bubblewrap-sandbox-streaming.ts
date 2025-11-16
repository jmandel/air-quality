/**
 * Bubblewrap Sandbox with STREAMING support
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "bun";

export interface SandboxConfig {
  scriptPath: string;
  dbPath: string;
  workDir: string;
  timeoutMs?: number;
  allowNetwork?: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Stream Shelley execution with real-time progress
 */
export async function* streamShelleyInSandbox(
  prompt: string,
  workDir: string,
  timeoutMs = 180000
): AsyncGenerator<{ type: string; data: any }> {
  
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
  
  // Set up timeout
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  
  // Stream stdout line by line
  const stdoutReader = proc.stdout.getReader();
  const stdoutDecoder = new TextDecoder();
  let stdoutBuffer = "";
  let inConversation = false;
  
  try {
    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;
      
      stdoutBuffer += stdoutDecoder.decode(value, { stream: true });
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      
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
        
        // Stream interesting lines
        if (inConversation && trimmed.match(/^[👤🤖🔧]/)) {
          yield { type: "shelley_progress", data: trimmed };
        }
      }
    }
    
    const exitCode = await proc.exited;
    clearTimeout(timeoutHandle);
    
    yield { 
      type: "shelley_complete", 
      data: { exitCode, timedOut } 
    };
    
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Shelley failed with exit code ${exitCode}: ${stderr}`);
    }
    
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Execute script in sandbox (non-streaming)
 */
export async function runInSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const {
    scriptPath,
    dbPath,
    workDir,
    timeoutMs = 30000,
    allowNetwork = false
  } = config;

  await mkdir(workDir, { recursive: true });

  try {
    const bwrapArgs = buildBwrapArgs(workDir, dbPath, allowNetwork);
    
    // Extract script filename from scriptPath
    const scriptName = scriptPath.split('/').pop() || 'analyze.ts';
    
    const proc = spawn(["bwrap", ...bwrapArgs, "/bun/bin/bun", `/work/${scriptName}`], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        DATABASE_PATH: "/db/db.sqlite",
      }
    });

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

  } catch (error: any) {
    return {
      stdout: "",
      stderr: error.message || String(error),
      exitCode: 1,
      timedOut: false
    };
  }
}

function buildBwrapArgs(workDir: string, dbPath: string, allowNetwork: boolean): string[] {
  const bunDir = join(process.env.HOME || "/home/exedev", ".bun");
  
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/sbin", "/sbin",
    "--ro-bind", bunDir, "/bun",
    "--ro-bind", dbPath, "/db/db.sqlite",
    "--bind", workDir, "/work",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--die-with-parent",
    "--new-session",
    "--chdir", "/work"
  ];

  if (allowNetwork) {
    args.push("--share-net");
  } else {
    args.push("--unshare-net");
  }

  return args;
}

function buildShelleyBwrapArgs(workDir: string): string[] {
  const bunDir = join(process.env.HOME || "/home/exedev", ".bun");
  const dbPath = "/home/exedev/app/db.sqlite";
  
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/sbin", "/sbin",
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--ro-bind", "/etc/ssl", "/etc/ssl",
    "--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates",
    "--ro-bind", bunDir, "/bun",  // Mount Bun for testing scripts
    "--ro-bind", dbPath, "/db/db.sqlite",  // Mount database for testing scripts
    "--bind", workDir, "/work",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--die-with-parent",
    "--new-session",
    "--share-net",
    "--chdir", "/work"
  ];

  return args;
}

export async function createShelleyConfig(workDir: string): Promise<string> {
  const tokenProc = spawn(["sudo", "/usr/local/bin/generate-gateway-token"], {
    stdout: "pipe"
  });
  const token = (await new Response(tokenProc.stdout).text()).trim();

  const config = {
    default_model: "claude-sonnet-4.5",
    llm_gateway: "https://exe.dev",
    key_generator: `echo '${token}'`
  };

  const configPath = join(workDir, "shelley-config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));
  
  return configPath;
}
