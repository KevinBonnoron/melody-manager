import { Badge } from '@/components/ui/badge';
import { getProviderColor } from '@/lib/utils';
import type { Track } from '@melody-manager/shared';

interface Props {
  track: Track;
}

export function TrackProviderCell({ track }: Props) {
  return (
    <Badge variant="outline" className={getProviderColor(track.expand.provider.type)}>
      {track.expand.provider.type}
    </Badge>
  );
}
