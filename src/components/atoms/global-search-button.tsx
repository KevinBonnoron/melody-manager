import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SearchExperience } from '@/components/search/search-experience';
import { useCommandDialog } from '@/hooks/use-command-dialog';

// The palette and /search are the same search in two shells: a floating panel
// here, the page there. Only the chrome differs, content and behaviour live in
// SearchExperience so a feature added to one is never missing from the other.
export function GlobalSearchButton() {
  const { t } = useTranslation();
  const { open, setOpen } = useCommandDialog('k');

  // On Radix rather than a bare div with aria-modal: that attribute says a dialog
  // is modal, it does not make one. Tab reached the page behind the panel, and
  // Escape only worked where the inner container happened to be listening.
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[8px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150" />
        {/* The heading is the dialog's title rather than an aria-label beside it:
            Radix points the dialog at a title and a description, and naming it
            from the outside leaves the description reference dangling. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[60px] z-[200] flex max-h-[80vh] w-[calc(100%-2.5rem)] max-w-[720px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-primary-border bg-card shadow-[0_30px_80px_rgba(0,0,0,0.5)] motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:duration-200 lg:max-w-[900px] xl:max-w-[1100px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-muted-foreground">
            <DialogPrimitive.Title className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold">
              <Search className="h-3.5 w-3.5" />
              {t('AppSidebar.search')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted/50 hover:text-foreground" aria-label={t('GlobalSearch.close')}>
              <X className="h-3.5 w-3.5" />
            </DialogPrimitive.Close>
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
