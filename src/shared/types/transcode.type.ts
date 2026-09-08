import type { transcodeConfigs } from '../configs/transcode.config';

export type TranscodeFormat = keyof typeof transcodeConfigs;
