import type { Device, Track } from '@melody-manager/shared';

export function buildStreamUrl(track: Track, device: Device, baseUrl: string): string {
  let url = `${baseUrl}/api/tracks/stream/${track.id}`;

  // Sonos requires specific formats. Transcode FLAC, WebM, and unknown formats to WAV
  if (device.type === 'sonos') {
    url += '?transcode=mp3';
  }

  return url;
}

export function getMimeType(track: Track, device: Device): string {
  const format = track.metadata?.format;

  if (device.type === 'sonos') {
    return 'audio/mpeg';
  }

  const formatToMime: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
  };

  return formatToMime[format || ''] || 'audio/mpeg';
}
