// Helper function to call Shelley web server API (running on port 9999)
export async function askShelley(question: string): Promise<{ answer: string, conversationId: string }> {
  // For now, use CLI with predictable model for testing
  // TODO: Use Shelley web API once we figure out the endpoint
  const proc = Bun.spawn([
    "shelley", 
    "-model", "predictable",
    "-db", "/home/exedev/app/airq-ask.db",
    "prompt",
    question
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PATH: "/usr/local/bin:/usr/bin:/bin"
    }
  });
  
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error(`Shelley CLI failed: ${error}`);
  }
  
  // Parse the output
  const lines = output.split('\n');
  const assistantLines = [];
  let inAssistantResponse = false;
  let conversationId = '';
  
  for (const line of lines) {
    if (line.startsWith('Created conversation:')) {
      conversationId = line.split(':')[1].trim();
    }
    
    if (line.startsWith('🤖')) {
      inAssistantResponse = true;
      const match = line.match(/🤖\s+\[[\d:]+\]\s+(.+)/);
      if (match) {
        assistantLines.push(match[1]);
      }
    } else if (inAssistantResponse && !line.startsWith('time=') && !line.startsWith('Conversation') && !line.startsWith('To continue:')) {
      if (line.trim()) {
        assistantLines.push(line);
      }
    }
  }
  
  return {
    answer: assistantLines.join('\n').trim(),
    conversationId
  };
}
