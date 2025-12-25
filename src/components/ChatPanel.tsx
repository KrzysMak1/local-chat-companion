import { useRef, useEffect, useState } from 'react';
import { Chat, ChatState } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { Menu, ArrowDown, Bot, X, Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  chat: Chat | undefined;
  chatState: ChatState;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerate: () => void;
  onEditAndResend: (messageId: string, newContent: string) => void;
  onOpenSidebar?: () => void;
  onClose?: () => void;
  onSplitView?: () => void;
  showSplitButton?: boolean;
  isSecondary?: boolean;
}

export const ChatPanel = ({
  chat,
  chatState,
  onSendMessage,
  onStopGeneration,
  onDeleteMessage,
  onRegenerate,
  onEditAndResend,
  onOpenSidebar,
  onClose,
  onSplitView,
  showSplitButton = false,
  isSecondary = false,
}: ChatPanelProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);

  const { isLoading, streamingContent } = chatState;

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: smooth ? 'smooth' : 'auto' 
    });
    setUserScrolled(false);
  };

  useEffect(() => {
    if (!userScrolled) {
      scrollToBottom(false);
    }
  }, [chat?.messages, streamingContent, userScrolled]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    setShowScrollButton(!isAtBottom);
    setUserScrolled(!isAtBottom);
  };

  const messages = chat?.messages || [];
  
  // Polyfill for findLastIndex
  const findLastIndex = <T,>(arr: T[], predicate: (item: T) => boolean): number => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (predicate(arr[i])) return i;
    }
    return -1;
  };
  
  const lastUserIndex = findLastIndex(messages, m => m.role === 'user');
  const lastAssistantIndex = findLastIndex(messages, m => m.role === 'assistant');

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {onOpenSidebar && !isSecondary && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenSidebar}
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="font-medium truncate">
              {chat?.title || 'New chat'}
            </h2>
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">
                generating...
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {showSplitButton && onSplitView && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSplitView}
              title="Open split view"
            >
              <Columns className="w-4 h-4" />
            </Button>
          )}
          {onClose && isSecondary && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        onScroll={handleScroll}
      >
        {messages.length === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md px-4">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-secondary flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">How can I help you today?</h3>
              <p className="text-muted-foreground">
                Start a conversation by typing a message below.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                isLast={index === lastAssistantIndex && message.role === 'assistant'}
                isLastUser={index === lastUserIndex && message.role === 'user'}
                onDelete={() => chat && onDeleteMessage(message.id)}
                onRegenerate={
                  index === lastAssistantIndex && message.role === 'assistant' 
                    ? onRegenerate 
                    : undefined
                }
                onEditAndResend={
                  index === lastUserIndex && message.role === 'user'
                    ? (content) => onEditAndResend(message.id, content)
                    : undefined
                }
              />
            ))}

            {/* Streaming message */}
            {isLoading && streamingContent && (
              <div className="py-4 fade-in">
                <div className="max-w-3xl mx-auto px-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">Assistant</div>
                      <p className="whitespace-pre-wrap break-words text-foreground">
                        {streamingContent}
                        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && !streamingContent && (
              <div className="py-4 fade-in">
                <div className="max-w-3xl mx-auto px-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">Assistant</div>
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-lg"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={onSendMessage}
        isLoading={isLoading}
        onStop={onStopGeneration}
      />
    </div>
  );
};
