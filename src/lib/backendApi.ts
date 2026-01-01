import { User, Chat, Message, Settings } from '@/types/chat';

const getBackendUrl = () => {
  return localStorage.getItem('backend_url') || 'http://localhost:8000';
};

// Auth API
export const authApi = {
  async register(username: string, password: string): Promise<User> {
    const response = await fetch(`${getBackendUrl()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }
    
    return response.json();
  },

  async login(username: string, password: string): Promise<User> {
    const response = await fetch(`${getBackendUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }
    
    return response.json();
  },

  async logout(): Promise<void> {
    await fetch(`${getBackendUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  async getMe(): Promise<User | null> {
    try {
      const response = await fetch(`${getBackendUrl()}/auth/me`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        return null;
      }
      
      return response.json();
    } catch {
      return null;
    }
  },
};

// Chats API
export const chatsApi = {
  async list(): Promise<Chat[]> {
    const response = await fetch(`${getBackendUrl()}/chats`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch chats');
    }
    
    const data = await response.json();
    // Transform backend format to frontend format
    return data.map((c: any) => ({
      id: c.id,
      title: c.title,
      messages: [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      pinned: c.pinned,
      archived: c.archived,
    }));
  },

  async get(chatId: string): Promise<Chat> {
    const response = await fetch(`${getBackendUrl()}/chats/${chatId}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch chat');
    }
    
    const data = await response.json();
    return {
      id: data.id,
      title: data.title,
      messages: data.messages || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    };
  },

  async create(title: string = 'New chat'): Promise<Chat> {
    const response = await fetch(`${getBackendUrl()}/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create chat');
    }
    
    const data = await response.json();
    return {
      id: data.id,
      title: data.title,
      messages: [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      pinned: data.pinned,
      archived: data.archived,
    };
  },

  async update(chatId: string, updates: { title?: string; pinned?: boolean; archived?: boolean }): Promise<void> {
    const response = await fetch(`${getBackendUrl()}/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update chat');
    }
  },

  async delete(chatId: string): Promise<void> {
    const response = await fetch(`${getBackendUrl()}/chats/${chatId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete chat');
    }
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const response = await fetch(`${getBackendUrl()}/chats/${chatId}/messages/${messageId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete message');
    }
  },
};

// Message sending with streaming
export interface SendMessageOptions {
  chatId: string;
  content: string;
  imageDataUrl?: string;
  settings: Settings;
  onStream?: (content: string) => void;
  abortController?: AbortController;
}

export const sendMessageToBackend = async ({
  chatId,
  content,
  imageDataUrl,
  settings,
  onStream,
  abortController,
}: SendMessageOptions): Promise<string> => {
  // Build content array if image is present
  let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = content;
  
  if (imageDataUrl) {
    messageContent = [
      { type: 'text', text: content || 'Describe this image.' },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ];
  }

  const response = await fetch(`${getBackendUrl()}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Settings': JSON.stringify({
        system_prompt: settings.systemPrompt,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        streaming: settings.streamingEnabled,
      }),
    },
    credentials: 'include',
    body: JSON.stringify({
      content: messageContent,
      analyze_image: !!imageDataUrl,
    }),
    signal: abortController?.signal,
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  if (settings.streamingEnabled && response.body) {
    return handleStreamingResponse(response, onStream);
  } else {
    const data = await response.json();
    return data.message?.content || '';
  }
};

const handleStreamingResponse = async (
  response: Response,
  onStream?: (content: string) => void
): Promise<string> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              onStream?.(fullContent);
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
};

// Health check
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getBackendUrl()}/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};

export const checkLlamaHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getBackendUrl()}/api/llama/health`, {
      credentials: 'include',
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};
