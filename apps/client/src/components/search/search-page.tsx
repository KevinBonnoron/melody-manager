import { SearchExperience } from './search-experience';

export function SearchPage({ initialQuery }: { initialQuery?: string }) {
  return <SearchExperience variant="page" initialQuery={initialQuery} />;
}
