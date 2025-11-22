import { ffmpeg } from '@melody-manager/plugin-sdk';
import { ytDlpService } from './yt-dlp.service';

class AudioAnalysisService {
  /**
   * Detect silence periods in an audio file using FFmpeg
   * @param audioPath Path to the audio file
   * @param silenceThreshold Silence threshold in dB (default: -55dB, very sensitive)
   * @param minSilenceDuration Minimum silence duration in seconds (default: 0.1s)
   * @returns Array of silence intervals
   */
  async detectSilences(audioPath: string, silenceThreshold = -55, minSilenceDuration = 0.1): Promise<Array<{ start: number; end: number; duration: number }>> {
    return new Promise((resolve, reject) => {
      let stderrOutput = '';

      ffmpeg()
        .input(audioPath)
        .audioFilter({ type: 'silencedetect', noise: silenceThreshold, duration: minSilenceDuration })
        .format('null')
        .output('-')
        .run({
          onStderr: (data) => {
            stderrOutput += data.toString();
          },
        })
        .then(() => {
          const silences: Array<{ start: number; end: number; duration: number }> = [];
          const lines = stderrOutput.split('\n');

          let currentSilence: { start?: number; end?: number; duration?: number } = {};

          for (const line of lines) {
            const silenceStartMatch = line.match(/silence_start: ([\d.]+)/);
            const silenceEndMatch = line.match(/silence_end: ([\d.]+)/);
            const silenceDurationMatch = line.match(/silence_duration: ([\d.]+)/);

            if (silenceStartMatch?.[1]) {
              currentSilence.start = Number.parseFloat(silenceStartMatch[1]);
            }
            if (silenceEndMatch?.[1]) {
              currentSilence.end = Number.parseFloat(silenceEndMatch[1]);
            }
            if (silenceDurationMatch?.[1]) {
              currentSilence.duration = Number.parseFloat(silenceDurationMatch[1]);
            }

            if (currentSilence.start !== undefined && currentSilence.end !== undefined && currentSilence.duration !== undefined) {
              silences.push({
                start: currentSilence.start,
                end: currentSilence.end,
                duration: currentSilence.duration,
              });
              currentSilence = {};
            }
          }

          resolve(silences);
        })
        .catch(reject);
    });
  }

  /**
   * Find optimal separation points between consecutive chapters
   * This method looks for silences BETWEEN two consecutive chapters
   * rather than near individual timestamps
   * @param audioPath Path to the audio file
   * @param chapters Array of chapters with start and end times
   * @returns Array of corrected chapter boundaries
   */
  async findOptimalChapterSeparations(audioPath: string, chapters: Array<{ title: string; startTime: number; endTime: number }>): Promise<number[]> {
    const silences = await this.detectSilences(audioPath);

    const correctedStartTimes: number[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const currentChapter = chapters[i];
      const previousChapter = chapters[i - 1];

      if (!currentChapter) continue;

      if (i === 0) {
        correctedStartTimes.push(currentChapter.startTime);
        continue;
      }

      if (!previousChapter) {
        correctedStartTimes.push(currentChapter.startTime);
        continue;
      }

      const expectedSeparation = currentChapter.startTime;
      const searchWindow = 15;
      const searchStart = Math.max(previousChapter.startTime, expectedSeparation - searchWindow);
      const searchEnd = Math.min(currentChapter.endTime, expectedSeparation + searchWindow);

      const silencesInRange = silences.filter((s) => s.start >= searchStart && s.end <= searchEnd);

      if (silencesInRange.length === 0) {
        correctedStartTimes.push(currentChapter.startTime);
        continue;
      }

      const scoredSilences = silencesInRange.map((silence) => {
        const distanceFromExpected = Math.abs(silence.end - expectedSeparation);
        const proximityScore = 1 / (1 + distanceFromExpected);
        const durationScore = silence.duration / 2;
        const totalScore = proximityScore * 0.7 + durationScore * 0.3;

        return {
          silence,
          score: totalScore,
          distanceFromExpected,
        };
      });

      scoredSilences.sort((a, b) => b.score - a.score);
      const bestSilence = scoredSilences[0];

      if (!bestSilence) {
        correctedStartTimes.push(currentChapter.startTime);
        continue;
      }

      const separationPoint = bestSilence.silence.end;

      correctedStartTimes.push(separationPoint);
    }

    return correctedStartTimes;
  }

