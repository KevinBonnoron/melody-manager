import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/components/library/library-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/library/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <LibraryPage />;
}
