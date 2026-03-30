import { createFileRoute } from '@tanstack/react-router';
import { ConnectionList } from '@/components/providers/connection-list';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/providers/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <ConnectionList />;
}
