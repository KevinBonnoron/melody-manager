import { createFileRoute } from '@tanstack/react-router';
import { ProviderList } from '@/components/providers/provider-list';
import { adminGuard } from '@/lib/admin-guard';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/admin/providers')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="pb-32">
      <ProviderList title={t('Admin.providersTitle')} description={t('Admin.providersDescription')} />
    </div>
  );
}
