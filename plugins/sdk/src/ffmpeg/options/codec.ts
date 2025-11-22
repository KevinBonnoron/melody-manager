/**
 * Video encoding presets for x264/x265 codecs
 * From fastest (lowest quality) to slowest (highest quality)
 */
export type VideoPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';

/**
 * VP8/VP9 encoding presets
 */
export type VpxPreset = 'realtime' | 'good' | 'best';

/**
 * All supported video encoding presets
 */
export type EncodingPreset = VideoPreset | VpxPreset;

export type Bitrate = `${number}k` | `${number}M` | `${number}G` | number;

interface BaseCodecOptions {
  codec: string;
  /** Bitrate (e.g., '320k', '192k', 320000) */
  bitrate?: Bitrate;
}

/**
 * Audio codec options
 */
export interface AudioCodecOptions extends BaseCodecOptions {
  type: 'audio';
}

/**
 * Video codec options
 */
export interface VideoCodecOptions extends BaseCodecOptions {
  type: 'video';
  /** Encoding preset (speed vs quality tradeoff) */
  preset?: EncodingPreset;
}

/**
 * Copy codec options (no re-encoding)
 */
export interface CopyCodecOptions {
  type: 'copy';
}

/**
 * Codec options (audio, video, or copy)
 */
export type CodecOptions = AudioCodecOptions | VideoCodecOptions | CopyCodecOptions;

export function serializeCodecOptions(options: CodecOptions): string[] {
  const args: string[] = [];

  if (options.type === 'copy') {
    args.push('-c', 'copy');
    return args;
  }

  const codecPrefix = options.type === 'audio' ? 'c:a' : 'c:v';
  const bitratePrefix = options.type === 'audio' ? 'b:a' : 'b:v';

  args.push(`-${codecPrefix}`, options.codec);

  if (options.bitrate) {
    args.push(`-${bitratePrefix}`, `${options.bitrate}`);
  }

  if (options.type === 'video' && options.preset) {
    args.push('-preset', options.preset);
  }

  return args;
}
