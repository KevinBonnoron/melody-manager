import type { TFunction } from 'i18next';
import { Folder, Music2, Speaker } from 'lucide-react';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'checkbox';
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface ProviderInfo {
  title: string;
  description: string;
  icon: typeof Folder;
  fields?: FieldConfig[];
  isAutoDiscovery?: boolean;
  discoveryHelp?: string;
}

export function getProviderInfo(t: TFunction): Record<string, ProviderInfo> {
  return {
    local: {
      title: t('ProviderCard.local.title'),
      description: t('ProviderCard.local.description'),
      icon: Folder,
      fields: [
        {
          key: 'path',
          label: t('ProviderCard.local.fields.path.label'),
          type: 'text',
          placeholder: '/home/user/Music',
          help: t('ProviderCard.local.fields.path.help'),
          required: true,
        },
      ],
    },
    youtube: {
      title: t('ProviderCard.youtube.title'),
      description: t('ProviderCard.youtube.description'),
      icon: Music2,
      fields: [
        {
          key: 'splitChapters',
          label: t('ProviderCard.youtube.fields.splitChapters.label'),
          type: 'checkbox',
          help: t('ProviderCard.youtube.fields.splitChapters.help'),
        },
      ],
    },
    soundcloud: {
      title: t('ProviderCard.soundcloud.title'),
      description: t('ProviderCard.soundcloud.description'),
      icon: Music2,
      fields: [],
    },
    spotify: {
      title: t('ProviderCard.spotify.title'),
      description: t('ProviderCard.spotify.description'),
      icon: Music2,
      fields: [
        { key: 'clientId', label: t('ProviderCard.spotify.fields.clientId.label'), type: 'text', placeholder: t('ProviderCard.spotify.fields.clientId.placeholder'), help: t('ProviderCard.spotify.fields.clientId.help'), required: true },
        {
          key: 'clientSecret',
          label: t('ProviderCard.spotify.fields.clientSecret.label'),
          type: 'password',
          placeholder: t('ProviderCard.spotify.fields.clientSecret.placeholder'),
          help: t('ProviderCard.spotify.fields.clientSecret.help'),
          required: true,
        },
      ],
    },
    bandcamp: {
      title: t('ProviderCard.bandcamp.title'),
      description: t('ProviderCard.bandcamp.description'),
      icon: Music2,
      fields: [
        {
          key: 'cookies',
          label: t('ProviderCard.bandcamp.fields.cookies.label'),
          type: 'textarea',
          placeholder: '# Netscape HTTP Cookie File\n.bandcamp.com\tTRUE\t/\tTRUE\t...',
          help: t('ProviderCard.bandcamp.fields.cookies.help'),
          required: true,
        },
      ],
    },
    sonos: {
      title: t('ProviderCard.sonos.title'),
      description: t('ProviderCard.sonos.description'),
      icon: Speaker,
      isAutoDiscovery: true,
      discoveryHelp: t('ProviderCard.sonos.discoveryHelp'),
    },
  };
}
