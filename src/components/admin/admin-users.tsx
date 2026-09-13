import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Pencil, Trash2, User as UserIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { userCollection } from '@/collections/user.collection';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useUsers } from '@/hooks/use-users';
import { config } from '@/lib/config';
import type { User } from '@/shared';
import { EditUserDialog } from './edit-user-dialog';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AdminUsers() {
  const { t, i18n } = useTranslation();
  const me = useAuthUser();
  const { users, isLoading } = useUsers();
  const [pending, setPending] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);

  const columns = useMemo<Array<ColumnDef<User>>>(
    () => [
      {
        id: 'account',
        header: () => t('Admin.account'),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                {user.avatar && <AvatarImage src={`${config.pb.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}`} alt={user.name || user.email} />}
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs">{user.name ? getInitials(user.name) : <UserIcon className="h-4 w-4" />}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {user.name || user.email}
                  {user.id === me.id && <span className="ml-2 text-[11px] text-muted-foreground">{t('Admin.you')}</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'role',
        header: () => t('Admin.role'),
        size: 140,
        cell: ({ row }) => {
          const isAdmin = row.original.role === 'admin';
          return <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] ${isAdmin ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground'}`}>{isAdmin ? t('Admin.roleAdmin') : t('Admin.roleUser')}</span>;
        },
      },
      {
        id: 'created',
        header: () => t('Admin.memberSince'),
        size: 140,
        cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{new Date(row.original.created).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' })}</span>,
      },
      {
        id: 'actions',
        header: () => t('Admin.actions'),
        size: 108,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(user)} aria-label={t('Admin.editUser')}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={user.id === me.id} onClick={() => setPending(user)} aria-label={t('Admin.deleteUser')}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, i18n.language, me.id],
  );

  const table = useReactTable({ data: users, columns, getCoreRowModel: getCoreRowModel() });

  // Only the very first load has nothing to show. Hiding the table on every
  // refresh is what made it blink after each change.
  if (isLoading && users.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('Admin.usersLoading')}</p>;
  }

  const deleteUser = async () => {
    if (!pending) {
      return;
    }

    const name = pending.name || pending.email;
    setPending(null);
    try {
      // The server refuses to delete the last administrator, and that refusal
      // only arrives once the deletion has been sent.
      await userCollection.delete(pending.id).isPersisted.promise;
      toast.success(t('Admin.userDeleted', { name }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('Admin.userDeleteError'));
    }
  };

  return (
    <div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  // The account column takes what the others leave: sized ones
                  // first, so a long address cannot push the rest off screen.
                  <TableHead key={header.id} style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined} className={header.column.id === 'actions' ? 'text-right' : undefined}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="h-16">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.id === 'account' ? 'min-w-0' : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Admin.deleteUser')}</DialogTitle>
            <DialogDescription>{t('Admin.deleteUserDescription', { name: pending?.name || pending?.email })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t('AlbumActionsMenu.cancel')}
            </Button>
            <Button variant="destructive" onClick={deleteUser}>
              {t('Admin.deleteUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditUserDialog user={editing} isSelf={editing?.id === me.id} onOpenChange={(open) => !open && setEditing(null)} />
    </div>
  );
}
