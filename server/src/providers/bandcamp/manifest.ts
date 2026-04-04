import type { PluginManifest } from '@melody-manager/shared';

export const bandcampManifest: PluginManifest = {
  id: 'bandcamp',
  name: 'Bandcamp',
  description: 'Stream music from Bandcamp',
  version: '1.1.0',
  icon: 'bandcamp',
  entry: '',
  scope: 'personal',
  features: ['stream', 'import'],
  importTypes: ['track', 'album', 'artist'],
  urlPatterns: ['bandcamp.com', 'bandcamp:'],
};
