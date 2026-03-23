import { adminGuard } from '@/lib/admin-guard';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-xl font-semibold">{t('Admin.usersTitle')}</h2>
      <p className="text-muted-foreground">{t('Admin.usersDescription')}</p>
    </div>
  );
}
