import { gt, useLiveQuery } from '@tanstack/react-db';
import { Loader2, LogOut, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UserSession, userSessionCollection } from '@/collections/user-session.collection';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { currentSessionID, revokeSession } from '@/lib/auth-session';
import { getDeviceLabel } from '@/lib/session-device';

export function SessionSecurity() {
  const { t, i18n } = useTranslation();
  const {
    data: sessions = [],
    isLoading,
    isError,
  } = useLiveQuery({
    query: (q) =>
      q
        .from({ sessions: userSessionCollection })
        .where(({ sessions }) => gt(sessions.expiresAt, new Date().toISOString().replace('T', ' ')))
        .orderBy(({ sessions }) => sessions.created, 'desc'),
  });
  const [target, setTarget] = useState<UserSession | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const currentID = currentSessionID();

  const label = (session: UserSession) => getDeviceLabel(session.userAgent) || t('ProfilePage.unknownDevice');

  const revoke = async () => {
    if (!target || revokingId) {
      return;
    }
    setRevokingId(target.id);
    try {
      await revokeSession(target.id);
      toast.success(t('ProfilePage.sessionRevoked', { device: label(target) }));
      setTarget(null);
    } catch {
      toast.error(t('ProfilePage.sessionRevokeError'));
    }
    setRevokingId(null);
  };

  return (
    <Card className="p-4">
      <h3 className="font-semibold">{t('ProfilePage.connectedDevices')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('ProfilePage.connectedDevicesDescription')}</p>

      <div aria-busy={isLoading}>
        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('ProfilePage.sessionsLoading')}
          </div>
        ) : isError ? (
          <p className="mt-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive" role="alert">
            {t('ProfilePage.sessionsLoadError')}
          </p>
        ) : (
          <ul className="mt-4 space-y-2" aria-label={t('ProfilePage.connectedDevices')}>
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <MonitorSmartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{label(session)}</span>
                      {session.id === currentID && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">{t('ProfilePage.thisDevice')}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('ProfilePage.sessionConnectedAt', { date: new Date(session.created).toLocaleString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
                      {session.ipAddress && ` · ${session.ipAddress}`}
                    </p>
                  </div>
                </div>
                {session.id !== currentID && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 self-end sm:self-auto" disabled={revokingId !== null} onClick={() => setTarget(session)} aria-label={t('ProfilePage.revokeSessionFor', { device: label(session) })}>
                    <LogOut className="h-3.5 w-3.5" />
                    {t('ProfilePage.revokeSession')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && revokingId === null && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ProfilePage.revokeSessionConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{target && t('ProfilePage.revokeSessionConfirmDescription', { device: label(target) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokingId !== null}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokingId !== null}
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              {revokingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('ProfilePage.revokeSession')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
