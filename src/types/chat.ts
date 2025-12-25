export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
}

export interface ChatState {
  isLoading: boolean;
  streamingContent: string;
  abortController: AbortController | null;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
}

export interface Settings {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  streamingEnabled: boolean;
  baseUrl: string;
  useMemory: boolean;
  theme: 'light' | 'dark';
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
}

export interface AppState {
  currentProfile: string | null;
  profiles: Profile[];
}

export interface SplitViewState {
  enabled: boolean;
  leftChatId: string | null;
  rightChatId: string | null;
}
