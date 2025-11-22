import type { TranscodeFormat } from '@melody-manager/shared';
import type { Context } from 'hono';

interface StreamHandlerOptions {
  sourceUrl: string;
  trackId?: string;
  transcodeFormat?: TranscodeFormat;
  startTime?: number;
  endTime?: number;
  cookies?: string;
}

export type StreamHandler = (c: Context, options: StreamHandlerOptions) => Promise<Response>;
