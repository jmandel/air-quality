/**
 * Shelley API client for air quality analysis
 * All functions take apiUrl as first parameter to support multiple concurrent sessions
 */

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

async function request<T>(apiUrl: string, method: string, path: string, data?: any): Promise<T> {
  const url = `${apiUrl}${path}`;
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
  apiUrl: string,
  message: string,
  cwd: string,
  model: string = 'claude-sonnet-4.5'
): Promise<string> {
  const result = await request<{ conversation_id: string }>(apiUrl, 'POST', '/conversations/new', {
    message,
    model,
    cwd,
  });
  return result.conversation_id;
}

export async function getConversation(apiUrl: string, conversationId: string): Promise<ShelleyConversation> {
  return request<ShelleyConversation>(apiUrl, 'GET', `/conversation/${conversationId}`);
}

export function extractFinalResponse(conversation: ShelleyConversation): string | null {
  const messages = conversation.messages || [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'agent' && msg.end_of_turn && msg.llm_data) {
      try {
        const data = JSON.parse(msg.llm_data);
        for (const content of data.Content || []) {
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
 * Content types from Shelley's llm package
 */
const ContentType = {
  Text: 0,
  Thinking: 1, 
  RedactedThinking: 2,
  ToolUse: 3,
  ToolResult: 4,
  ToolUseExt: 5,
  ToolResultExt: 6,
};

function parseMessageContent(msg: ShelleyMessage): { texts: string[]; tools: { name: string; input?: any }[] } {
  const result = { texts: [] as string[], tools: [] as { name: string; input?: any }[] };
  if (!msg.llm_data) return result;
  
  try {
    const data = JSON.parse(msg.llm_data);
    for (const content of data.Content || []) {
      if ((content.Type === ContentType.Text || content.Type === 2) && content.Text) {
        result.texts.push(content.Text);
      }
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

function parseToolResult(msg: ShelleyMessage): string | null {
  if (!msg.llm_data) return null;
  try {
    const data = JSON.parse(msg.llm_data);
    for (const content of data.Content || []) {
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
  apiUrl: string,
  conversationId: string,
  timeoutMs: number = 180000
): AsyncGenerator<{ type: string; data: any }> {
  const startTime = Date.now();
  let lastMessageCount = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    const conversation = await getConversation(apiUrl, conversationId);
    const messages = conversation.messages || [];
    
    for (let i = lastMessageCount; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.type === 'agent') {
        const parsed = parseMessageContent(msg);
        
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
        
        for (const text of parsed.texts) {
          const preview = text.substring(0, 150).replace(/\n/g, ' ').trim();
          if (preview) {
            yield { type: 'agent_text', data: { text: preview + (text.length > 150 ? '...' : '') } };
          }
        }
      } else if (msg.type === 'tool' || msg.type === 'user') {
        const result = parseToolResult(msg);
        if (result) {
          yield { type: 'tool_result', data: { preview: result } };
        }
      }
    }
    lastMessageCount = messages.length;
    
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
