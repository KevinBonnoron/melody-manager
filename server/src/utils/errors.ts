import type { ProviderAuthErrorCode } from '@melody-manager/shared';

export type { ProviderAuthErrorCode };

export class ProviderAuthError extends Error {
  public readonly code: ProviderAuthErrorCode;
  public readonly provider: string;

  public constructor(code: ProviderAuthErrorCode, provider: string, message: string) {
    super(message);
    this.name = 'ProviderAuthError';
    this.code = code;
    this.provider = provider;
  }
}
