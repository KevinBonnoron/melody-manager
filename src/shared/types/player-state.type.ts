import type { Track } from './track.type';

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  // This browser's own level, and nothing else's. A speaker keeps its volume on
  // the speaker, so switching to one and back must leave this untouched.
  localVolume: number;
  currentTime: number;
  queue: Track[];
  repeatMode: 'none' | 'one' | 'all';
  shuffle: boolean;
}
