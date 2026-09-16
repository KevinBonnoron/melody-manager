import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  title: string;
  description: string;
  label: string;
  current: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => Promise<void>;
}

export function RenameDialog({ title, description, label, current, open, onOpenChange, onRename }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(current);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(current);
    }
  }, [open, current]);

  const submit = async () => {
    const next = name.trim();
    if (!next || next === current) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      await onRename(next);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('RenameDialog.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="mt-2 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label htmlFor="rename-input">{label}</Label>
          <Input id="rename-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('RenameDialog.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? t('RenameDialog.saving') : t('RenameDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
