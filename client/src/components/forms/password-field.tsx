import { useFieldContext } from '@/lib/forms';
import { useStore } from '@tanstack/react-form';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface PasswordFieldProps {
  label: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  labelAction?: React.ReactNode;
}

export function PasswordField({ label, placeholder = '', autoComplete = 'off', className, labelAction }: PasswordFieldProps) {
  const inputId = useId();
  const field = useFieldContext<string>();
  const hasError = useStore(field.store, (state) => state.meta.isTouched && state.meta.errors.length > 0);
  const [showPassword, setShowPassword] = useState(false);

  function handleTogglePassword(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setShowPassword(!showPassword);
  }

  const toggleIcon = (
    <button type="button" onClick={handleTogglePassword} className="text-gray-500 dark:text-gray-400 transition-colors flex items-center justify-center" tabIndex={-1}>
      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {label && (
          <div className="flex items-center justify-between">
            <Label htmlFor={inputId}>{label}</Label>
            {labelAction && <div>{labelAction}</div>}
          </div>
        )}
        <div className="relative">
          <Input id={inputId} type={showPassword ? 'text' : 'password'} value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value)} onBlur={() => field.handleBlur()} placeholder={placeholder} autoComplete={autoComplete} className={`text-lg px-4 pr-12 ${className ?? ''}`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{toggleIcon}</div>
        </div>
      </div>
      {hasError && <p className="text-sm text-red-500 dark:text-red-400">{typeof field.state.meta.errors[0] === 'string' ? field.state.meta.errors[0] : field.state.meta.errors[0].message}</p>}
    </div>
  );
}
