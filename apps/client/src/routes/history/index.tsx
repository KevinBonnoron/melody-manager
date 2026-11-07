import { createFileRoute } from '@tanstack/react-router';
import { HistoryPage } from '@/components/history/history-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/history/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <HistoryPage />;
}
