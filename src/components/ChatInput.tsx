import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  onStop: () => void;
}

export const ChatInput = ({ onSend, isLoading, onStop }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-secondary rounded-2xl p-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message ChatGPT..."
            className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pr-12"
            rows={1}
            disabled={isLoading}
          />
          
          <div className="absolute right-2 bottom-2">
            {isLoading ? (
              <Button
                onClick={onStop}
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg bg-destructive/10 hover:bg-destructive/20"
              >
                <Square className="w-4 h-4 text-destructive" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                size="icon"
                disabled={!input.trim()}
                className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        <p className="text-xs text-center text-muted-foreground mt-2">
          ChatGPT Clone • Connected to local llama.cpp server
        </p>
      </div>
    </div>
  );
};
