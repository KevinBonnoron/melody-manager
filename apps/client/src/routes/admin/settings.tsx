import { createFileRoute } from '@tanstack/react-router';
import { AdminSettings } from '@/components/admin/admin-settings';
import { adminGuard } from '@/lib/admin-guard';

export const Route = createFileRoute('/admin/settings')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminSettings />;
}
