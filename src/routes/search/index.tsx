import { createFileRoute } from '@tanstack/react-router';
import { SearchPage } from '@/components/search/search-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/search/')({
  // The palette hands its query over in the address, so arriving on the page
  // continues the search instead of starting it again.
  validateSearch: (search: Record<string, unknown>): { q?: string } => (typeof search.q === 'string' && search.q ? { q: search.q } : {}),
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { q } = Route.useSearch();
  return <SearchPage initialQuery={q} />;
}
