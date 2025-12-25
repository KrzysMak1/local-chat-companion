import { Message, Settings, MemoryItem } from '@/types/chat';

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export const checkHealth = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};

const buildSystemPrompt = (settings: Settings, memory: MemoryItem[]): string => {
  let systemPrompt = settings.systemPrompt;
  
  if (settings.useMemory && memory.length > 0) {
    const memorySection = memory.map(m => `- ${m.content}`).join('\n');
    systemPrompt = `${systemPrompt}\n\nMEMORY (facts about the user):\n${memorySection}`;
  }
  
  return systemPrompt;
};

export const sendMessage = async (
  messages: Message[],
  settings: Settings,
  memory: MemoryItem[],
  onStream?: (content: string) => void,
  abortController?: AbortController
): Promise<string> => {
  const systemPrompt = buildSystemPrompt(settings, memory);
  
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const body = {
    model: 'local',
    messages: apiMessages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.streamingEnabled,
  };

  try {
    const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (settings.streamingEnabled && response.body) {
      return await handleStreamingResponse(response, onStream);
    } else {
      const data: ChatCompletionResponse = await response.json();
      return data.choices[0]?.message?.content || '';
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request cancelled');
    }
    throw error;
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
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              onStream?.(fullContent);
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
