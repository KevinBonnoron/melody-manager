import { createFileRoute } from '@tanstack/react-router';
import { SourcePage } from '@/components/sources/source-page';
import { authGuard } from '@/lib/auth-guard';

export type SourceTab = 'all' | 'artists' | 'albums' | 'tracks';
const TABS: SourceTab[] = ['all', 'artists', 'albums', 'tracks'];

export interface SourceSearch {
  tab?: SourceTab;
}

export const Route = createFileRoute('/sources/$type')({
  beforeLoad: authGuard,
  validateSearch: (search: Record<string, unknown>): SourceSearch => ({
    tab: TABS.includes(search.tab as SourceTab) && search.tab !== 'all' ? (search.tab as SourceTab) : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { type } = Route.useParams();
  return <SourcePage type={type} />;
}
