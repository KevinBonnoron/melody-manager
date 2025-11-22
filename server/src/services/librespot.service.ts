import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { logger } from '../lib/logger';

class LibrespotService {
  private process: ChildProcess | null = null;
  private readonly pipePath = '/tmp/librespot-audio.pipe';
  private readonly cachePath = '/tmp/librespot-cache';
  private deviceId: string | null = null;
  private isReady = false;

  /**
   * Start librespot daemon with pipe backend
   */
  async start(accessToken?: string): Promise<void> {
    if (this.process) {
      logger.info('[Librespot] Already running');
      return;
    }

    // Ensure cache directory exists
    if (!existsSync(this.cachePath)) {
      mkdirSync(this.cachePath, { recursive: true });
    }

    // Clean up old pipe if exists
    if (existsSync(this.pipePath)) {
      await unlink(this.pipePath);
    }

    const args = [
      '--name',
      'Melody Manager',
      '--backend',
      'pipe',
      '--device',
      this.pipePath,
      '--cache',
      this.cachePath,
      '--format',
      'S16', // 16-bit signed PCM
      '--bitrate',
      '320',
      '--enable-volume-normalisation',
      '--initial-volume',
      '100',
    ];

    if (accessToken) {
      args.push('--access-token', accessToken);
    }

    logger.info(`[Librespot] Starting daemon: librespot ${args.join(' ')}`);

    this.process = spawn('librespot', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.on('error', (error) => {
      logger.error(`[Librespot] Process error: ${error}`);
      this.cleanup();
    });

    this.process.on('exit', (code, signal) => {
      logger.info(`[Librespot] Process exited (code: ${code}, signal: ${signal})`);
      this.cleanup();
    });

    // Capture stdout
    this.process.stdout?.on('data', (data) => {
      const line = data.toString();
      logger.debug(`[Librespot stdout] ${line}`);
    });

    // Monitor stderr for initialization and device ID
    this.process.stderr?.on('data', (data) => {
      const line = data.toString();
      logger.debug(`[Librespot stderr] ${line}`);

      // Extract device ID from librespot output
      const deviceIdMatch = line.match(/Device ID: ([a-f0-9]+)/i);
      if (deviceIdMatch?.[1]) {
        this.deviceId = deviceIdMatch[1];
        logger.info(`[Librespot] Device ID: ${this.deviceId}`);
      }

      // Check if ready
      if (line.includes('Using') || line.includes('Connecting') || line.includes('Zeroconf')) {
        this.isReady = true;
      }
    });

    // Wait for initialization
    await this.waitForReady();
  }

  /**
   * Wait for librespot to be ready
   */
  private async waitForReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();
    while (!this.isReady && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!this.isReady) {
      throw new Error('Librespot initialization timeout');
    }

    logger.info('[Librespot] Ready');
  }

  /**
   * Get the device ID for Spotify Web API control
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Get the pipe path for reading audio
   */
  getPipePath(): string {
    return this.pipePath;
  }

  /**
   * Check if librespot is running
   */
  isRunning(): boolean {
    return this.process !== null && this.isReady;
  }

  /**
   * Stop librespot daemon
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.process = null;
    this.deviceId = null;
    this.isReady = false;
  }
}

export const librespotService = new LibrespotService();
