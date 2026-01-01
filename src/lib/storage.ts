import { Chat, MemoryItem, Settings, Profile, AppState } from '@/types/chat';

const getStorageKey = (profileId: string, key: string) => `chatgpt_clone_${profileId}_${key}`;

export const defaultSettings: Settings = {
  systemPrompt: 'You are a helpful AI assistant.',
  temperature: 0.7,
  maxTokens: 2048,
  streamingEnabled: true,
  baseUrl: 'http://127.0.0.1:8081',
  backendUrl: 'http://localhost:8000',
  useMemory: true,
  theme: 'dark',
};

// App State (profiles)
export const getAppState = (): AppState => {
  const stored = localStorage.getItem('chatgpt_clone_app_state');
  return stored ? JSON.parse(stored) : { currentProfile: null, profiles: [] };
};

export const saveAppState = (state: AppState): void => {
  localStorage.setItem('chatgpt_clone_app_state', JSON.stringify(state));
};

// Chats
export const getChats = (profileId: string): Chat[] => {
  const stored = localStorage.getItem(getStorageKey(profileId, 'chats'));
  return stored ? JSON.parse(stored) : [];
};

export const saveChats = (profileId: string, chats: Chat[]): void => {
  localStorage.setItem(getStorageKey(profileId, 'chats'), JSON.stringify(chats));
};

// Settings
export const getSettings = (profileId: string): Settings => {
  const stored = localStorage.getItem(getStorageKey(profileId, 'settings'));
  return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
};

export const saveSettings = (profileId: string, settings: Settings): void => {
  localStorage.setItem(getStorageKey(profileId, 'settings'), JSON.stringify(settings));
};

// Memory
export const getMemory = (profileId: string): MemoryItem[] => {
  const stored = localStorage.getItem(getStorageKey(profileId, 'memory'));
  return stored ? JSON.parse(stored) : [];
};

export const saveMemory = (profileId: string, memory: MemoryItem[]): void => {
  localStorage.setItem(getStorageKey(profileId, 'memory'), JSON.stringify(memory));
};

// Export/Import
export const exportAllData = (profileId: string) => {
  return {
    chats: getChats(profileId),
    settings: getSettings(profileId),
    memory: getMemory(profileId),
    exportedAt: Date.now(),
  };
};

export const importAllData = (profileId: string, data: ReturnType<typeof exportAllData>) => {
  if (data.chats) saveChats(profileId, data.chats);
  if (data.settings) saveSettings(profileId, data.settings);
  if (data.memory) saveMemory(profileId, data.memory);
};

export const exportChat = (chat: Chat) => {
  return {
    ...chat,
    exportedAt: Date.now(),
  };
};

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const generateChatTitle = (firstMessage: string): string => {
  const cleaned = firstMessage.trim().slice(0, 50);
  return cleaned.length < firstMessage.trim().length ? cleaned + '...' : cleaned;
};
