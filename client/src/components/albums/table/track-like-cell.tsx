import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackLikes } from '@/hooks/use-track-likes';
import type { Track } from '@melody-manager/shared';
import { DislikeButton } from '../../atoms/dislike-button';
import { LikeButton } from '../../atoms/like-button';

interface Props {
  track: Track;
}

export function TrackLikeCell({ track }: Props) {
  const { isLiked, toggleLike } = useTrackLikes();
  const { isDisliked, toggleDislike } = useTrackDislikes();

  return (
    <div className="flex items-center justify-center gap-0">
      <LikeButton isLiked={isLiked(track.id)} toggleLike={() => toggleLike(track.id)} />
      <DislikeButton isDisliked={isDisliked(track.id)} toggleDislike={() => toggleDislike(track.id)} />
    </div>
  );
}
