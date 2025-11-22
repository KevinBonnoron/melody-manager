import { useTrackLikes } from '@/hooks/use-track-likes';
import type { Track } from '@melody-manager/shared';
import { LikeButton } from '../../atoms/like-button';

interface Props {
  track: Track;
}

export function TrackLikeCell({ track }: Props) {
  const { isLiked, toggleLike } = useTrackLikes();

  return <LikeButton isLiked={isLiked(track.id)} toggleLike={() => toggleLike(track.id)} />;
}
