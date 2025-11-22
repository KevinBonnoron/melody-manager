interface SpotifyAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class SpotifyService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly baseUrl = 'https://api.spotify.com/v1';
  private readonly authUrl = 'https://accounts.spotify.com/api/token';

  /**
   * Authenticate with Spotify using client credentials flow
   */
  async authenticate(clientId: string, clientSecret: string): Promise<void> {
    if (this.isTokenValid()) {
      return;
    }

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Spotify authentication failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as SpotifyAuthResponse;
    this.setAccessToken(data.access_token, data.expires_in);
  }

  /**
   * Set access token for Spotify Web API
   */
  setAccessToken(token: string, expiresIn: number): void {
    this.accessToken = token;
    this.tokenExpiry = Date.now() + expiresIn * 1000;
  }

  /**
   * Check if token is valid
   */
  isTokenValid(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiry;
  }

  /**
   * Make authenticated request to Spotify API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.isTokenValid()) {
      throw new Error('Spotify access token is invalid or expired');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Play a track on a specific device
   */
  async playTrack(trackUri: string, deviceId: string): Promise<void> {
    await this.request('/me/player/play', {
      method: 'PUT',
      body: JSON.stringify({
        uris: [trackUri],
        device_id: deviceId,
      }),
    });
  }

  /**
   * Pause playback
   */
  async pause(deviceId?: string): Promise<void> {
    const query = deviceId ? `?device_id=${deviceId}` : '';
    await this.request(`/me/player/pause${query}`, { method: 'PUT' });
  }

  /**
   * Get user's saved tracks
   */
  async getSavedTracks(limit = 50, offset = 0): Promise<any> {
    return this.request(`/me/tracks?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get user's playlists
   */
  async getPlaylists(limit = 50, offset = 0): Promise<any> {
    return this.request(`/me/playlists?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get playlist tracks
   */
  async getPlaylistTracks(playlistId: string, limit = 100, offset = 0): Promise<any> {
    return this.request(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get user's followed artists
   */
  async getFollowedArtists(limit = 50): Promise<any> {
    return this.request(`/me/following?type=artist&limit=${limit}`);
  }

  /**
   * Get artist's top tracks
   */
  async getArtistTopTracks(artistId: string, market = 'US'): Promise<any> {
    return this.request(`/artists/${artistId}/top-tracks?market=${market}`);
  }

  /**
   * Get track details
   */
  async getTrack(trackId: string): Promise<any> {
    return this.request(`/tracks/${trackId}`);
  }

  /**
   * Search for tracks, albums, artists, or playlists
   */
  async search(query: string, type: string, limit = 20): Promise<any> {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: limit.toString(),
    });
    return this.request(`/search?${params}`);
  }
}

export const spotifyService = new SpotifyService();
