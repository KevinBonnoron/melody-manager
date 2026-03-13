import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/components/admin/admin-page';
import { adminGuard } from '@/lib/admin-guard';

export const Route = createFileRoute('/admin/')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminPage />;
}
