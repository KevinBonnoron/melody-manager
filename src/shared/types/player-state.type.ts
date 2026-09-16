import type { Track } from './track.type';

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  localVolume: number;
  currentTime: number;
  queue: Track[];
  repeatMode: 'none' | 'one' | 'all';
  shuffle: boolean;
}
