import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Preferences } from '@capacitor/preferences';
import { useState } from 'react';

export function SetupPage() {
  const [serverUrl, setServerUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let url = serverUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const urlObj = new URL(url);
      await Preferences.set({
        key: 'serverUrl',
        value: urlObj.origin,
      });

      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Melody Manager</CardTitle>
          <CardDescription>Enter the URL of your self-hosted Melody Manager server to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">Server URL</Label>
              <Input id="serverUrl" type="text" placeholder="https://music.example.com" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required disabled={isLoading} />
              <p className="text-sm text-muted-foreground">Example: music.example.com or https://192.168.1.100:8090</p>
            </div>

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Connecting...' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
