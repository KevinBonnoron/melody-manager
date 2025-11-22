import { EmailField } from '@/components/forms/email-field';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';

export const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

export const { useAppForm } = createFormHook({
  fieldComponents: {
    EmailField,
    TextField,
    PasswordField,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});
