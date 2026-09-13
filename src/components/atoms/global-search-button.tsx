import { Search, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchExperience } from '@/components/search/search-experience';
import { useCommandDialog } from '@/hooks/use-command-dialog';

// The palette and /search are the same search in two shells: a floating panel
// here, the page there. Only the chrome differs, content and behaviour live in
// SearchExperience so a feature added to one is never missing from the other.
export function GlobalSearchButton() {
  const { t } = useTranslation();
  const { open, setOpen } = useCommandDialog('k');

  // On the document, not on the panel: the close button and the backdrop sit
  // outside the container that handles its own keys, and the footer promises
  // that Escape closes the overlay from anywhere in it.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[60px] px-5 animate-in fade-in duration-150" role="dialog" aria-modal="true">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[8px]" onClick={() => setOpen(false)} />

      <div className="relative flex max-h-[80vh] w-full max-w-[720px] lg:max-w-[900px] xl:max-w-[1100px] flex-col overflow-hidden rounded-xl border border-primary-border bg-card shadow-[0_30px_80px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-4 duration-200">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold">
            <Search className="h-3.5 w-3.5" />
            {t('AppSidebar.search')}
          </span>
          <button type="button" className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted/50 hover:text-foreground" onClick={() => setOpen(false)} aria-label={t('GlobalSearch.close')}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SearchExperience variant="overlay" onNavigate={() => setOpen(false)} />
        </div>

        <div className="flex gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> {t('GlobalSearch.navigate')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd> {t('GlobalSearch.open')}
          </span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd> {t('GlobalSearch.close')}
          </span>
        </div>
      </div>
    </div>
  );
}
