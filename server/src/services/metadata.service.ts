import { parseFile } from 'music-metadata';
import { logger } from '../lib/logger';

interface AudioMetadata {
  title?: string;
  artists: string[];
  album?: string;
  year?: number;
  genres?: string[];
  duration?: number;
  bitrate?: number;
  format?: string;
  coverImage?: {
    data: Buffer;
    format: string;
  };
}

class MetadataService {
  async extractMetadata(filePath: string): Promise<AudioMetadata> {
    try {
      const metadata = await parseFile(filePath);
      const artists = metadata.common.artist ? metadata.common.artist.split(/;|&|feat\.|ft\.|and/).map((artist) => artist.trim()) : [];
      if (metadata.common.albumartist && !artists.includes(metadata.common.albumartist)) {
        artists.unshift(metadata.common.albumartist);
      }

      const genres = (metadata.common.genre ?? [])
        .flatMap((genre) => genre.split(/;|\//))
        .flatMap((genre) => {
          return genre
            .trim()
            .split(/(?=[A-Z][a-z])/)
            .filter((g) => g.length > 0)
            .map((g) => g.trim())
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
        })
        .filter((genre, index, self) => self.indexOf(genre) === index);

      let coverImage: AudioMetadata['coverImage'];
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        if (picture) {
          coverImage = {
            data: Buffer.from(picture.data),
            format: picture.format,
          };
        }
      }

      const format = metadata.format.container?.toLowerCase();
      return {
        title: metadata.common.title,
        artists,
        album: metadata.common.album,
        year: metadata.common.year,
        genres,
        duration: metadata.format.duration,
        bitrate: metadata.format.bitrate,
        format,
        coverImage,
      };
    } catch (error) {
      logger.error(`Error extracting metadata from file: ${filePath} ${error}`);
      return { artists: [] };
    }
  }
}

export const metadataService = new MetadataService();
