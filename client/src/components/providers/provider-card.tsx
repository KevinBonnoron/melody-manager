import { providerCollection } from '@/collections/provider.collection';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeleteProviderButton } from './delete-provider-button';
import { EditProviderButton } from './edit-provider-button';
import { getProviderInfo } from './provider-info';
import { getProviderTypeColors } from './provider-type-colors';

interface Props {
  providerId: string;
}

export function ProviderCard({ providerId }: Props) {
  const { t } = useTranslation();

  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, providerId))
        .findOne(),
    [providerId],
  );

  const type = provider?.type;
  const category = provider?.category;
  const providerInfo = getProviderInfo(t);
  const info = type ? providerInfo[type] : null;

  if (!provider || !type || !category || !info) {
    return null;
  }

  const Icon = info.icon;
  const isConnected = !!provider.enabled;
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
      <CardFooter className="gap-2 border-t p-0 pt-4">
        <EditProviderButton providerId={providerId} title={info.title} description={info.description} />
        <DeleteProviderButton providerId={providerId} title={info.title} />
      </CardFooter>
    </Card>
  );
}
