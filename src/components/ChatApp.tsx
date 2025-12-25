import { useState, useEffect } from 'react';
import { Settings as SettingsType, MemoryItem, Profile, AppState, SplitViewState } from '@/types/chat';
import { 
  getSettings, 
  saveSettings, 
  getMemory, 
  saveMemory,
  getAppState,
  saveAppState,
  defaultSettings
} from '@/lib/storage';
import { useChatManager } from '@/hooks/useChatManager';
import { Sidebar } from './Sidebar';
import { SplitChatView } from './SplitChatView';
import { SettingsModal } from './SettingsModal';
import { MemoryModal } from './MemoryModal';
import { ProfileSelector } from './ProfileSelector';

export const ChatApp = () => {
  const [appState, setAppState] = useState<AppState>(getAppState);
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

  const profileId = appState.currentProfile;

  // Initialize theme
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Load profile data
  useEffect(() => {
    if (profileId) {
      const loadedSettings = getSettings(profileId);
      setSettings(loadedSettings);
      setMemory(getMemory(profileId));
      document.documentElement.classList.toggle('dark', loadedSettings.theme === 'dark');
    }
  }, [profileId]);

  const chatManager = useChatManager(profileId || '', settings, memory);

  const handleSelectProfile = (id: string) => {
    const newState = { ...appState, currentProfile: id };
    setAppState(newState);
    saveAppState(newState);
    // Reset split state when changing profile
    setSplitState({ enabled: false, leftChatId: null, rightChatId: null });
  };

  const handleCreateProfile = (profile: Profile) => {
    const newState = {
      profiles: [...appState.profiles, profile],
      currentProfile: profile.id,
    };
    setAppState(newState);
    saveAppState(newState);
  };

  const handleDeleteProfile = (id: string) => {
    const newState = {
      ...appState,
      profiles: appState.profiles.filter(p => p.id !== id),
      currentProfile: appState.currentProfile === id ? null : appState.currentProfile,
    };
    setAppState(newState);
    saveAppState(newState);
    // Clean up localStorage for deleted profile
    Object.keys(localStorage).forEach(key => {
      if (key.includes(id)) {
        localStorage.removeItem(key);
      }
    });
  };

  const handleSaveSettings = (newSettings: SettingsType) => {
    if (profileId) {
      setSettings(newSettings);
      saveSettings(profileId, newSettings);
      document.documentElement.classList.toggle('dark', newSettings.theme === 'dark');
    }
  };

  const handleSaveMemory = (newMemory: MemoryItem[]) => {
    if (profileId) {
      setMemory(newMemory);
      saveMemory(profileId, newMemory);
    }
  };

  const handleLogout = () => {
    const newState = { ...appState, currentProfile: null };
    setAppState(newState);
    saveAppState(newState);
    setSplitState({ enabled: false, leftChatId: null, rightChatId: null });
  };

  const handleSelectChat = (chatId: string) => {
    setSplitState(prev => ({ ...prev, leftChatId: chatId }));
    setIsSidebarOpen(false);
  };

  const handleNewChat = () => {
    const newChat = chatManager.createNewChat();
    setSplitState(prev => ({ ...prev, leftChatId: newChat.id }));
    setIsSidebarOpen(false);
  };

  const handleDeleteChat = (chatId: string) => {
    chatManager.deleteChat(chatId);
    // Update split state if deleted chat was open
    setSplitState(prev => ({
      ...prev,
      leftChatId: prev.leftChatId === chatId ? null : prev.leftChatId,
      rightChatId: prev.rightChatId === chatId ? null : prev.rightChatId,
    }));
  };

  // Show profile selector if no profile selected
  if (!profileId) {
    return (
      <ProfileSelector
        profiles={appState.profiles}
        onSelectProfile={handleSelectProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
      />
    );
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
        onImportChat={(chat) => {
          const newChatId = chatManager.importChat(chat);
          setSplitState(prev => ({ ...prev, leftChatId: newChatId }));
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
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
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        profileId={profileId}
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
