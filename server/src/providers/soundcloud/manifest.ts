import type { PluginManifest } from '@melody-manager/shared';

export const soundcloudManifest: PluginManifest = {
  id: 'soundcloud',
  name: 'SoundCloud',
  description: 'Search, stream and import music from SoundCloud',
  version: '1.0.0',
  icon: 'soundcloud',
  entry: '',
  scope: 'personal',
  features: ['search', 'stream', 'import'],
  searchTypes: ['track'],
  importTypes: ['track'],
  urlPatterns: ['soundcloud.com', 'soundcloud:'],
};
