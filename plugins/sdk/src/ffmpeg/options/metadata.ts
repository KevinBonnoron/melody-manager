export interface MetadataOptions {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  track?: string | number;
  date?: string;
  genre?: string;
  comment?: string;
  [key: string]: string | number | undefined;
}

export function serializeMetadata(metadata: MetadataOptions): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      args.push('-metadata', `${key}=${value}`);
    }
  }
  return args;
}
