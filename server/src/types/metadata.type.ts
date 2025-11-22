export interface MetadataSearchQuery {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  isrc?: string;
  sourceUrl?: string;
  filePath?: string;
}

export interface EnrichedMetadata {
  title?: string;
  artists?: string[];
  album?: string;
  year?: number;
  genres?: string[];
  isrc?: string;
  label?: string;
  releaseDate?: string;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  coverArtUrl?: string;
  musicbrainzId?: string;
  spotifyId?: string;
  youtubeId?: string;
  confidence?: number;
}

export interface MetadataSourceResult {
  source: string;
  confidence: number;
  metadata: EnrichedMetadata;
}
