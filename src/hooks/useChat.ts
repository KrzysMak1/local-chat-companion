import { useState, useCallback, useRef } from 'react';
import { Chat, Message, Settings, MemoryItem } from '@/types/chat';
import { getChats, saveChats, generateId, generateChatTitle } from '@/lib/storage';
import { sendMessage } from '@/lib/api';

export const useChat = (profileId: string, settings: Settings, memory: MemoryItem[]) => {
  const [chats, setChats] = useState<Chat[]>(() => getChats(profileId));
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentChat = chats.find(c => c.id === currentChatId);

  const persistChats = useCallback((newChats: Chat[]) => {
    setChats(newChats);
    saveChats(profileId, newChats);
  }, [profileId]);

  const createNewChat = useCallback(() => {
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
    setCurrentChatId(newChat.id);
    return newChat;
  }, [chats, persistChats]);

  const selectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setStreamingContent('');
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    const newChats = chats.filter(c => c.id !== chatId);
    persistChats(newChats);
    if (currentChatId === chatId) {
      setCurrentChatId(newChats[0]?.id || null);
    }
  }, [chats, currentChatId, persistChats]);

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

  const sendUserMessage = useCallback(async (content: string) => {
    let chat = currentChat;
    let newChats = [...chats];

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
      setCurrentChatId(chat.id);
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

    setIsLoading(true);
    setStreamingContent('');
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage(
        chat.messages,
        settings,
        memory,
        (content) => setStreamingContent(content),
        abortControllerRef.current
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response || streamingContent,
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
      setIsLoading(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [currentChat, chats, settings, memory, persistChats, streamingContent]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setStreamingContent('');
  }, []);

  const regenerateLastResponse = useCallback(async () => {
    if (!currentChat || currentChat.messages.length < 2) return;

    // Find last assistant message index
    let lastAssistantIndex = -1;
    for (let i = currentChat.messages.length - 1; i >= 0; i--) {
      if (currentChat.messages[i].role === 'assistant') {
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistantIndex === -1) return;

    const messagesWithoutLast = currentChat.messages.slice(0, lastAssistantIndex);
    const updatedChat = {
      ...currentChat,
      messages: messagesWithoutLast,
      updatedAt: Date.now(),
    };

    const newChats = chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    persistChats(newChats);

    setIsLoading(true);
    setStreamingContent('');
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage(
        messagesWithoutLast,
        settings,
        memory,
        (content) => setStreamingContent(content),
        abortControllerRef.current
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
      setIsLoading(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [currentChat, chats, settings, memory, persistChats]);

  const editAndResend = useCallback(async (messageId: string, newContent: string) => {
    if (!currentChat) return;

    const messageIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || currentChat.messages[messageIndex].role !== 'user') return;

    const messagesUpToEdit = currentChat.messages.slice(0, messageIndex);
    const editedMessage: Message = {
      ...currentChat.messages[messageIndex],
      content: newContent,
      timestamp: Date.now(),
    };

    const updatedChat = {
      ...currentChat,
      messages: [...messagesUpToEdit, editedMessage],
      updatedAt: Date.now(),
    };

    const newChats = chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    persistChats(newChats);

    setIsLoading(true);
    setStreamingContent('');
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage(
        updatedChat.messages,
        settings,
        memory,
        (content) => setStreamingContent(content),
        abortControllerRef.current
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
      setIsLoading(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [currentChat, chats, settings, memory, persistChats]);

  const importChat = useCallback((chatData: Chat) => {
    const newChat = {
      ...chatData,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const newChats = [newChat, ...chats];
    persistChats(newChats);
    setCurrentChatId(newChat.id);
  }, [chats, persistChats]);

  return {
    chats,
    currentChat,
    currentChatId,
    isLoading,
    streamingContent,
    createNewChat,
    selectChat,
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
