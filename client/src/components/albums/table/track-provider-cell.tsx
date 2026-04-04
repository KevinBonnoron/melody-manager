import type { Track } from '@melody-manager/shared';
import { Badge } from '@/components/ui/badge';
import { getProviderColor } from '@/lib/utils';

interface Props {
  track: Track;
}

export function TrackProviderCell({ track }: Props) {
  const providerType = track.expand?.provider?.type;
  if (!providerType) {
    return (
      <Badge variant="outline" className={getProviderColor('unknown')}>
        Unknown
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={getProviderColor(providerType)}>
      {providerType}
    </Badge>
  );
}
