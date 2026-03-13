import { ffmpeg } from '@melody-manager/plugin-sdk';

export interface SilenceBoundaries {
  trimStart: number;
  trimEnd: number;
  duration: number;
}

export async function detectSilenceBoundaries(filePath: string, options?: { threshold?: number; minDuration?: number }): Promise<SilenceBoundaries> {
  const threshold = options?.threshold ?? -50;
  const minDuration = options?.minDuration ?? 0.3;

  const cmd = ffmpeg().input(filePath).audioFilter({ type: 'silencedetect', noise: threshold, duration: minDuration }).format('null').output('-');

  let stderr = '';
  await cmd.run({
    onStderr: (data) => {
      stderr += data.toString();
    },
  });

  // Parse file duration from FFmpeg output
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  let totalDuration = 0;
  if (durationMatch) {
    totalDuration = Number.parseInt(durationMatch[1], 10) * 3600 + Number.parseInt(durationMatch[2], 10) * 60 + Number.parseInt(durationMatch[3], 10) + Number.parseInt(durationMatch[4], 10) / 100;
  }

  // Parse silence regions from silencedetect filter output
  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];

  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      silenceStarts.push(Number.parseFloat(startMatch[1]));
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch) {
      silenceEnds.push(Number.parseFloat(endMatch[1]));
    }
  }

  let trimStart = 0;
  let trimEnd = 0;

  // Silence at start: first silence region starts at or near 0
  if (silenceStarts.length > 0 && silenceStarts[0] < 0.1 && silenceEnds.length > 0) {
    trimStart = silenceEnds[0];
  }

  // Silence at end: last silence_start without a matching silence_end means
  // silence extends to the end of the file
  if (silenceStarts.length > silenceEnds.length && totalDuration > 0) {
    const lastStart = silenceStarts[silenceStarts.length - 1];
    trimEnd = totalDuration - lastStart;
  } else if (silenceEnds.length > 0 && totalDuration > 0) {
    // Or last silence region ends at or near total duration
    const lastEnd = silenceEnds[silenceEnds.length - 1];
    if (Math.abs(lastEnd - totalDuration) < 0.5) {
      const lastStart = silenceStarts[silenceEnds.length - 1];
      if (lastStart !== undefined) {
        trimEnd = totalDuration - lastStart;
      }
    }
  }

  return { trimStart, trimEnd, duration: totalDuration };
}

export interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

export async function detectAllSilenceRegions(filePath: string, options?: { threshold?: number; minDuration?: number }): Promise<{ regions: SilenceRegion[]; totalDuration: number }> {
  const threshold = options?.threshold ?? -50;
  const minDuration = options?.minDuration ?? 0.5;

  const cmd = ffmpeg().input(filePath).audioFilter({ type: 'silencedetect', noise: threshold, duration: minDuration }).format('null').output('-');

  let stderr = '';
  await cmd.run({
    onStderr: (data) => {
      stderr += data.toString();
    },
  });

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  let totalDuration = 0;
  if (durationMatch) {
    totalDuration = Number.parseInt(durationMatch[1], 10) * 3600 + Number.parseInt(durationMatch[2], 10) * 60 + Number.parseInt(durationMatch[3], 10) + Number.parseInt(durationMatch[4], 10) / 100;
  }

  const regions: SilenceRegion[] = [];
  const silenceStarts: number[] = [];

  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      silenceStarts.push(Number.parseFloat(startMatch[1]));
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch) {
      const end = Number.parseFloat(endMatch[1]);
      const start = silenceStarts.shift();
      if (start !== undefined) {
        regions.push({ start, end, duration: end - start });
      }
    }
  }

  // If there's a silence_start without a matching end, silence extends to EOF
  if (silenceStarts.length > 0 && totalDuration > 0) {
    const start = silenceStarts[0];
    regions.push({ start, end: totalDuration, duration: totalDuration - start });
  }

  return { regions, totalDuration };
}
