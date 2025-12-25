import { useState } from 'react';
import { Message } from '@/types/chat';
import { 
  Copy, 
  Check, 
  Trash2, 
  RefreshCw, 
  Edit3,
  User,
  Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: Message;
  isLast: boolean;
  isLastUser: boolean;
  onDelete: () => void;
  onRegenerate?: () => void;
  onEditAndResend?: (newContent: string) => void;
}

export const ChatMessage = ({
  message,
  isLast,
  isLastUser,
  onDelete,
  onRegenerate,
  onEditAndResend,
}: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEditAndResend) {
      onEditAndResend(editContent.trim());
    }
    setIsEditing(false);
  };

  const isUser = message.role === 'user';

  return (
    <div className={cn("group py-4 fade-in", isUser ? "bg-transparent" : "")}>
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            isUser ? "bg-primary" : "bg-secondary"
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-primary-foreground" />
            ) : (
              <Bot className="w-4 h-4 text-secondary-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-1 text-foreground">
              {isUser ? 'You' : 'Assistant'}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[100px] bg-secondary"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>
                    Save & Submit
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditContent(message.content);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={cn(
                "prose prose-invert max-w-none text-foreground",
                isUser ? "chat-message-user" : "chat-message-assistant"
              )}>
                <p className="whitespace-pre-wrap break-words m-0">
                  {message.content}
                </p>
              </div>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8"
                  onClick={handleCopy}
                  title="Copy"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>

                {isUser && isLastUser && onEditAndResend && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={() => setIsEditing(true)}
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                )}

                {!isUser && isLast && onRegenerate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={onRegenerate}
                    title="Regenerate"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
