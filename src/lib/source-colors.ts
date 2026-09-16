const SOURCE_COLORS: Record<string, string> = {
  local: '#9b6cff',
  youtube: '#ff3b3b',
  soundcloud: '#ff7a3d',
  spotify: '#1db954',
  apple: '#fa243c',
  deezer: '#a238ff',
  tidal: '#00d1d1',
  bandcamp: '#629aa9',
};

export function getSourceColor(type: string): string {
  return SOURCE_COLORS[type] ?? 'var(--primary)';
}
