import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/components/home/home-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <HomePage />;
}
