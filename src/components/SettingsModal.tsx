import { useState } from 'react';
import { Settings } from '@/types/chat';
import { exportAllData, importAllData } from '@/lib/storage';
import { checkBackendHealth, checkLlamaHealth } from '@/lib/backendApi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Download, 
  Upload,
  Sun,
  Moon,
  Server,
  Cpu
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
  profileId: string;
}

export const SettingsModal = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  profileId,
}: SettingsModalProps) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [llamaStatus, setLlamaStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleTestBackend = async () => {
    setBackendStatus('testing');
    const isHealthy = await checkBackendHealth();
    setBackendStatus(isHealthy ? 'success' : 'error');
    if (isHealthy) {
      toast.success('Backend connected');
    } else {
      toast.error('Cannot connect to backend');
    }
    setTimeout(() => setBackendStatus('idle'), 3000);
  };

  const handleTestLlama = async () => {
    setLlamaStatus('testing');
    const isHealthy = await checkLlamaHealth();
    setLlamaStatus(isHealthy ? 'success' : 'error');
    if (isHealthy) {
      toast.success('AI server connected');
    } else {
      toast.error('Cannot connect to AI server');
    }
    setTimeout(() => setLlamaStatus('idle'), 3000);
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const handleExportAll = () => {
    const data = exportAllData(profileId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatgpt-clone-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportAll = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        importAllData(profileId, data);
        window.location.reload();
      } catch (error) {
        console.error('Error importing data:', error);
      }
    };
    input.click();
  };

  const toggleTheme = () => {
    const newTheme = localSettings.theme === 'dark' ? 'light' : 'dark';
    setLocalSettings({ ...localSettings, theme: newTheme });
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-4">
            {/* Theme */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Switch between light and dark mode
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleTheme}
              >
                {localSettings.theme === 'dark' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                value={localSettings.systemPrompt}
                onChange={(e) => setLocalSettings({ ...localSettings, systemPrompt: e.target.value })}
                placeholder="Enter system prompt..."
                className="min-h-[120px]"
              />
            </div>

            {/* Use Memory */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Use Memory</Label>
                <p className="text-sm text-muted-foreground">
                  Include saved memories in conversations
                </p>
              </div>
              <Switch
                checked={localSettings.useMemory}
                onCheckedChange={(checked) => setLocalSettings({ ...localSettings, useMemory: checked })}
              />
            </div>
          </TabsContent>

          <TabsContent value="model" className="space-y-6 mt-4">
            {/* Backend URL */}
            <div className="space-y-2">
              <Label htmlFor="backendUrl">Backend URL</Label>
              <div className="flex gap-2">
                <Input
                  id="backendUrl"
                  value={localSettings.backendUrl}
                  onChange={(e) => setLocalSettings({ ...localSettings, backendUrl: e.target.value })}
                  placeholder="http://localhost:8000"
                />
                <Button
                  variant="outline"
                  onClick={handleTestBackend}
                  disabled={backendStatus === 'testing'}
                  title="Test backend connection"
                >
                  {backendStatus === 'testing' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {backendStatus === 'success' && <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />}
                  {backendStatus === 'error' && <XCircle className="w-4 h-4 mr-2 text-destructive" />}
                  <Server className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Python FastAPI backend URL</p>
            </div>

            {/* Test AI Connection */}
            <div className="flex items-center justify-between">
              <div>
                <Label>AI Server (llama.cpp)</Label>
                <p className="text-sm text-muted-foreground">
                  Test connection to AI model server
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleTestLlama}
                disabled={llamaStatus === 'testing'}
              >
                {llamaStatus === 'testing' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {llamaStatus === 'success' && <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />}
                {llamaStatus === 'error' && <XCircle className="w-4 h-4 mr-2 text-destructive" />}
                <Cpu className="w-4 h-4 mr-2" />
                Test AI
              </Button>
            </div>

            {/* Temperature */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Temperature</Label>
                <span className="text-sm text-muted-foreground">
                  {localSettings.temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[localSettings.temperature]}
                onValueChange={([value]) => setLocalSettings({ ...localSettings, temperature: value })}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Lower = more focused, Higher = more creative
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={localSettings.maxTokens}
                onChange={(e) => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value) || 512 })}
                min={64}
                max={8192}
              />
            </div>

            {/* Streaming */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Streaming</Label>
                <p className="text-sm text-muted-foreground">
                  Enable real-time response streaming
                </p>
              </div>
              <Switch
                checked={localSettings.streamingEnabled}
                onCheckedChange={(checked) => setLocalSettings({ ...localSettings, streamingEnabled: checked })}
              />
            </div>

            {/* Quick Start */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                <h4 className="font-medium">Quick Start Guide</h4>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p><strong>1.</strong> Start llama.cpp:</p>
                <code className="block bg-secondary p-2 rounded text-xs overflow-x-auto">
                  ./llama-server -m model.gguf --port 8081
                </code>
                <p><strong>2.</strong> Start Python backend:</p>
                <code className="block bg-secondary p-2 rounded text-xs">
                  cd server && python start.py
                </code>
                <p><strong>3.</strong> Start frontend:</p>
                <code className="block bg-secondary p-2 rounded text-xs">
                  npm run dev
                </code>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-6 mt-4">
            {/* Export All */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Export All Data</Label>
                <p className="text-sm text-muted-foreground">
                  Download all chats, settings, and memory
                </p>
              </div>
              <Button variant="outline" onClick={handleExportAll}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

            {/* Import All */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Import Data</Label>
                <p className="text-sm text-muted-foreground">
                  Restore from a backup file
                </p>
              </div>
              <Button variant="outline" onClick={handleImportAll}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
