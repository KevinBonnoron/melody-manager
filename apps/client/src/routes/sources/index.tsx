import { createFileRoute } from '@tanstack/react-router';
import { SourcesPage } from '@/components/sources/sources-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/sources/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <SourcesPage />;
}
