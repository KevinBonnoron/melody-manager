interface SpotifyAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class SpotifyClient {
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private readonly baseUrl = 'https://api.spotify.com/v1';
  private readonly authUrl = 'https://accounts.spotify.com/api/token';

  async authenticate(clientId: string, clientSecret: string): Promise<void> {
    if (this.isTokenValid()) return;

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
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  private isTokenValid(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiry;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.isTokenValid()) throw new Error('Spotify access token is invalid or expired');

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async getTrack(trackId: string): Promise<{
    id: string;
    name: string;
    duration_ms: number;
    artists?: Array<{ name: string }>;
    album?: { name: string; images?: Array<{ url: string }>; release_date?: string };
    external_urls?: { spotify?: string };
    external_ids?: { isrc?: string };
  }> {
    return this.request(`/tracks/${trackId}`);
  }

  async search(
    query: string,
    type: string,
    limit = 20,
  ): Promise<{
    tracks?: {
      items?: Array<{
        id: string;
        name: string;
        duration_ms: number;
        artists?: Array<{ name: string }>;
        album?: { name: string; images?: Array<{ url: string }> };
        external_urls?: { spotify?: string };
      }>;
    };
  }> {
    const params = new URLSearchParams({ q: query, type, limit: limit.toString() });
    return this.request(`/search?${params}`);
  }
}
