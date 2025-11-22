import { logger } from '../lib/logger';
import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

interface MusicBrainzRecording {
  id: string;
  title: string;
  length?: number;
  'artist-credit'?: Array<{
    name: string;
    artist: {
      id: string;
      name: string;
    };
  }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    'label-info'?: Array<{
      label?: {
        name: string;
      };
    }>;
    'cover-art-archive'?: {
      artwork: boolean;
      front: boolean;
    };
  }>;
  isrcs?: string[];
  genres?: Array<{
    name: string;
  }>;
}

interface MusicBrainzSearchResponse {
  recordings?: MusicBrainzRecording[];
  count: number;
}

class MusicBrainzMetadataSource implements MetadataSource {
  readonly name = 'MusicBrainz';
  readonly priority = 50;
  private readonly baseUrl = 'https://musicbrainz.org/ws/2';
  private readonly userAgent = 'MelodyManager/1.0.0 (https://github.com/yourusername/melody-manager)';
  private lastRequestTime = 0;
  private readonly minRequestInterval = 1000;

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetch<T>(endpoint: string, params: URLSearchParams): Promise<T> {
    await this.rateLimit();

    const url = `${this.baseUrl}${endpoint}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    try {
      const searchQuery = this.buildSearchQuery(query);
      if (!searchQuery) {
        return null;
      }

      const params = new URLSearchParams({
        query: searchQuery,
        fmt: 'json',
        limit: '5',
      });

      const response = await this.fetch<MusicBrainzSearchResponse>('/recording', params);

      if (!response.recordings || response.recordings.length === 0) {
        return null;
      }

      const bestMatch = this.findBestMatch(response.recordings, query);
      if (!bestMatch) {
        return null;
      }

      return this.mapToEnrichedMetadata(bestMatch);
    } catch (error) {
      logger.error(`Error searching MusicBrainz: ${error}`);
      return null;
    }
  }

  private buildSearchQuery(query: MetadataSearchQuery): string | null {
    const parts: string[] = [];

    if (query.isrc) {
      return `isrc:${query.isrc}`;
    }

    if (query.title) {
      parts.push(`recording:"${this.escapeQuery(query.title)}"`);
    }

    if (query.artist) {
      parts.push(`artist:"${this.escapeQuery(query.artist)}"`);
    }

    if (query.album) {
      parts.push(`release:"${this.escapeQuery(query.album)}"`);
    }

    return parts.length > 0 ? parts.join(' AND ') : null;
  }

  private escapeQuery(str: string): string {
    return str.replace(/["\\]/g, '\\$&');
  }

  private findBestMatch(recordings: MusicBrainzRecording[], query: MetadataSearchQuery): MusicBrainzRecording | null {
    let bestMatch: MusicBrainzRecording | null = null;
    let bestScore = 0;

    for (const recording of recordings) {
      let score = 0;

      if (query.title && recording.title.toLowerCase().includes(query.title.toLowerCase())) {
        score += 3;
      }

      if (query.artist) {
        const artistLower = query.artist.toLowerCase();
        if (recording['artist-credit']?.some((ac) => ac.name.toLowerCase().includes(artistLower))) {
          score += 2;
        }
      }

      if (query.duration && recording.length) {
        const durationDiff = Math.abs(recording.length / 1000 - query.duration);
        if (durationDiff < 5) {
          score += 2;
        } else if (durationDiff < 10) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = recording;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  private mapToEnrichedMetadata(recording: MusicBrainzRecording): EnrichedMetadata {
    const artists = recording['artist-credit']?.map((ac) => ac.name) || [];
    const release = recording.releases?.[0];

    return {
      title: recording.title,
      artists,
      album: release?.title,
      releaseDate: release?.date,
      label: release?.['label-info']?.[0]?.label?.name,
      isrc: recording.isrcs?.[0],
      genres: recording.genres?.map((g) => g.name),
      musicbrainzId: recording.id,
      coverArtUrl: release?.['cover-art-archive']?.front && release.id ? `https://coverartarchive.org/release/${release.id}/front-250` : undefined,
      confidence: 0.8,
    };
  }
}

export const musicbrainzMetadataSource = new MusicBrainzMetadataSource();
