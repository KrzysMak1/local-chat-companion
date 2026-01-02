import { useState, useMemo } from 'react';
import { Chat } from '@/types/chat';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  Trash2, 
  Pin, 
  PinOff, 
  Archive, 
  ArchiveRestore,
  Edit3,
  Settings,
  Download,
  Upload,
  MoreHorizontal,
  BookOpen,
  X,
  LogOut,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { exportChat } from '@/lib/storage';

interface SidebarProps {
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onTogglePin: (chatId: string) => void;
  onToggleArchive: (chatId: string) => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  onImportChat: (chat: Chat) => void;
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
  username?: string;
}

const groupChatsByDate = (chats: Chat[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 7 * 86400000;

  const groups: { [key: string]: Chat[] } = {
    pinned: [],
    today: [],
    yesterday: [],
    lastWeek: [],
    older: [],
    archived: [],
  };

  chats.forEach(chat => {
    if (chat.archived) {
      groups.archived.push(chat);
    } else if (chat.pinned) {
      groups.pinned.push(chat);
    } else if (chat.updatedAt >= today) {
      groups.today.push(chat);
    } else if (chat.updatedAt >= yesterday) {
      groups.yesterday.push(chat);
    } else if (chat.updatedAt >= lastWeek) {
      groups.lastWeek.push(chat);
    } else {
      groups.older.push(chat);
    }
  });

  return groups;
};

export const Sidebar = ({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onTogglePin,
  onToggleArchive,
  onOpenSettings,
  onOpenMemory,
  onImportChat,
  isOpen,
  onClose,
  onLogout,
  username,
}: SidebarProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter(chat => 
      chat.title.toLowerCase().includes(query) ||
      chat.messages.some(m => {
        const content = typeof m.content === 'string' ? m.content : 
          m.content.find(c => c.type === 'text')?.text || '';
        return content.toLowerCase().includes(query);
      })
    );
  }, [chats, searchQuery]);

  const groupedChats = useMemo(() => groupChatsByDate(filteredChats), [filteredChats]);

  const handleStartEdit = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveEdit = () => {
    if (editingChatId && editTitle.trim()) {
      onRenameChat(editingChatId, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleExportChat = (chat: Chat) => {
    const data = exportChat(chat);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${chat.title.slice(0, 20)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportChat = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.messages && Array.isArray(data.messages)) {
          onImportChat(data as Chat);
        }
      } catch (error) {
        console.error('Error importing chat:', error);
      }
    };
    input.click();
  };

  const renderChatGroup = (title: string, chats: Chat[]) => {
    if (chats.length === 0) return null;

    return (
      <div className="mb-4">
        <h3 className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <div className="space-y-1">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                currentChatId === chat.id 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "hover:bg-sidebar-accent/50"
              )}
              onClick={() => onSelectChat(chat.id)}
            >
              <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
              
              {editingChatId === chat.id ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setEditingChatId(null);
                  }}
                  className="h-6 text-sm bg-transparent"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate text-sm">{chat.title}</span>
              )}

              {chat.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => handleStartEdit(chat)}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTogglePin(chat.id)}>
                    {chat.pinned ? (
                      <>
                        <PinOff className="w-4 h-4 mr-2" />
                        Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="w-4 h-4 mr-2" />
                        Pin
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleArchive(chat.id)}>
                    {chat.archived ? (
                      <>
                        <ArchiveRestore className="w-4 h-4 mr-2" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportChat(chat)}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDeleteChat(chat.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <aside 
        className={cn(
          "fixed md:relative z-50 md:z-auto h-full w-72 bg-sidebar-background border-r border-sidebar-border flex flex-col transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-sidebar-foreground">ChatGPT</h1>
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          <Button 
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-accent-foreground"
          >
            <Plus className="w-4 h-4" />
            New chat
          </Button>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-sidebar-accent border-sidebar-border"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2">
          {renderChatGroup('Pinned', groupedChats.pinned)}
          {renderChatGroup('Today', groupedChats.today)}
          {renderChatGroup('Yesterday', groupedChats.yesterday)}
          {renderChatGroup('Previous 7 Days', groupedChats.lastWeek)}
          {renderChatGroup('Older', groupedChats.older)}
          {renderChatGroup('Archived', groupedChats.archived)}
          
          {filteredChats.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {searchQuery ? 'No chats found' : 'No chats yet'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onOpenMemory}
          >
            <BookOpen className="w-4 h-4" />
            Memory
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleImportChat}
          >
            <Upload className="w-4 h-4" />
            Import chat
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onOpenSettings}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
          
          {/* User section with logout */}
          {username && (
            <div className="pt-2 mt-2 border-t border-sidebar-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <User className="w-4 h-4" />
                    <span className="truncate flex-1 text-left">{username}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    <User className="w-4 h-4 mr-2" />
                    {username}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={onLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
