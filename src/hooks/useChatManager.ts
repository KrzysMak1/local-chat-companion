import { useState, useCallback, useRef } from 'react';
import { Chat, Message, Settings, MemoryItem, ChatState } from '@/types/chat';
import { getChats, saveChats, generateId, generateChatTitle } from '@/lib/storage';
import { sendMessage } from '@/lib/api';

export const useChatManager = (profileId: string, settings: Settings, memory: MemoryItem[]) => {
  const [chats, setChats] = useState<Chat[]>(() => getChats(profileId));
  // Per-chat state: isLoading, streamingContent, abortController
  const [chatStates, setChatStates] = useState<Map<string, ChatState>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

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

  const persistChats = useCallback((newChats: Chat[]) => {
    setChats(newChats);
    saveChats(profileId, newChats);
  }, [profileId]);

  const createNewChat = useCallback((): Chat => {
    const newChat: Chat = {
      id: generateId(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
    };
    const newChats = [newChat, ...chats];
    persistChats(newChats);
    return newChat;
  }, [chats, persistChats]);

  const deleteChat = useCallback((chatId: string) => {
    // Stop any ongoing generation
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    
    const newChats = chats.filter(c => c.id !== chatId);
    persistChats(newChats);
    
    // Clean up state
    setChatStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(chatId);
      return newMap;
    });
  }, [chats, persistChats]);

  const renameChat = useCallback((chatId: string, newTitle: string) => {
    const newChats = chats.map(c => 
      c.id === chatId ? { ...c, title: newTitle, updatedAt: Date.now() } : c
    );
    persistChats(newChats);
  }, [chats, persistChats]);

  const togglePinChat = useCallback((chatId: string) => {
    const newChats = chats.map(c => 
      c.id === chatId ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c
    );
    persistChats(newChats);
  }, [chats, persistChats]);

  const toggleArchiveChat = useCallback((chatId: string) => {
    const newChats = chats.map(c => 
      c.id === chatId ? { ...c, archived: !c.archived, updatedAt: Date.now() } : c
    );
    persistChats(newChats);
  }, [chats, persistChats]);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    const newChats = chats.map(c => 
      c.id === chatId 
        ? { ...c, messages: c.messages.filter(m => m.id !== messageId), updatedAt: Date.now() }
        : c
    );
    persistChats(newChats);
  }, [chats, persistChats]);

  const sendUserMessage = useCallback(async (chatId: string | null, content: string): Promise<string> => {
    let chat = chatId ? chats.find(c => c.id === chatId) : null;
    let newChats = [...chats];
    let targetChatId = chatId;

    if (!chat) {
      chat = {
        id: generateId(),
        title: generateChatTitle(content),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
      };
      newChats = [chat, ...newChats];
      targetChatId = chat.id;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Update chat title if it's a new chat
    if (chat.messages.length === 0 && chat.title === 'New chat') {
      chat = { ...chat, title: generateChatTitle(content) };
    }

    chat = {
      ...chat,
      messages: [...chat.messages, userMessage],
      updatedAt: Date.now(),
    };

    newChats = newChats.map(c => c.id === chat!.id ? chat! : c);
    persistChats(newChats);

    // Set up per-chat loading state
    const abortController = new AbortController();
    abortControllersRef.current.set(targetChatId!, abortController);
    updateChatState(targetChatId!, { isLoading: true, streamingContent: '' });

    try {
      const response = await sendMessage(
        chat.messages,
        settings,
        memory,
        (content) => updateChatState(targetChatId!, { streamingContent: content }),
        abortController
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const finalChat = {
        ...chat,
        messages: [...chat.messages, assistantMessage],
        updatedAt: Date.now(),
      };

      const finalChats = newChats.map(c => c.id === finalChat.id ? finalChat : c);
      persistChats(finalChats);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      updateChatState(targetChatId!, { isLoading: false, streamingContent: '' });
      abortControllersRef.current.delete(targetChatId!);
    }

    return targetChatId!;
  }, [chats, settings, memory, persistChats, updateChatState]);

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

    // Find last assistant message index
    let lastAssistantIndex = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistantIndex === -1) return;

    const messagesWithoutLast = chat.messages.slice(0, lastAssistantIndex);
    const updatedChat = {
      ...chat,
      messages: messagesWithoutLast,
      updatedAt: Date.now(),
    };

    const newChats = chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    persistChats(newChats);

    const abortController = new AbortController();
    abortControllersRef.current.set(chatId, abortController);
    updateChatState(chatId, { isLoading: true, streamingContent: '' });

    try {
      const response = await sendMessage(
        messagesWithoutLast,
        settings,
        memory,
        (content) => updateChatState(chatId, { streamingContent: content }),
        abortController
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const finalChat = {
        ...updatedChat,
        messages: [...messagesWithoutLast, assistantMessage],
        updatedAt: Date.now(),
      };

      const finalChats = newChats.map(c => c.id === finalChat.id ? finalChat : c);
      persistChats(finalChats);
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      updateChatState(chatId, { isLoading: false, streamingContent: '' });
      abortControllersRef.current.delete(chatId);
    }
  }, [chats, settings, memory, persistChats, updateChatState]);

  const editAndResend = useCallback(async (chatId: string, messageId: string, newContent: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || chat.messages[messageIndex].role !== 'user') return;

    const messagesUpToEdit = chat.messages.slice(0, messageIndex);
    const editedMessage: Message = {
      ...chat.messages[messageIndex],
      content: newContent,
      timestamp: Date.now(),
    };

    const updatedChat = {
      ...chat,
      messages: [...messagesUpToEdit, editedMessage],
      updatedAt: Date.now(),
    };

    const newChats = chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    persistChats(newChats);

    const abortController = new AbortController();
    abortControllersRef.current.set(chatId, abortController);
    updateChatState(chatId, { isLoading: true, streamingContent: '' });

    try {
      const response = await sendMessage(
        updatedChat.messages,
        settings,
        memory,
        (content) => updateChatState(chatId, { streamingContent: content }),
        abortController
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const finalChat = {
        ...updatedChat,
        messages: [...updatedChat.messages, assistantMessage],
        updatedAt: Date.now(),
      };

      const finalChats = newChats.map(c => c.id === finalChat.id ? finalChat : c);
      persistChats(finalChats);
    } catch (error) {
      console.error('Error editing and resending:', error);
    } finally {
      updateChatState(chatId, { isLoading: false, streamingContent: '' });
      abortControllersRef.current.delete(chatId);
    }
  }, [chats, settings, memory, persistChats, updateChatState]);

  const importChat = useCallback((chatData: Chat): string => {
    const newChat = {
      ...chatData,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const newChats = [newChat, ...chats];
    persistChats(newChats);
    return newChat.id;
  }, [chats, persistChats]);

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
  };
};
