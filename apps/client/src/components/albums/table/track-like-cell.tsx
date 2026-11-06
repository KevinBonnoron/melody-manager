import { useTrackRatings } from '@/hooks/use-ratings';
import type { Track } from '@/shared';
import { DislikeButton } from '../../atoms/dislike-button';
import { LikeButton } from '../../atoms/like-button';

interface Props {
  track: Track;
}

export function TrackLikeCell({ track }: Props) {
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTrackRatings();
  return (
    <div className="flex items-center justify-center gap-0">
      <LikeButton isLiked={isLiked(track.id)} toggleLike={() => toggleLike(track.id)} />
      <DislikeButton isDisliked={isDisliked(track.id)} toggleDislike={() => toggleDislike(track.id)} />
    </div>
  );
}
