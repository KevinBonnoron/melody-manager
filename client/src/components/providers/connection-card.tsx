import { eq, useLiveQuery } from '@tanstack/react-db';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlugins } from '@/hooks/use-plugins';
import { DeleteConnectionButton } from './delete-connection-button';
import { EditConnectionButton } from './edit-connection-button';
import { getProviderInfoFromManifests } from './provider-info';
import { getProviderTypeColors } from './provider-type-colors';

interface Props {
  connectionId: string;
}

export function ConnectionCard({ connectionId }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const { data: connection } = useLiveQuery(
    (q) =>
      q
        .from({ connections: connectionCollection })
        .where(({ connections }) => eq(connections.id, connectionId))
        .findOne(),
    [connectionId],
  );

  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, connection?.provider ?? ''))
        .findOne(),
    [connection?.provider],
  );

  const type = provider?.type;
  const category = provider?.category;
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? providerInfo[type] : null;
  if (!connection || !provider || !type || !category || !info) {
    return null;
  }

  const Icon = info.icon;
  const isConnected = !!connection.enabled;
  const colors = getProviderTypeColors(type);
  return (
    <Card className="gap-4 p-5">
      <CardHeader className="flex flex-row items-center gap-4 p-0">
        <Avatar className={`h-12 w-12 shrink-0 rounded-xl ${colors.bg}`}>
          <AvatarFallback className={`bg-transparent ${colors.icon}`}>
            <Icon className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <CardTitle className="min-w-0 flex-1 text-base leading-tight">{info.title}</CardTitle>
        <CardAction className="shrink-0">{isConnected ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</CardAction>
      </CardHeader>
      {!info.isAutoDiscovery && (
        <CardFooter className="gap-2 border-t p-0 pt-4">
          <EditConnectionButton connectionId={connectionId} title={info.title} description={info.description} />
          <DeleteConnectionButton connectionId={connectionId} title={info.title} />
        </CardFooter>
      )}
    </Card>
  );
}
