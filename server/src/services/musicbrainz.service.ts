const USER_AGENT = 'MelodyManager/0.0.1 (https://github.com/melody-manager)';
const MIN_INTERVAL_MS = 1100;
const MB_BASE = 'https://musicbrainz.org/ws/2';

class MusicBrainzClient {
  private lastRequestTime = 0;

  private async rateLimitedFetch(url: string): Promise<Response | null> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
    try {
      return await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } catch {
      return null;
    }
  }

  public async searchRelease(albumName: string, artistName: string): Promise<{ mbid: string; year?: number } | null> {
    const query = encodeURIComponent(`release:"${albumName}" AND artist:"${artistName}"`);
    const res = await this.rateLimitedFetch(`${MB_BASE}/release/?query=${query}&fmt=json&limit=1`);
    if (!res?.ok) {
      return null;
    }

    try {
      const data = (await res.json()) as { releases?: { id: string; date?: string }[] };
      const release = data.releases?.[0];
      if (!release) {
        return null;
      }
      const year = release.date ? Number.parseInt(release.date.slice(0, 4), 10) : undefined;
      return { mbid: release.id, year: year && !Number.isNaN(year) ? year : undefined };
    } catch {
      return null;
    }
  }

  public async getCoverArtUrl(releaseMbid: string): Promise<string | null> {
    // Cover Art Archive redirects to the actual image URL
    const res = await this.rateLimitedFetch(`https://coverartarchive.org/release/${releaseMbid}/front-250`);
    if (!res?.ok) {
      return null;
    }
    return res.url;
  }

  public async searchArtist(artistName: string): Promise<{ mbid: string; wikidataId?: string } | null> {
    // Try exact match first, then fall back to loose search (handles aliases, accents, etc.)
    const exactQuery = encodeURIComponent(`artist:"${artistName}"`);
    let res = await this.rateLimitedFetch(`${MB_BASE}/artist/?query=${exactQuery}&fmt=json&limit=1`);

    let data: { artists?: { id: string; score?: number }[] } | null = null;
    if (res?.ok) {
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = null;
      }
    }

    if (!data?.artists?.length) {
      const looseQuery = encodeURIComponent(artistName);
      res = await this.rateLimitedFetch(`${MB_BASE}/artist/?query=${looseQuery}&fmt=json&limit=1`);
      if (res?.ok) {
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = null;
        }
      }
    }

    try {
      const artist = data?.artists?.[0];
      if (!artist || (artist.score !== undefined && artist.score < 80)) {
        return null;
      }

      // Try to find wikidata relation in the search results (not always present)
      // We'll fetch the full artist record with relations to be sure
      const detailRes = await this.rateLimitedFetch(`${MB_BASE}/artist/${artist.id}?inc=url-rels&fmt=json`);
      if (!detailRes?.ok) {
        return { mbid: artist.id };
      }

      const detail = (await detailRes.json()) as { id: string; relations?: { type: string; url?: { resource: string } }[] };
      const wikidataRel = detail.relations?.find((r) => r.type === 'wikidata');
      const wikidataUrl = wikidataRel?.url?.resource;
      const wikidataId = wikidataUrl?.match(/\/(Q\d+)$/)?.[1];

      return { mbid: artist.id, wikidataId };
    } catch {
      return null;
    }
  }

  public async getArtistImageUrl(wikidataId: string): Promise<string | null> {
    try {
      const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as {
        entities?: Record<string, { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>;
      };
      const entity = data.entities?.[wikidataId];
      const imageFilename = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (!imageFilename) {
        return null;
      }

      // Construct Wikimedia Commons thumbnail URL
      const normalized = imageFilename.replace(/ /g, '_');
      const hash = new Bun.CryptoHasher('md5').update(normalized).digest('hex');
      return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash[0]}${hash[1]}/${normalized}/250px-${normalized}`;
    } catch {
      return null;
    }
  }
}

export const musicBrainzClient = new MusicBrainzClient();
