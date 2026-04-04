import type { ProviderGrant } from '@melody-manager/shared';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerGrantsCollection } from '@/collections/provider-grants.collection';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUsers } from '@/hooks/use-users';
import { Button } from '../ui/button';

interface Props {
  providerId: string;
}

export function ProviderGrantsManager({ providerId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { users, loading } = useUsers({ enabled: open });
  const { data: grants = [] } = useLiveQuery((q) => q.from({ grants: providerGrantsCollection }).where(({ grants }) => eq(grants.provider, providerId)), [providerId]);
  const grantedUserIds = new Set(grants.map((g) => g.user));
  const handleToggle = (userId: string, currentlyGranted: boolean) => {
    try {
      if (currentlyGranted) {
        const grant = grants.find((g) => g.user === userId);
        if (grant) {
          providerGrantsCollection.delete(grant.id);
        }
      } else {
        providerGrantsCollection.insert({
          id: crypto.randomUUID(),
          provider: providerId,
          user: userId,
        } as ProviderGrant);
      }
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderGrants.saveError'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Users className="h-3.5 w-3.5 xl:mr-1.5" />
          <span className="hidden xl:inline">{t('ProviderGrants.manageAccess')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ProviderGrants.title')}</DialogTitle>
          <DialogDescription>{t('ProviderGrants.description')}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          {loading ? (
            <p className="text-muted-foreground text-sm">{t('ProviderGrants.loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('ProviderGrants.noUsers')}</p>
          ) : (
            users.map((user) => {
              const granted = grantedUserIds.has(user.id);
              const checkboxId = `grant-${user.id}`;
              return (
                <label key={user.id} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent">
                  <Checkbox id={checkboxId} checked={granted} onCheckedChange={() => handleToggle(user.id, granted)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name || user.email}</p>
                    {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
