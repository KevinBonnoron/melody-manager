import { eq, useLiveQuery } from '@tanstack/react-db';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { providerCollection } from '@/collections/provider.collection';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlugins } from '@/hooks/use-plugins';
import { getProviderInfoFromManifests } from '../providers/provider-info';
import { getProviderTypeColors } from '../providers/provider-type-colors';

interface Props {
  providerId: string;
}

export function PublicProviderCard({ providerId }: Props) {
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
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? providerInfo[type] : null;

  if (!provider || !type || !info) {
    return null;
  }

  const Icon = info.icon;
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
        <CardAction className="shrink-0">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        </CardAction>
      </CardHeader>
    </Card>
  );
}
