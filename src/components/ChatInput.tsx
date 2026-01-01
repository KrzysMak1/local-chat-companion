import { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (content: string, imageDataUrl?: string) => void;
  isLoading: boolean;
  onStop: () => void;
}

export const ChatInput = ({ onSend, isLoading, onStop }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if ((input.trim() || imagePreview) && !isLoading) {
      onSend(input.trim(), imagePreview || undefined);
      setInput('');
      setImagePreview(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    setImagePreview(null);
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="max-w-3xl mx-auto">
        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-3 relative inline-block">
            <div className="relative group">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-32 rounded-lg border border-border object-contain"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={removeImage}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <ImageIcon className="w-3 h-3" />
              <span>Image attached - AI will analyze it</span>
            </div>
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-secondary rounded-2xl p-2">
          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attach Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="Attach image"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={imagePreview ? "Add a message about the image..." : "Message ChatGPT..."}
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
                disabled={!input.trim() && !imagePreview}
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