  /**
   * Analyze audio and suggest corrected chapter timings
   * @param audioPath Path to the audio file
   * @param chapters Array of chapters with startTime and endTime
   * @param videoDuration Total duration of the video
   * @returns Array of corrected segments with new start/end times
   */
  async analyzeChapters(audioPath: string, chapters: Array<{ title: string; startTime: number; endTime: number }>, videoDuration: number): Promise<Array<{ title: string; startTime: number; endTime: number; originalStartTime: number; originalEndTime: number }>> {
    if (chapters.length === 0) {
      return [];
    }

    const sortedChapters = [...chapters].sort((a, b) => a.startTime - b.startTime);

    const correctedStartTimes = await this.findOptimalChapterSeparations(audioPath, sortedChapters);

    const correctedChapters = sortedChapters.map((chapter, index) => {
      const startTime = correctedStartTimes[index] ?? chapter.startTime;
      const endTime = correctedStartTimes[index + 1] ?? videoDuration;

      return {
        title: chapter.title,
        startTime,
        endTime: Math.max(endTime, startTime + 1),
        originalStartTime: chapter.startTime,
        originalEndTime: chapter.endTime,
      };
    });

    return correctedChapters;
  }

  /**
   * Synchronize album chapters by analyzing audio and matching with YouTube metadata
   * @param sourceUrl YouTube video URL
   * @param dbTracks Tracks from database
   * @returns Updated track information with corrected timestamps
   */
  async syncAlbumChapters(
    sourceUrl: string,
    dbTracks: Array<{ id: string; title: string; metadata?: { startTime?: number; endTime?: number } }>,
  ): Promise<{
    updates: Map<string, { startTime: number; endTime: number; originalStartTime: number; originalEndTime: number }>;
    matched: number;
    unmatched: number;
  }> {
    const videoInfo = await ytDlpService.extractTrackInfo(sourceUrl);
    if (!videoInfo) {
      throw new Error('Failed to extract video info from YouTube');
    }

    if (!videoInfo.chapters || videoInfo.chapters.length === 0) {
      throw new Error('No chapters found in the YouTube video');
    }

    const audioPath = await ytDlpService.downloadAudio(sourceUrl);

    try {
      const originalChapters = videoInfo.chapters.map((ch) => ({
        title: ch.title,
        startTime: ch.start_time,
        endTime: ch.end_time,
      }));

      const correctedChapters = await this.analyzeChapters(audioPath, originalChapters, videoInfo.duration);

      const normalizeTitle = (title: string): string => {
        return title
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '');
      };

      const trackUpdateMap = new Map<string, { startTime: number; endTime: number; originalStartTime: number; originalEndTime: number }>();
      let matched = 0;
      let unmatched = 0;

      for (const track of dbTracks) {
        const normalizedTrackTitle = normalizeTitle(track.title);

        const matchingChapter = correctedChapters.find((ch) => normalizeTitle(ch.title) === normalizedTrackTitle);

        if (matchingChapter) {
          trackUpdateMap.set(track.id, {
            startTime: matchingChapter.startTime,
            endTime: matchingChapter.endTime,
            originalStartTime: matchingChapter.originalStartTime,
            originalEndTime: matchingChapter.originalEndTime,
          });
          matched++;
        } else {
          unmatched++;
        }
      }

      return { updates: trackUpdateMap, matched, unmatched };
    } finally {
      await ytDlpService.cleanupTempFile(audioPath);
    }
  }
}

export const audioAnalysisService = new AudioAnalysisService();
