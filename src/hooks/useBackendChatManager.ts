import { useState, useCallback, useRef, useEffect } from 'react';
import { Chat, Message, Settings, MemoryItem, ChatState } from '@/types/chat';
import { chatsApi, sendMessageToBackend } from '@/lib/backendApi';
import { generateId, generateChatTitle } from '@/lib/storage';

export const useBackendChatManager = (settings: Settings, memory: MemoryItem[]) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatStates, setChatStates] = useState<Map<string, ChatState>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Load chats from backend
  const loadChats = useCallback(async () => {
    try {
      const chatList = await chatsApi.list();
      setChats(chatList);
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  }, []);

  // Poll for updates (for multi-tab support)
  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, 3000);
    return () => clearInterval(interval);
  }, [loadChats]);

  const getChatState = useCallback((chatId: string): ChatState => {
    return chatStates.get(chatId) || { isLoading: false, streamingContent: '', abortController: null };
  }, [chatStates]);

  const updateChatState = useCallback((chatId: string, update: Partial<ChatState>) => {
    setChatStates(prev => {
      const newMap = new Map(prev);
      const current = prev.get(chatId) || { isLoading: false, streamingContent: '', abortController: null };
      newMap.set(chatId, { ...current, ...update });
      return newMap;
    });
  }, []);

  const createNewChat = useCallback(async (): Promise<Chat> => {
    const newChat = await chatsApi.create('New chat');
    setChats(prev => [newChat, ...prev]);
    return newChat;
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    
    await chatsApi.delete(chatId);
    setChats(prev => prev.filter(c => c.id !== chatId));
    
    setChatStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(chatId);
      return newMap;
    });
  }, []);

  const renameChat = useCallback(async (chatId: string, newTitle: string) => {
    await chatsApi.update(chatId, { title: newTitle });
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, title: newTitle, updatedAt: Date.now() } : c
    ));
  }, []);

  const togglePinChat = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    await chatsApi.update(chatId, { pinned: !chat.pinned });
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c
    ));
  }, [chats]);

  const toggleArchiveChat = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    await chatsApi.update(chatId, { archived: !chat.archived });
    setChats(prev => prev.map(c => 
      c.id === chatId ? { ...c, archived: !c.archived, updatedAt: Date.now() } : c
    ));
  }, [chats]);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => {
    await chatsApi.deleteMessage(chatId, messageId);
    setChats(prev => prev.map(c => 
      c.id === chatId 
        ? { ...c, messages: c.messages.filter(m => m.id !== messageId), updatedAt: Date.now() }
        : c
    ));
  }, []);

  const loadChatMessages = useCallback(async (chatId: string) => {
    try {
      const chat = await chatsApi.get(chatId);
      setChats(prev => prev.map(c => 
        c.id === chatId ? chat : c
      ));
      return chat;
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      return null;
    }
  }, []);

  const sendUserMessage = useCallback(async (chatId: string | null, content: string, imageDataUrl?: string): Promise<string> => {
    let targetChatId = chatId;
    
    // Create new chat if needed
    if (!chatId) {
      const newChat = await createNewChat();
      targetChatId = newChat.id;
    }

    // Optimistically add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: imageDataUrl ? [
        { type: 'text', text: content },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ] : content,
      timestamp: Date.now(),
      image_url: imageDataUrl,
    };

    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const newTitle = c.messages.length === 0 && c.title === 'New chat' 
          ? generateChatTitle(content) 
          : c.title;
        return {
          ...c,
          title: newTitle,
          messages: [...c.messages, userMessage],
          updatedAt: Date.now(),
        };
      }
      return c;
    }));

    // Set up loading state
    const abortController = new AbortController();
    abortControllersRef.current.set(targetChatId!, abortController);
    updateChatState(targetChatId!, { isLoading: true, streamingContent: '' });

    try {
      const response = await sendMessageToBackend({
        chatId: targetChatId!,
        content,
        imageDataUrl,
        settings,
        onStream: (streamContent) => updateChatState(targetChatId!, { streamingContent: streamContent }),
        abortController,
      });

      // Add assistant message
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setChats(prev => prev.map(c => 
        c.id === targetChatId 
          ? { ...c, messages: [...c.messages, assistantMessage], updatedAt: Date.now() }
          : c
      ));
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      updateChatState(targetChatId!, { isLoading: false, streamingContent: '' });
      abortControllersRef.current.delete(targetChatId!);
    }

    return targetChatId!;
  }, [settings, createNewChat, updateChatState]);

  const stopGeneration = useCallback((chatId: string) => {
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    updateChatState(chatId, { isLoading: false, streamingContent: '' });
  }, [updateChatState]);

  const regenerateLastResponse = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || chat.messages.length < 2) return;

    // Find last assistant message
    let lastAssistantIndex = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistantIndex === -1) return;

    // Remove last assistant message
    const lastAssistantMsg = chat.messages[lastAssistantIndex];
    await chatsApi.deleteMessage(chatId, lastAssistantMsg.id);

    // Get last user message
    let lastUserIndex = -1;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const lastUserMsg = chat.messages[lastUserIndex];
    const content = typeof lastUserMsg.content === 'string' 
      ? lastUserMsg.content 
      : lastUserMsg.content.find(c => c.type === 'text')?.text || '';

    // Update local state
    setChats(prev => prev.map(c => 
      c.id === chatId 
        ? { ...c, messages: c.messages.slice(0, lastAssistantIndex), updatedAt: Date.now() }
        : c
    ));

    // Re-send with same content
    const abortController = new AbortController();
    abortControllersRef.current.set(chatId, abortController);
    updateChatState(chatId, { isLoading: true, streamingContent: '' });

    try {
      const response = await sendMessageToBackend({
        chatId,
        content,
        imageDataUrl: lastUserMsg.image_url,
        settings,
        onStream: (streamContent) => updateChatState(chatId, { streamingContent: streamContent }),
        abortController,
      });

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setChats(prev => prev.map(c => 
        c.id === chatId 
          ? { ...c, messages: [...c.messages.slice(0, lastAssistantIndex), assistantMessage], updatedAt: Date.now() }
          : c
      ));
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      updateChatState(chatId, { isLoading: false, streamingContent: '' });
      abortControllersRef.current.delete(chatId);
    }
  }, [chats, settings, updateChatState]);

  const editAndResend = useCallback(async (chatId: string, messageId: string, newContent: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || chat.messages[messageIndex].role !== 'user') return;

    // Delete all messages from this point
    const messagesToDelete = chat.messages.slice(messageIndex);
    for (const msg of messagesToDelete) {
      await chatsApi.deleteMessage(chatId, msg.id);
    }

    // Update local state
    const messagesUpToEdit = chat.messages.slice(0, messageIndex);
    setChats(prev => prev.map(c => 
      c.id === chatId 
        ? { ...c, messages: messagesUpToEdit, updatedAt: Date.now() }
        : c
    ));

    // Send new message
    await sendUserMessage(chatId, newContent);
  }, [chats, sendUserMessage]);

  const importChat = useCallback(async (chatData: Chat): Promise<string> => {
    const newChat = await chatsApi.create(chatData.title);
    // Note: importing messages would require backend support
    setChats(prev => [newChat, ...prev]);
    return newChat.id;
  }, []);

  const getChat = useCallback((chatId: string): Chat | undefined => {
    return chats.find(c => c.id === chatId);
  }, [chats]);

  return {
    chats,
    getChat,
    getChatState,
    createNewChat,
    deleteChat,
    renameChat,
    togglePinChat,
    toggleArchiveChat,
    deleteMessage,
    sendUserMessage,
    stopGeneration,
    regenerateLastResponse,
    editAndResend,
    importChat,
    loadChats,
    loadChatMessages,
  };
};
