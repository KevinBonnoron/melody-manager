import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useFormContext } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useStore } from '@tanstack/react-form';

export interface Props {
  label: string;
  className?: string;
  disabled?: boolean;
}

export function SubmitButton({ label, className, disabled }: Props) {
  const form = useFormContext();
  const { canSubmit, isSubmitting } = useStore(form.store, (state) => ({
    canSubmit: state.isValid,
    isSubmitting: state.isSubmitting,
  }));

  return (
    <Button type="submit" variant={'default'} disabled={isSubmitting || !canSubmit || disabled} className={cn('flex items-center gap-2 w-full', className)}>
      {isSubmitting && <Spinner />}
      <span>{label}</span>
    </Button>
  );
}
