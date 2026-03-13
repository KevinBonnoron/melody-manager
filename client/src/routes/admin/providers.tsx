import { ProviderList } from '@/components/providers/provider-list';
import { adminGuard } from '@/lib/admin-guard';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/admin/providers')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div>
      <ProviderList title={t('Admin.providersTitle')} description={t('Admin.providersDescription')} />
    </div>
  );
}
