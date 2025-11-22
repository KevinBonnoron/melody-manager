import { FavoritesPage } from '@/components/favorites/favorites-page';
import { authGuard } from '@/lib/auth-guard';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/favorites/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <FavoritesPage />;
}
