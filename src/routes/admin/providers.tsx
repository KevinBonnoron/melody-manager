import { createFileRoute } from '@tanstack/react-router';
import { AdminProviderList } from '@/components/providers/admin-provider-list';
import { adminGuard } from '@/lib/admin-guard';

export const Route = createFileRoute('/admin/providers')({
  beforeLoad: adminGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminProviderList />;
}
