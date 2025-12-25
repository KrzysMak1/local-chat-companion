import { useState } from 'react';
import { Profile } from '@/types/chat';
import { generateId } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Plus, Trash2, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileSelectorProps {
  profiles: Profile[];
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (profile: Profile) => void;
  onDeleteProfile: (profileId: string) => void;
}

export const ProfileSelector = ({
  profiles,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: ProfileSelectorProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    
    const newProfile: Profile = {
      id: generateId(),
      name: newName.trim(),
      createdAt: Date.now(),
    };
    
    onCreateProfile(newProfile);
    setNewName('');
    setIsCreating(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">ChatGPT Clone</h1>
          <p className="text-muted-foreground mt-2">
            Select or create a profile to continue
          </p>
        </div>

        {/* Profiles */}
        <div className="space-y-3">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="group flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80 cursor-pointer transition-colors"
              onClick={() => onSelectProfile(profile.id)}
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{profile.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Created {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this profile?')) {
                    onDeleteProfile(profile.id);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}

          {profiles.length === 0 && !isCreating && (
            <p className="text-center text-muted-foreground py-4">
              No profiles yet. Create one to get started.
            </p>
          )}
        </div>

        {/* Create new */}
        {isCreating ? (
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Profile name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsCreating(false);
                  setNewName('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                Create
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Profile
          </Button>
        )}

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground">
          Profiles are stored locally. Each profile has separate chats and settings.
        </p>
      </div>
    </div>
  );
};
