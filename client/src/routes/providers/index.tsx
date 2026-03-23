import { ProviderList } from '@/components/providers/provider-list';
import { authGuard } from '@/lib/auth-guard';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/providers/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <ProviderList />
    </div>
  );
}
