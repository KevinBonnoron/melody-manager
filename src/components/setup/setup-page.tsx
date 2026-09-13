import { Preferences } from '@capacitor/preferences';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Long enough for a server waking up on a home network, short enough that a
// wrong address is reported rather than waited on.
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
    // Without a scheme, both are tried rather than guessed at: https first,
    // because a server reachable from outside should be, and http after,
    // because a server on this machine or this network usually is not. Typing
    // the scheme keeps that choice.
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

      // Asked before it is kept: an address that parses but answers nothing
      // used to be saved anyway, and every screen after this one failed with
      // nothing pointing back here.
      //
      // This application's own endpoint, not PocketBase's health check: that
      // one answers "API is healthy" for any PocketBase, which is not the same
      // thing. A reverse proxy in front of a real server forwards this one just
      // as it forwards the rest, so it stays a legitimate address.
      try {
        const response = await fetch(`${origin}/api/config`, { signal: AbortSignal.timeout(REACH_TIMEOUT_MS) });
        if (response.ok && typeof (await response.json())?.registrationAllowed === 'boolean') {
          answered = true;
          break;
        }

        wrongServer = true;
      } catch {
        // Unreachable, or something that is not this application: try the next
        // candidate, and report below if none answers.
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
    // A full reload, not a route change: the server address is read once when
    // the app starts, so it only takes effect on the next start.
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
