import { TextField, type TextFieldProps } from './text-field';

export interface EmailFieldProps extends Omit<TextFieldProps, 'type'> {}

export function EmailField({ ...props }: EmailFieldProps) {
  return <TextField type="email" {...props} />;
}
