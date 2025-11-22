import type { ConfigSchemaItem, PluginManifest } from '@melody-manager/shared';
import type { TFunction } from 'i18next';
import { Folder, type LucideIcon, Music2, Speaker } from 'lucide-react';

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
  isAutoDiscovery?: boolean;
  discoveryHelp?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
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

function buildFieldsFromSchema(t: TFunction, manifest: PluginManifest): FieldConfig[] {
  if (!manifest.configSchema) {
    return [];
  }
  return manifest.configSchema.map((schema) => ({
    key: schema.name,
    label: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${schema.name}.label`, schema.label),
    type: mapSchemaTypeToFieldType(schema),
    placeholder: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${schema.name}.placeholder`, schema.placeholder) || undefined,
    help: resolveI18n(t, `ProviderCard.${manifest.id}.fields.${schema.name}.help`, schema.description) || undefined,
    required: schema.required,
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
      fields: buildFieldsFromSchema(t, manifest),
      isAutoDiscovery: isDevice && !manifest.configSchema?.length,
      discoveryHelp: isDevice ? resolveI18n(t, `ProviderCard.${manifest.id}.discoveryHelp`, undefined) : undefined,
    };
  }

  return result;
}
