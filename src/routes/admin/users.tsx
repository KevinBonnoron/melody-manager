import { createFileRoute } from '@tanstack/react-router';
import { AdminUsers } from '@/components/admin/admin-users';
import { adminGuard } from '@/lib/admin-guard';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminUsers />;
}
