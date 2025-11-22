import type { AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, SearchResult, Track, TrackProvider, TrackSearchResult } from '@melody-manager/shared';

export interface TrackSource<Provider extends TrackProvider = TrackProvider> {
  /**
   * Search for tracks by query
   * @param query - Search query string
   * @param provider - Track provider configuration
   * @returns Array of track search results
   */
  searchTracks(query: string, provider: Provider): Promise<TrackSearchResult[]>;

  /**
   * Get or create tracks from external URL
   * @param url - External URL (YouTube, Spotify, etc.)
   * @param provider - Track provider configuration
   * @returns Array of tracks (multiple if chapters are split)
   */
  getTracks(url: string, provider: Provider): Promise<Track[]>;

  /**
   * Search for albums by query (optional)
   * @param query - Search query string
   * @param provider - Track provider configuration
   * @returns Array of album search results
   */
  searchAlbums?(query: string, provider: Provider): Promise<AlbumSearchResult[]>;

  /**
   * Search for artists by query (optional)
   * @param query - Search query string
   * @param provider - Track provider configuration
   * @returns Array of artist search results
   */
  searchArtists?(query: string, provider: Provider): Promise<ArtistSearchResult[]>;

  /**
   * Search for playlists by query (optional)
   * @param query - Search query string
   * @param provider - Track provider configuration
   * @returns Array of playlist search results
   */
  searchPlaylists?(query: string, provider: Provider): Promise<PlaylistSearchResult[]>;

  /**
   * Get all tracks from an album URL (optional)
   * @param url - External album URL
   * @param provider - Track provider configuration
   * @returns Array of tracks from the album
   */
  getAlbumTracks?(url: string, provider: Provider): Promise<Track[]>;

  /**
   * Get all tracks from an artist (full discography) (optional)
   * @param url - External artist URL
   * @param provider - Track provider configuration
   * @returns Array of tracks from the artist
   */
  getArtistTracks?(url: string, provider: Provider): Promise<Track[]>;

  /**
   * Get all tracks from a playlist URL (optional)
   * @param url - External playlist URL
   * @param provider - Track provider configuration
   * @returns Array of tracks from the playlist
   */
  getPlaylistTracks?(url: string, provider: Provider): Promise<Track[]>;
}
