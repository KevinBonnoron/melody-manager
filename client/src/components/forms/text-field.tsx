import { useFieldContext } from '@/lib/forms';
import { useStore } from '@tanstack/react-form';
import { useId } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface TextFieldProps {
  label: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time' | 'datetime-local' | 'month' | 'week';
  placeholder?: string;
  autoComplete?: string;
  suffix?: React.ReactNode;
  className?: string;
}

export function TextField({ label, type = 'text', placeholder = '', autoComplete = 'off', suffix, className }: TextFieldProps) {
  const inputId = useId();
  const field = useFieldContext<string>();
  const hasError = useStore(field.store, (state) => state.meta.isTouched && state.meta.errors.length > 0);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <Input id={inputId} type={type} value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value)} onBlur={() => field.handleBlur()} placeholder={placeholder} autoComplete={autoComplete} className={`text-lg px-4 ${suffix ? 'pr-12' : ''} ${className ?? ''}`} />
          {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>}
        </div>
      </div>
      {hasError && <p className="text-sm text-red-500 dark:text-red-400">{typeof field.state.meta.errors[0] === 'string' ? field.state.meta.errors[0] : field.state.meta.errors[0].message}</p>}
    </div>
  );
}
