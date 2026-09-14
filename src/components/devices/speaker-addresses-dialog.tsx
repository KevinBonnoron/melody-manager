import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerCollection } from '@/collections/provider.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDevices } from '@/hooks/use-devices';
import { type ConfiguredSpeaker, useSpeakers } from '@/hooks/use-speakers';
import { cn } from '@/lib/utils';
import type { Provider } from '@/shared';
import { isSpeakerAddress, withDiscovered } from './speaker-address';

interface Props {
  provider: Provider;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Configuring the source means saying how to reach it. Discovery is multicast
// and does not cross a bridged network, so a server in a container finds nothing
// and has to be told; what it does find lands in the same list.
//
// Not the manifest-driven form the other sources use: that renders a text field
// per setting, and this is a list, with a row to remove and a row to add. What
// it does share with them is that nothing is written until the button at the
// bottom is pressed.
export function SpeakerAddressesDialog({ provider, title, open, onOpenChange }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('DevicesPage.addressesDescription')}</DialogDescription>
        </DialogHeader>
        {/* Its own component so that closing the dialog unmounts it: what was
            typed and not saved goes with it, and opening again starts from what
            the server holds. */}
        {open && <SpeakerAddressesForm provider={provider} title={title} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SpeakerAddressesForm({ provider, title, onDone }: { provider: Provider; title: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { speakers, write } = useSpeakers(provider.type);
  const { speakers: live } = useDevices();
  const discovered = live.filter((d) => d.type === provider.type).map((d) => d.ipAddress);
  const answering = new Set(discovered);

  // Seeded with what is answering as well as what is saved, so configuring a
  // kind for the first time starts from the speakers already on the network
  // rather than from an empty list and a manual address.
  const [rows, setRows] = useState<ConfiguredSpeaker[]>(() => withDiscovered(speakers, discovered));
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const address = draft.trim();
  const valid = isSpeakerAddress(address);
  const duplicate = valid && rows.some((s) => s.address === address);

  const add = () => {
    if (!valid || duplicate) {
      return;
    }

    setRows([...rows, { address, enabled: true }]);
    setDraft('');
  };

  const submit = async () => {
    setSaving(true);
    try {
      // The speakers first, the switch after. Saying which speakers is what puts
      // the kind in service, and doing it the other way round leaves a kind in
      // service with nothing to play to if the write that mattered is the one
      // that fails.
      await write(rows);
      if (!provider.enabled) {
        await providerCollection.update(provider.id, (draft) => {
          draft.enabled = true;
        }).isPersisted.promise;
      }
      toast.success(t('ProviderCardActions.providerUpdatedSuccess', { title }));
      onDone();
    } catch (error) {
      console.error(error);
      toast.error(t('DevicesPage.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {rows.map((speaker) => {
          const found = answering.has(speaker.address);
          return (
            <li key={speaker.address} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', found ? 'bg-success shadow-[0_0_6px_var(--success)]' : 'bg-muted-foreground/50')} title={found ? t('DevicesPage.answering') : t('DevicesPage.silent')} />
              <span className={cn('min-w-0 flex-1 truncate font-mono text-[13px]', !speaker.enabled && 'text-muted-foreground line-through')}>{speaker.address}</span>
              <Switch checked={speaker.enabled} aria-label={t('DevicesPage.useSpeaker', { address: speaker.address })} onCheckedChange={(next) => setRows(rows.map((s) => (s.address === speaker.address ? { ...s, enabled: next } : s)))} />
              {/* Forgetting a speaker the server can see achieves nothing: the
                  next discovery pass puts it straight back. Saying not to use it
                  is what sticks, so that is the control left available. */}
              <span title={found ? t('DevicesPage.cannotForget') : undefined}>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={found} aria-label={t('DevicesPage.forget', { address: speaker.address })} onClick={() => setRows(rows.filter((s) => s.address !== speaker.address))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t('DevicesPage.noAddresses')}</p>}

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder={t('DevicesPage.addPlaceholder')}
            aria-label={t('DevicesPage.add')}
            aria-invalid={address.length > 0 && !valid}
            className="font-mono text-[13px]"
          />
          <Button type="button" variant="outline" disabled={!valid || duplicate} onClick={add} aria-label={t('DevicesPage.add')}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {address.length > 0 && !valid && <p className="text-destructive text-xs">{t('DevicesPage.notAnAddress')}</p>}
        {duplicate && <p className="text-muted-foreground text-xs">{t('DevicesPage.alreadyKnown')}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          {t('Admin.addProviderCancel')}
        </Button>
        <Button type="button" disabled={saving} onClick={submit}>
          {saving ? t('ProviderCardActions.saving') : t('ProviderCardActions.update')}
        </Button>
      </div>
    </div>
  );
}
