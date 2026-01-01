import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsType, MemoryItem, User, SplitViewState } from '@/types/chat';
import { 
  getSettings, 
  saveSettings, 
  getMemory, 
  saveMemory,
  defaultSettings
} from '@/lib/storage';
import { authApi } from '@/lib/backendApi';
import { useBackendChatManager } from '@/hooks/useBackendChatManager';
import { AuthScreen } from './AuthScreen';
import { Sidebar } from './Sidebar';
import { SplitChatView } from './SplitChatView';
import { SettingsModal } from './SettingsModal';
import { MemoryModal } from './MemoryModal';
import { Loader2 } from 'lucide-react';

export const ChatApp = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsType>(defaultSettings);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [splitState, setSplitState] = useState<SplitViewState>({
    enabled: false,
    leftChatId: null,
    rightChatId: null,
  });

  // Initialize theme
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await authApi.getMe();
        setUser(currentUser);
        if (currentUser) {
          // Load user settings from localStorage (keyed by user id)
          const loadedSettings = getSettings(currentUser.id);
          setSettings(loadedSettings);
          setMemory(getMemory(currentUser.id));
          document.documentElement.classList.toggle('dark', loadedSettings.theme === 'dark');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const chatManager = useBackendChatManager(settings, memory);

  const handleAuthSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    const loadedSettings = getSettings(loggedInUser.id);
    setSettings(loadedSettings);
    setMemory(getMemory(loggedInUser.id));
    document.documentElement.classList.toggle('dark', loadedSettings.theme === 'dark');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    setSplitState({ enabled: false, leftChatId: null, rightChatId: null });
  }, []);

  const handleSaveSettings = (newSettings: SettingsType) => {
    if (user) {
      setSettings(newSettings);
      saveSettings(user.id, newSettings);
      // Also save backend URL to localStorage for API calls
      localStorage.setItem('backend_url', newSettings.backendUrl);
      document.documentElement.classList.toggle('dark', newSettings.theme === 'dark');
    }
  };

  const handleSaveMemory = (newMemory: MemoryItem[]) => {
    if (user) {
      setMemory(newMemory);
      saveMemory(user.id, newMemory);
    }
  };

  const handleSelectChat = async (chatId: string) => {
    // Load full chat with messages
    await chatManager.loadChatMessages(chatId);
    setSplitState(prev => ({ ...prev, leftChatId: chatId }));
    setIsSidebarOpen(false);
  };

  const handleNewChat = async () => {
    const newChat = await chatManager.createNewChat();
    setSplitState(prev => ({ ...prev, leftChatId: newChat.id }));
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = async (chatId: string) => {
    await chatManager.deleteChat(chatId);
    setSplitState(prev => ({
      ...prev,
      leftChatId: prev.leftChatId === chatId ? null : prev.leftChatId,
      rightChatId: prev.rightChatId === chatId ? null : prev.rightChatId,
    }));
  };

  // Show loading spinner while checking auth
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        chats={chatManager.chats}
        currentChatId={splitState.leftChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={chatManager.renameChat}
        onTogglePin={chatManager.togglePinChat}
        onToggleArchive={chatManager.toggleArchiveChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onImportChat={async (chat) => {
          const newChatId = await chatManager.importChat(chat);
          setSplitState(prev => ({ ...prev, leftChatId: newChatId }));
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onLogout={handleLogout}
        username={user.username}
      />

      <SplitChatView
        chats={chatManager.chats}
        splitState={splitState}
        getChatState={chatManager.getChatState}
        onSendMessage={chatManager.sendUserMessage}
        onStopGeneration={chatManager.stopGeneration}
        onDeleteMessage={chatManager.deleteMessage}
        onRegenerate={chatManager.regenerateLastResponse}
        onEditAndResend={chatManager.editAndResend}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onCreateNewChat={chatManager.createNewChat}
        onUpdateSplitState={setSplitState}
        onLoadChat={chatManager.loadChatMessages}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        profileId={user.id}
      />

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memory={memory}
        onSaveMemory={handleSaveMemory}
        useMemory={settings.useMemory}
      />
    </div>
  );
};
