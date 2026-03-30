import type { ConfigSchemaItem, PluginManifest } from '@melody-manager/shared';
import type { TFunction } from 'i18next';
import { HardDrive, type LucideIcon, Music2, Speaker } from 'lucide-react';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'checkbox' | 'number';
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface ProviderInfo {
  title: string;
  description: string;
  icon: LucideIcon;
  fields?: FieldConfig[];
  connectionFields?: FieldConfig[];
  isAutoDiscovery?: boolean;
  discoveryHelp?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  'hard-drive': HardDrive,
  speaker: Speaker,
};

function mapSchemaTypeToFieldType(schema: ConfigSchemaItem): FieldConfig['type'] {
  if (schema.type === 'boolean') {
    return 'checkbox';
  }
  if (schema.type === 'secret') {
    return 'password';
  }
  if (schema.type === 'textarea' || schema.type === 'string-list') {
    return 'textarea';
  }
  if (schema.type === 'number') {
    return 'number';
  }
  return 'text';
}

function resolveI18n(t: TFunction, key: string, fallback: string | undefined): string {
  const translated = t(key, { defaultValue: '' });
  if (translated && translated !== key && translated !== '') {
    return translated;
  }
  return fallback ?? '';
}

function buildFieldsFromSchema(t: TFunction, manifest: PluginManifest, schema: ConfigSchemaItem[]): FieldConfig[] {
  return schema.map((item) => ({
    key: item.name,
    label: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${item.name}.label`, item.label),
    type: mapSchemaTypeToFieldType(item),
    placeholder: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${item.name}.placeholder`, item.placeholder) || undefined,
    help: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${item.name}.help`, item.description) || undefined,
    required: item.required,
  }));
}

export function getProviderInfoFromManifests(t: TFunction, manifests: PluginManifest[]): Record<string, ProviderInfo> {
  const result: Record<string, ProviderInfo> = {};

  for (const manifest of manifests) {
    const isDevice = manifest.features.includes('device');

    result[manifest.id] = {
      title: resolveI18n(t, `ProviderCard.${manifest.id}.title`, manifest.name),
      description: resolveI18n(t, `ProviderCard.${manifest.id}.description`, manifest.description),
      icon: (manifest.icon ? ICON_MAP[manifest.icon] : undefined) ?? (isDevice ? Speaker : Music2),
      fields: manifest.configSchema ? buildFieldsFromSchema(t, manifest, manifest.configSchema) : [],
      connectionFields: manifest.connectionSchema ? buildFieldsFromSchema(t, manifest, manifest.connectionSchema) : undefined,
      isAutoDiscovery: isDevice && !manifest.configSchema?.length && !manifest.connectionSchema?.length,
      discoveryHelp: isDevice ? resolveI18n(t, `ProviderCard.${manifest.id}.discoveryHelp`, undefined) : undefined,
    };
  }

  return result;
}
