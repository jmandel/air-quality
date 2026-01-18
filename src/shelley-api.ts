/**
 * Shelley API client for air quality analysis
 * Based on shelley-power-toys implementation
 */

const SHELLEY_API = process.env.SHELLEY_API || 'http://localhost:9999/api';
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
export async function* streamConversation(
  conversationId: string,
  timeoutMs: number = 180000
): AsyncGenerator<{ type: string; data: any }> {
  const startTime = Date.now();
  let lastMessageCount = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    const conversation = await getConversation(conversationId);
    const messages = conversation.messages || [];
    
    // Yield new messages
    for (let i = lastMessageCount; i < messages.length; i++) {
      const msg = messages[i];
      yield { type: 'message', data: msg };
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
    
    yield { type: 'progress', data: { elapsed: Date.now() - startTime, working: conversation.agent_working } };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Timeout waiting for Shelley response');
}
