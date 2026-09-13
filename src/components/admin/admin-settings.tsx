import { AlertTriangle, Radar } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { configClient } from '@/clients/config.client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { ServerConfig } from '@/shared';

const SAVE_DEBOUNCE_MS = 800;

// A loopback address means "this machine" to whoever reads it, so anything
// outside this process given one looks for the server on itself.
function isLoopback(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname;
    return host === 'localhost' || host === '::1' || host.startsWith('127.');
  } catch {
    return false;
  }
}

export function AdminSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [path, setPath] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [listenAddr, setListenAddr] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    configClient
      .get()
      .then((response) => {
        if (!cancelled && response.publicUrl !== undefined) {
          setConfig(response as ServerConfig);
          setPath(response.path ?? '');
          setPublicUrl(response.publicUrl);
          setListenAddr(response.listenAddr ?? '');
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(
    async (patch: Partial<ServerConfig>) => {
      try {
        const updated = await configClient.update(patch);
        setConfig(updated);
        setPublicUrl(updated.publicUrl);
        setListenAddr(updated.listenAddr);
        toast.success(t('AdminSettings.saved'));
      } catch (error) {
        console.error(error);
        toast.error(t('AdminSettings.saveError'));
      }
    },
    [t],
  );

  const detect = async () => {
    try {
      const { candidates: found } = await configClient.addressCandidates();
      if (found.length === 0) {
        toast.error(t('AdminSettings.publicUrl.noCandidate'));
        return;
      }

      // One address is an answer; several is a choice only the operator can make.
      setPublicUrl(found[0]);
      setCandidates(found.length > 1 ? found : []);
    } catch (error) {
      console.error(error);
      toast.error(t('AdminSettings.publicUrl.detectError'));
    }
  };

  // Typing is not a decision: the field saves once it settles, like the switch
  // beside it, rather than behind a button only this one control would have.
  const savedUrl = config?.publicUrl;
  useEffect(() => {
    const trimmed = publicUrl.trim();
    if (savedUrl === undefined || trimmed === savedUrl || trimmed === '') {
      return;
    }

    const timer = setTimeout(() => apply({ publicUrl: trimmed }), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [publicUrl, savedUrl, apply]);

  const savedListenAddr = config?.listenAddr;
  useEffect(() => {
    const trimmed = listenAddr.trim();
    if (savedListenAddr === undefined || trimmed === savedListenAddr || trimmed === '') {
      return;
    }

    const timer = setTimeout(() => apply({ listenAddr: trimmed }), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [listenAddr, savedListenAddr, apply]);

  if (!config) {
    return <p className="text-muted-foreground text-sm">{t('AdminSettings.unavailable')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between gap-4 bg-card p-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('AdminSettings.registration.title')}</div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t('AdminSettings.registration.description')}</p>
          </div>
          <Switch checked={config.registrationAllowed} onCheckedChange={(allowed) => apply({ registrationAllowed: allowed })} aria-label={t('AdminSettings.registration.title')} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="bg-card p-4">
          <div className="text-sm font-medium">{t('AdminSettings.publicUrl.title')}</div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t('AdminSettings.publicUrl.description')}</p>
          <div className="mt-3 flex gap-2">
            <Input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} placeholder="http://192.168.1.10:8090" spellCheck={false} />
            <Button variant="outline" onClick={detect} className="shrink-0">
              <Radar className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('AdminSettings.publicUrl.detect')}</span>
            </Button>
          </div>

          {isLoopback(config.publicUrl) && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('AdminSettings.publicUrl.loopbackWarning')}
            </p>
          )}

          {candidates.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">{t('AdminSettings.publicUrl.candidates')}</span>
              {candidates.map((candidate) => (
                <button key={candidate} type="button" onClick={() => setPublicUrl(candidate)} className="rounded-full border px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-primary-border hover:text-foreground">
                  {candidate}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="bg-card p-4">
          <div className="text-sm font-medium">{t('AdminSettings.listenAddr.title')}</div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t('AdminSettings.listenAddr.description')}</p>
          <Input className="mt-3 font-mono" value={listenAddr} onChange={(event) => setListenAddr(event.target.value)} placeholder="0.0.0.0:8090" spellCheck={false} />
          <p className="mt-2 text-[12px] text-muted-foreground">{t('AdminSettings.listenAddr.restartNotice')}</p>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{t('AdminSettings.storedAt', { path })}</p>
    </div>
  );
}
