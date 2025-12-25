import { useState } from 'react';
import { MemoryItem } from '@/types/chat';
import { generateId } from '@/lib/storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Brain, AlertTriangle } from 'lucide-react';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryItem[];
  onSaveMemory: (memory: MemoryItem[]) => void;
  useMemory: boolean;
}

export const MemoryModal = ({
  isOpen,
  onClose,
  memory,
  onSaveMemory,
  useMemory,
}: MemoryModalProps) => {
  const [newFact, setNewFact] = useState('');

  const handleAddFact = () => {
    if (!newFact.trim()) return;
    
    const newItem: MemoryItem = {
      id: generateId(),
      content: newFact.trim(),
      createdAt: Date.now(),
    };
    
    onSaveMemory([...memory, newItem]);
    setNewFact('');
  };

  const handleDeleteFact = (id: string) => {
    onSaveMemory(memory.filter(m => m.id !== id));
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all memory?')) {
      onSaveMemory([]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Memory
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          {!useMemory && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Memory is disabled. Enable it in Settings to use these facts.
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Add facts about yourself. These will be included in conversations when memory is enabled.
          </p>

          {/* Add new fact */}
          <div className="flex gap-2">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="e.g., My name is John, I work as a developer..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddFact()}
            />
            <Button onClick={handleAddFact} disabled={!newFact.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Memory list */}
          <ScrollArea className="h-[300px] rounded-lg border border-border">
            {memory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No memories saved yet
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {memory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 p-3 rounded-lg bg-secondary group"
                  >
                    <span className="flex-1 text-sm">{item.content}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleDeleteFact(item.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Clear all */}
          {memory.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {memory.length} {memory.length === 1 ? 'fact' : 'facts'} saved
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
