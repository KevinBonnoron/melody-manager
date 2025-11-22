export const transcodeConfigs = {
  mp3: {
    mimeType: 'audio/mpeg',
    ffmpegArgs: ['-f', 'mp3', '-ab', '320k', '-ar', '44100', '-ac', '2'],
  },
  wav: {
    mimeType: 'audio/wav',
    ffmpegArgs: ['-f', 'wav', '-ar', '44100', '-ac', '2'],
  },
  flac: {
    mimeType: 'audio/flac',
    ffmpegArgs: ['-f', 'flac', '-compression_level', '5'],
  },
  aac: {
    mimeType: 'audio/aac',
    ffmpegArgs: ['-f', 'adts', '-c:a', 'aac', '-b:a', '256k'],
  },
} as const;

export const transcodeFormats = Object.keys(transcodeConfigs) as [keyof typeof transcodeConfigs];
