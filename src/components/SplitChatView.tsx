import { useState } from 'react';
import { Chat, ChatState, SplitViewState } from '@/types/chat';
import { ChatPanel } from './ChatPanel';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SplitChatViewProps {
  chats: Chat[];
  splitState: SplitViewState;
  getChatState: (chatId: string) => ChatState;
  onSendMessage: (chatId: string | null, content: string) => Promise<string>;
  onStopGeneration: (chatId: string) => void;
  onDeleteMessage: (chatId: string, messageId: string) => void;
  onRegenerate: (chatId: string) => void;
  onEditAndResend: (chatId: string, messageId: string, newContent: string) => void;
  onOpenSidebar: () => void;
  onCreateNewChat: () => Chat;
  onUpdateSplitState: (state: SplitViewState) => void;
}

export const SplitChatView = ({
  chats,
  splitState,
  getChatState,
  onSendMessage,
  onStopGeneration,
  onDeleteMessage,
  onRegenerate,
  onEditAndResend,
  onOpenSidebar,
  onCreateNewChat,
  onUpdateSplitState,
}: SplitChatViewProps) => {
  const leftChat = splitState.leftChatId ? chats.find(c => c.id === splitState.leftChatId) : undefined;
  const rightChat = splitState.rightChatId ? chats.find(c => c.id === splitState.rightChatId) : undefined;
  
  const leftChatState = splitState.leftChatId 
    ? getChatState(splitState.leftChatId) 
    : { isLoading: false, streamingContent: '', abortController: null };
  
  const rightChatState = splitState.rightChatId 
    ? getChatState(splitState.rightChatId) 
    : { isLoading: false, streamingContent: '', abortController: null };

  const handleLeftSend = async (content: string) => {
    const chatId = await onSendMessage(splitState.leftChatId, content);
    if (!splitState.leftChatId) {
      onUpdateSplitState({ ...splitState, leftChatId: chatId });
    }
  };

  const handleRightSend = async (content: string) => {
    const chatId = await onSendMessage(splitState.rightChatId, content);
    if (!splitState.rightChatId) {
      onUpdateSplitState({ ...splitState, rightChatId: chatId });
    }
  };

  const handleOpenSplitView = () => {
    if (!splitState.enabled) {
      // Enable split view with empty right panel
      onUpdateSplitState({ ...splitState, enabled: true });
    }
  };

  const handleCloseSplitView = () => {
    onUpdateSplitState({ ...splitState, enabled: false, rightChatId: null });
  };

  const handleSelectRightChat = (chatId: string) => {
    onUpdateSplitState({ ...splitState, rightChatId: chatId });
  };

  const handleCreateNewRightChat = () => {
    const newChat = onCreateNewChat();
    onUpdateSplitState({ ...splitState, rightChatId: newChat.id });
  };

  // Single panel mode
  if (!splitState.enabled) {
    return (
      <ChatPanel
        chat={leftChat}
        chatState={leftChatState}
        onSendMessage={handleLeftSend}
        onStopGeneration={() => splitState.leftChatId && onStopGeneration(splitState.leftChatId)}
        onDeleteMessage={(messageId) => splitState.leftChatId && onDeleteMessage(splitState.leftChatId, messageId)}
        onRegenerate={() => splitState.leftChatId && onRegenerate(splitState.leftChatId)}
        onEditAndResend={(messageId, content) => 
          splitState.leftChatId && onEditAndResend(splitState.leftChatId, messageId, content)
        }
        onOpenSidebar={onOpenSidebar}
        onSplitView={handleOpenSplitView}
        showSplitButton={true}
      />
    );
  }

  // Split view mode
  return (
    <div className="flex-1 flex h-full">
      {/* Left panel */}
      <div className="flex-1 border-r border-border">
        <ChatPanel
          chat={leftChat}
          chatState={leftChatState}
          onSendMessage={handleLeftSend}
          onStopGeneration={() => splitState.leftChatId && onStopGeneration(splitState.leftChatId)}
          onDeleteMessage={(messageId) => splitState.leftChatId && onDeleteMessage(splitState.leftChatId, messageId)}
          onRegenerate={() => splitState.leftChatId && onRegenerate(splitState.leftChatId)}
          onEditAndResend={(messageId, content) => 
            splitState.leftChatId && onEditAndResend(splitState.leftChatId, messageId, content)
          }
          onOpenSidebar={onOpenSidebar}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col">
        {rightChat ? (
          <ChatPanel
            chat={rightChat}
            chatState={rightChatState}
            onSendMessage={handleRightSend}
            onStopGeneration={() => splitState.rightChatId && onStopGeneration(splitState.rightChatId)}
            onDeleteMessage={(messageId) => splitState.rightChatId && onDeleteMessage(splitState.rightChatId, messageId)}
            onRegenerate={() => splitState.rightChatId && onRegenerate(splitState.rightChatId)}
            onEditAndResend={(messageId, content) => 
              splitState.rightChatId && onEditAndResend(splitState.rightChatId, messageId, content)
            }
            onClose={handleCloseSplitView}
            isSecondary={true}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background">
            <h3 className="text-lg font-medium mb-4">Select a chat for split view</h3>
            <div className="flex gap-2">
              <Button onClick={handleCreateNewRightChat}>
                <Plus className="w-4 h-4 mr-2" />
                New chat
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Open existing
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-64 overflow-y-auto">
                  {chats
                    .filter(c => c.id !== splitState.leftChatId && !c.archived)
                    .slice(0, 10)
                    .map(chat => (
                      <DropdownMenuItem 
                        key={chat.id}
                        onClick={() => handleSelectRightChat(chat.id)}
                      >
                        {chat.title}
                      </DropdownMenuItem>
                    ))}
                  {chats.filter(c => c.id !== splitState.leftChatId && !c.archived).length === 0 && (
                    <DropdownMenuItem disabled>No other chats</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button variant="ghost" onClick={handleCloseSplitView}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
