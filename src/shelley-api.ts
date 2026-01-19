/**
 * Shelley API client for air quality analysis
 * Based on shelley-power-toys implementation
 */

let SHELLEY_API = process.env.SHELLEY_API || 'http://localhost:9999/api';

/**
 * Set the Shelley API base URL (used when switching to sandboxed instance)
 */
export function setShelleyAPI(url: string): void {
  SHELLEY_API = url;
}
const SHELLEY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Shelley-Request': '1',
  'X-Exedev-Userid': 'air-quality-ask',
};

export interface ShelleyConversation {
  conversation_id: string;
  slug?: string;
  agent_working: boolean;
  messages: ShelleyMessage[];
}

export interface ShelleyMessage {
  type: 'user' | 'agent' | 'tool';
  end_of_turn?: boolean;
  llm_data?: string;
  user_data?: string;
}

async function request<T>(method: string, path: string, data?: any): Promise<T> {
  const url = `${SHELLEY_API}${path}`;
  const options: RequestInit = {
    method,
    headers: SHELLEY_HEADERS,
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Shelley API error ${response.status}: ${errorBody}`);
  }
  
  return response.json();
}

export async function createConversation(
  message: string,
  cwd: string,
  model: string = 'claude-sonnet-4.5'
): Promise<string> {
  const result = await request<{ conversation_id: string }>('POST', '/conversations/new', {
    message,
    model,
    cwd,
  });
  return result.conversation_id;
}

export async function getConversation(conversationId: string): Promise<ShelleyConversation> {
  return request<ShelleyConversation>('GET', `/conversation/${conversationId}`);
}

export function extractFinalResponse(conversation: ShelleyConversation): string | null {
  const messages = conversation.messages || [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'agent' && msg.end_of_turn && msg.llm_data) {
      try {
        const data = JSON.parse(msg.llm_data);
        for (const content of data.Content || []) {
          // Type 0 is text in the llm package
          if (content.Type === 0 && content.Text) {
            return content.Text;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  return null;
}

/**
 * Wait for a conversation to complete and return the final response
 */
export async function waitForCompletion(
  conversationId: string,
  timeoutMs: number = 180000,
  pollIntervalMs: number = 1000,
  onProgress?: (status: string) => void
): Promise<{ response: string | null; conversation: ShelleyConversation }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const conversation = await getConversation(conversationId);
    
    if (!conversation.agent_working) {
      // Check for completed turn
      const hasComplete = conversation.messages?.some(
        m => m.type === 'agent' && m.end_of_turn
      );
      
      if (hasComplete) {
        const response = extractFinalResponse(conversation);
        return { response, conversation };
      }
    }
    
    if (onProgress) {
      onProgress(`Waiting for Shelley... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error(`Timeout waiting for conversation ${conversationId}`);
}

/**
 * Stream conversation progress via SSE
 */
/**
 * Content types from Shelley's llm package
 */
const ContentType = {
  Text: 0,
  Thinking: 1, 
  RedactedThinking: 2,
  ToolUse: 3,
  ToolResult: 4,
  // Extended types
  ToolUseExt: 5,
  ToolResultExt: 6,
};

/**
 * Parse message content from llm_data
 */
function parseMessageContent(msg: ShelleyMessage): { texts: string[]; tools: { name: string; input?: any }[] } {
  const result = { texts: [] as string[], tools: [] as { name: string; input?: any }[] };
  if (!msg.llm_data) return result;
  
  try {
    const data = JSON.parse(msg.llm_data);
    for (const content of data.Content || []) {
      // Text content
      if ((content.Type === ContentType.Text || content.Type === 2) && content.Text) {
        result.texts.push(content.Text);
      }
      // Tool use - check both Type 3 and Type 5
      if ((content.Type === ContentType.ToolUse || content.Type === ContentType.ToolUseExt) && content.ToolName) {
        result.tools.push({ 
          name: content.ToolName, 
          input: content.ToolInput 
        });
      }
    }
  } catch {}
  return result;
}

/**
 * Parse tool result content  
 */
function parseToolResult(msg: ShelleyMessage): string | null {
  if (!msg.llm_data) return null;
  try {
    const data = JSON.parse(msg.llm_data);
    for (const content of data.Content || []) {
      // Tool result - check Type 4 and Type 6
      if (content.ToolResult && Array.isArray(content.ToolResult)) {
        for (const r of content.ToolResult) {
          if ((r.Type === ContentType.Text || r.Type === 2) && r.Text) {
            const text = r.Text.trim();
            if (text.length > 100) {
              return text.substring(0, 100) + '...';
            }
            return text;
          }
        }
      }
    }
  } catch {}
  return null;
}

export async function* streamConversation(
  conversationId: string,
  timeoutMs: number = 180000
): AsyncGenerator<{ type: string; data: any }> {
  const startTime = Date.now();
  let lastMessageCount = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    const conversation = await getConversation(conversationId);
    const messages = conversation.messages || [];
    
    // Process new messages
    for (let i = lastMessageCount; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.type === 'agent') {
        const parsed = parseMessageContent(msg);
        
        // Report tool uses with input preview
        for (const tool of parsed.tools) {
          let inputPreview = '';
          if (tool.input) {
            if (typeof tool.input === 'string') {
              inputPreview = tool.input.substring(0, 60);
            } else if (tool.input.command) {
              inputPreview = tool.input.command.substring(0, 60);
            } else if (tool.input.path) {
              inputPreview = tool.input.path;
            }
          }
          yield { type: 'tool_use', data: { tool: tool.name, input: inputPreview } };
        }
        
        // Report text (thinking/response)
        for (const text of parsed.texts) {
          const preview = text.substring(0, 150).replace(/\n/g, ' ').trim();
          if (preview) {
            yield { type: 'agent_text', data: { text: preview + (text.length > 150 ? '...' : '') } };
          }
        }
      } else if (msg.type === 'tool' || msg.type === 'user') {
        // Tool results come back as 'user' type messages
        const result = parseToolResult(msg);
        if (result) {
          yield { type: 'tool_result', data: { preview: result } };
        }
      }
    }
    lastMessageCount = messages.length;
    
    // Check for completion
    if (!conversation.agent_working) {
      const hasComplete = messages.some(m => m.type === 'agent' && m.end_of_turn);
      if (hasComplete) {
        const response = extractFinalResponse(conversation);
        yield { type: 'complete', data: { response, conversation } };
        return;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error('Timeout waiting for Shelley response');
}
