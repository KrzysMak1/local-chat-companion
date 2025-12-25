import { useState, useEffect } from 'react';
import { Settings as SettingsType, MemoryItem, Profile, AppState } from '@/types/chat';
import { 
  getSettings, 
  saveSettings, 
  getMemory, 
  saveMemory,
  getAppState,
  saveAppState,
  defaultSettings
} from '@/lib/storage';
import { useChat } from '@/hooks/useChat';
import { Sidebar } from './Sidebar';
import { ChatWindow } from './ChatWindow';
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

  const chat = useChat(profileId || '', settings, memory);

  const handleSelectProfile = (id: string) => {
    const newState = { ...appState, currentProfile: id };
    setAppState(newState);
    saveAppState(newState);
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
        chats={chat.chats}
        currentChatId={chat.currentChatId}
        onSelectChat={chat.selectChat}
        onNewChat={chat.createNewChat}
        onDeleteChat={chat.deleteChat}
        onRenameChat={chat.renameChat}
        onTogglePin={chat.togglePinChat}
        onToggleArchive={chat.toggleArchiveChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onImportChat={chat.importChat}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <ChatWindow
        chat={chat.currentChat}
        isLoading={chat.isLoading}
        streamingContent={chat.streamingContent}
        onSendMessage={chat.sendUserMessage}
        onStopGeneration={chat.stopGeneration}
        onDeleteMessage={(messageId) => 
          chat.currentChatId && chat.deleteMessage(chat.currentChatId, messageId)
        }
        onRegenerate={chat.regenerateLastResponse}
        onEditAndResend={chat.editAndResend}
        onOpenSidebar={() => setIsSidebarOpen(true)}
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
