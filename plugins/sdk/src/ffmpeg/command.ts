import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { type AudioFilter, serializeAudioFilter } from './options/audio-filters';
import { type CodecOptions, serializeCodecOptions } from './options/codec';
import { type MetadataOptions, serializeMetadata } from './options/metadata';

interface FFmpegOptions {
  input?: string;
  output?: string;
  inputSeek?: { start?: number | string; end?: number | string };
  outputSeek?: { start?: number | string; end?: number | string };
  duration?: number | string;
  audioFilter?: AudioFilter;
  codec?: CodecOptions;
  format?: string;
  metadata?: MetadataOptions;
  map?: string[];
  overwrite?: boolean;
  inputArgs?: string[];
  args?: string[];
}

class FfmpegCommand {
  constructor(private readonly options: FFmpegOptions = {}) {}

  input(input: string, inputArgs?: string[]) {
    if (!input || input.trim().length === 0) {
      throw new Error('Input path cannot be empty');
    }
    return new FfmpegCommand({ ...this.options, input, inputArgs });
  }

  output(output: string) {
    if (!output || output.trim().length === 0) {
      throw new Error('Output path cannot be empty');
    }
    return new FfmpegCommand({ ...this.options, output });
  }

  audioFilter(audioFilter: AudioFilter) {
    return new FfmpegCommand({ ...this.options, audioFilter });
  }

  codec(codec: CodecOptions) {
    return new FfmpegCommand({ ...this.options, codec });
  }

  seekInput(start?: number | string, end?: number | string) {
    return new FfmpegCommand({ ...this.options, inputSeek: { start, end } });
  }

  seekOutput(start?: number | string, end?: number | string) {
    return new FfmpegCommand({ ...this.options, outputSeek: { start, end } });
  }

  duration(duration: number | string) {
    return new FfmpegCommand({ ...this.options, duration });
  }

  format(format: string) {
    return new FfmpegCommand({ ...this.options, format });
  }

  metadata(metadata: MetadataOptions) {
    return new FfmpegCommand({ ...this.options, metadata });
  }

  map(...streams: string[]) {
    const existingMaps = this.options.map || [];
    return new FfmpegCommand({ ...this.options, map: [...existingMaps, ...streams] });
  }

  overwrite() {
    return new FfmpegCommand({ ...this.options, overwrite: true });
  }

  args(...args: string[]) {
    const newArgs = [...(this.options.args || []), ...args];
    return new FfmpegCommand({ ...this.options, args: newArgs });
  }

  spawn(): ChildProcessWithoutNullStreams {
    return spawn('ffmpeg', this.buildCommand());
  }

  async run(options?: { onStdout?: (data: Buffer) => void; onStderr?: (data: Buffer) => void }): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = this.spawn();
      let stderrOutput = '';

      if (options?.onStdout) {
        process.stdout.on('data', options.onStdout);
      }

      process.stderr.on('data', (data) => {
        stderrOutput += data.toString();
        if (options?.onStderr) {
          options.onStderr(data);
        }
      });

      process.on('close', (code) => {
        if (code !== 0 && code !== 1) {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderrOutput}`));
        } else {
          resolve();
        }
      });

      process.on('error', reject);
    });
  }

  toString(): string {
    return `ffmpeg ${this.buildCommand().join(' ')}`;
  }

  private buildCommand(): string[] {
    const args: string[] = [];

    if (this.options.overwrite) {
      args.push('-y');
    }

    if (this.options.inputSeek) {
      if (this.options.inputSeek.start !== undefined) {
        args.push('-ss', `${this.options.inputSeek.start}`);
      }
      if (this.options.inputSeek.end !== undefined) {
        args.push('-to', `${this.options.inputSeek.end}`);
      }
    }

    if (this.options.inputArgs) {
      args.push(...this.options.inputArgs);
    }

    if (this.options.input) {
      args.push('-i', this.options.input);
    }

    if (this.options.outputSeek) {
      if (this.options.outputSeek.start !== undefined) {
        args.push('-ss', `${this.options.outputSeek.start}`);
      }
      if (this.options.outputSeek.end !== undefined) {
        args.push('-to', `${this.options.outputSeek.end}`);
      }
    }

    if (this.options.duration !== undefined) {
      args.push('-t', `${this.options.duration}`);
    }

    if (this.options.map && this.options.map.length > 0) {
      for (const stream of this.options.map) {
        args.push('-map', stream);
      }
    }

    if (this.options.audioFilter) {
      args.push(...serializeAudioFilter(this.options.audioFilter));
    }

    if (this.options.codec) {
      args.push(...serializeCodecOptions(this.options.codec));
    }

    if (this.options.metadata) {
      args.push(...serializeMetadata(this.options.metadata));
    }

    if (this.options.format) {
      args.push('-f', this.options.format);
    }

    if (this.options.args) {
      args.push(...this.options.args);
    }

    if (this.options.output) {
      args.push(this.options.output);
    }

    return args;
  }
}

export function ffmpeg(options: FFmpegOptions = {}) {
  return new FfmpegCommand(options);
}
