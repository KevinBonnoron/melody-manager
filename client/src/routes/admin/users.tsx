import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useUsers } from '@/hooks/use-users';
import { adminGuard } from '@/lib/admin-guard';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { users, loading } = useUsers();

  if (loading) {
    return <p className="text-muted-foreground text-sm">{t('Admin.usersLoading')}</p>;
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-medium">{user.name || user.email}</p>
            {user.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
          </div>
          <span className="text-xs text-muted-foreground">{user.role}</span>
        </div>
      ))}
    </div>
  );
}
