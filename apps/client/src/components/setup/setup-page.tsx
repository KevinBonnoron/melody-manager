import { Preferences } from '@capacitor/preferences';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const REACH_TIMEOUT_MS = 6000;

export function SetupPage() {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const typed = serverUrl.trim();
    const candidates = typed.startsWith('http://') || typed.startsWith('https://') ? [typed] : [`https://${typed}`, `http://${typed}`];

    let origin = '';
    let answered = false;
    let wrongServer = false;
    for (const candidate of candidates) {
      try {
        origin = new URL(candidate).origin;
      } catch {
        continue;
      }

      try {
        const response = await fetch(`${origin}/api/config`, { signal: AbortSignal.timeout(REACH_TIMEOUT_MS) });
        if (response.ok && typeof (await response.json())?.registrationAllowed === 'boolean') {
          answered = true;
          break;
        }

        wrongServer = true;
      } catch {
        // Unreachable, or not this application: try the next candidate.
      }
    }

    if (!origin) {
      setError(t('SetupPage.invalidUrl'));
      setIsLoading(false);
      return;
    }

    if (!answered) {
      setError(t(wrongServer ? 'SetupPage.notMelodyManager' : 'SetupPage.unreachable', { origin }));
      setIsLoading(false);
      return;
    }

    await Preferences.set({ key: 'serverUrl', value: origin });
    window.location.replace('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('SetupPage.title')}</CardTitle>
          <CardDescription>{t('SetupPage.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">{t('SetupPage.serverUrl')}</Label>
              <Input id="serverUrl" type="text" placeholder="https://music.example.com" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required disabled={isLoading} autoFocus />
              <p className="text-sm text-muted-foreground">{t('SetupPage.hint')}</p>
            </div>

            {error && (
              <div role="alert" aria-live="polite" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('SetupPage.checking') : t('SetupPage.continue')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
