import * as SwitchPrimitive from '@radix-ui/react-switch';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-white/10',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="pointer-events-none block size-3.5 translate-x-[3px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
