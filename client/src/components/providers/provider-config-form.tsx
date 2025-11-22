import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DeviceProviderType, TrackProviderType } from '@melody-manager/shared';
import { useForm } from '@tanstack/react-form';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getProviderInfo } from './provider-info';

export type ConfigFormData = Record<string, string | boolean>;

type Props = {
  type: TrackProviderType | DeviceProviderType;
  initialConfig: ConfigFormData;
  onSubmit: (value: ConfigFormData) => void | Promise<void>;
  onAdd?: () => void | Promise<void>;
  onCancel?: () => void;
  isEdit?: boolean;
  isConnected?: boolean;
};

export function ProviderConfigForm(props: Props) {
  const { type, initialConfig, onSubmit, onAdd, onCancel, isEdit = false, isConnected = false } = props;
  const { t } = useTranslation();
  const providerInfo = getProviderInfo(t);
  const info = providerInfo[type] ?? null;

  const requiredKeys = info?.fields?.filter((f) => f.required && f.type !== 'checkbox').map((f) => f.key) ?? [];

  const form = useForm({
    defaultValues: initialConfig,
    validators: {
      onSubmit: ({ value }) => {
        const val = value as ConfigFormData;
        const errors: Partial<Record<string, string>> = {};
        for (const key of requiredKeys) {
          const v = val[key];
          const str = typeof v === 'string' ? v.trim() : '';
          if (!str) errors[key] = t('forms.errors.required');
        }
        if (Object.keys(errors).length > 0) {
          toast.error(t('ProviderCardActions.validationError'));
          return errors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value as ConfigFormData);
    },
  });

  useEffect(() => {
    form.reset(initialConfig);
  }, [initialConfig, type]);

  if (!info) {
    return null;
  }

  const formId = isEdit ? `edit-${type}` : `create-${type}`;

  if (info.isAutoDiscovery && onAdd) {
    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          <p className="mb-4">{info.discoveryHelp}</p>
          <div className="bg-muted/50 rounded-lg space-y-2 rounded-lg p-4">
            <p className="font-medium">{t('ProviderCardActions.networkRequirements')}</p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>{t('ProviderCardActions.sonosRequirement1')}</li>
              <li>{t('ProviderCardActions.sonosRequirement2')}</li>
              <li>{t('ProviderCardActions.sonosRequirement3')}</li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              {t('Admin.addProviderCancel')}
            </Button>
          )}
          <Button onClick={() => onAdd()}>{t('ProviderCardActions.add')}</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      {info.fields?.map((field) =>
        field.type === 'checkbox' ? (
          <form.Field key={field.key} name={field.key as keyof ConfigFormData}>
            {(fieldApi) => (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id={`${type}-${field.key}-${formId}`} checked={!!fieldApi.state.value} onCheckedChange={(checked) => fieldApi.handleChange(!!checked)} />
                  <Label htmlFor={`${type}-${field.key}-${formId}`} className="cursor-pointer">
                    {field.label}
                  </Label>
                </div>
                {field.help && <p className="text-muted-foreground text-xs">{field.help}</p>}
              </div>
            )}
          </form.Field>
        ) : (
          <form.Field key={field.key} name={field.key as keyof ConfigFormData}>
            {(fieldApi) => (
              <div className="space-y-2">
                <Label htmlFor={`${type}-${field.key}-${formId}`}>{field.label}</Label>
                {(() => {
                  const hasError = fieldApi.state.meta.errors.length > 0;
                  return (
                    <>
                      {field.type === 'textarea' ? (
                        <Textarea
                          id={`${type}-${field.key}-${formId}`}
                          placeholder={field.placeholder}
                          value={(fieldApi.state.value as string) ?? ''}
                          onChange={(e) => fieldApi.handleChange(e.target.value)}
                          onBlur={fieldApi.handleBlur}
                          className={cn('field-sizing-fixed min-h-0 font-mono', hasError && 'border-destructive ring-destructive/20')}
                          rows={10}
                          aria-invalid={hasError}
                        />
                      ) : (
                        <Input
                          id={`${type}-${field.key}-${formId}`}
                          type={field.type}
                          placeholder={field.placeholder}
                          value={(fieldApi.state.value as string) ?? ''}
                          onChange={(e) => fieldApi.handleChange(e.target.value)}
                          onBlur={fieldApi.handleBlur}
                          className={cn(hasError && 'border-destructive ring-destructive/20')}
                          aria-invalid={hasError}
                        />
                      )}
                      {hasError && <p className="text-destructive text-xs">{typeof fieldApi.state.meta.errors[0] === 'string' ? fieldApi.state.meta.errors[0] : String((fieldApi.state.meta.errors[0] as { message?: string } | undefined)?.message ?? fieldApi.state.meta.errors[0])}</p>}
                      {field.help && !hasError && <p className="text-muted-foreground text-xs">{field.help}</p>}
                    </>
                  );
                })()}
              </div>
            )}
          </form.Field>
        ),
      )}

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Admin.addProviderCancel')}
          </Button>
        )}
        <form.Subscribe
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ isSubmitting }) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('ProviderCardActions.saving') : !isEdit ? t('ProviderCardActions.add') : isConnected ? t('ProviderCardActions.update') : t('ProviderCardActions.connect')}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
