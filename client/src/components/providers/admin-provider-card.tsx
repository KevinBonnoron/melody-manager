import { eq, useLiveQuery } from '@tanstack/react-db';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { providerGrantsCollection } from '@/collections/provider-grants.collection';
import { usePlugins } from '@/hooks/use-plugins';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { AdminProviderEditButton } from './admin-provider-edit-button';
import { ProviderGrantsManager } from './provider-grants-manager';
import { getProviderInfoFromManifests } from './provider-info';
import { getProviderTypeColors } from './provider-type-colors';

interface Props {
  providerId: string;
}

function DeleteSharedProviderButton({ providerId, title }: { providerId: string; title: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: connections = [] } = useLiveQuery((q) => q.from({ connections: connectionCollection }).where(({ connections }) => eq(connections.provider, providerId)), [providerId]);
  const { data: grants = [] } = useLiveQuery((q) => q.from({ grants: providerGrantsCollection }).where(({ grants }) => eq(grants.provider, providerId)), [providerId]);
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      for (const c of connections) {
        connectionCollection.delete(c.id);
      }

      for (const g of grants) {
        providerGrantsCollection.delete(g.id);
      }

      providerCollection.delete(providerId);
      toast.success(t('ProviderCardActions.providerDeletedSuccess', { title }));
      setOpen(false);
    } catch {
      toast.error(t('ProviderCardActions.providerDeleteError', { title }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={t('ProviderCardActions.delete')}>
          <Trash2 className="h-3.5 w-3.5 xl:mr-1.5" />
          <span className="hidden xl:inline">{t('ProviderCardActions.delete')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ProviderCardActions.deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('ProviderCardActions.deleteConfirmDescription', { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
            {t('AlbumActionsMenu.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? t('ProviderCardActions.deleting') : t('ProviderCardActions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminProviderCard({ providerId }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, providerId))
        .findOne(),
    [providerId],
  );

  const type = provider?.type;
  const manifest = type ? manifests.find((m) => m.id === type) : null;
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? providerInfo[type] : null;
  if (!provider || !type || !info) {
    return null;
  }

  const Icon = info.icon;
  const isEnabled = !!provider.enabled;
  const colors = getProviderTypeColors(type);
  const scope = manifest?.scope;
  const isShared = scope === 'shared';
  const isPublic = scope === 'public';
  const hasConfig = !!manifest?.configSchema?.length;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardHeader className="flex flex-row items-center gap-4 p-0">
        <Avatar className={`h-12 w-12 shrink-0 rounded-xl ${colors.bg}`}>
          <AvatarFallback className={`bg-transparent ${colors.icon}`}>
            <Icon className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base leading-tight">{info.title}</CardTitle>
          {!isShared && !isPublic && <p className="mt-0.5 text-xs text-muted-foreground">{t('Admin.personalProviderHint')}</p>}
        </div>
        <CardAction className="shrink-0">{isEnabled ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</CardAction>
      </CardHeader>
      <CardFooter className="mt-auto gap-2 border-t p-0 pt-4">
        {hasConfig && <AdminProviderEditButton providerId={providerId} title={info.title} description={info.description} />}
        {isShared && <ProviderGrantsManager providerId={providerId} />}
        <DeleteSharedProviderButton providerId={providerId} title={info.title} />
      </CardFooter>
    </Card>
  );
}
