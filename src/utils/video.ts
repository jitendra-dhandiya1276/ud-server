import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const run = promisify(execFile);

/**
 * Video inspection and poster extraction, used by the Instagram reel uploads.
 *
 * Reels play in a 240px-wide 9:16 tile, so a low-resolution upload is stretched
 * on high-DPR screens exactly the way undersized product photos were. ffprobe
 * gives us the real dimensions before the file is accepted, and ffmpeg lets us
 * pull the poster straight from the video so the admin only has to supply one
 * file.
 *
 * Every function degrades gracefully when ffmpeg is missing: probing returns
 * null and poster extraction returns null, so uploads still succeed — they just
 * lose the extra validation and convenience.
 */

/** Matches the poster minimum: 240px tile x 3 for high-DPR screens. */
export const MIN_VIDEO_WIDTH = 720;

let ffmpegAvailable: boolean | null = null;

export const hasFfmpeg = async (): Promise<boolean> => {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await run('ffprobe', ['-version']);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    logger.warn('ffmpeg/ffprobe not found — reel videos will not be probed or auto-postered');
  }
  return ffmpegAvailable;
};

export interface VideoInfo {
  width: number;
  height: number;
  durationSeconds: number;
}

/** Read dimensions and duration. Returns null if ffprobe is unavailable or the file is unreadable. */
export const probeVideo = async (absolutePath: string): Promise<VideoInfo | null> => {
  if (!(await hasFfmpeg())) return null;
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'json',
      absolutePath,
    ], { timeout: 30_000 });

    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream?.height) return null;

    return {
      width: Number(stream.width),
      height: Number(stream.height),
      durationSeconds: Number(parsed.format?.duration) || 0,
    };
  } catch (error) {
    logger.warn(`ffprobe failed for ${path.basename(absolutePath)}: ${(error as Error).message}`);
    return null;
  }
};

/**
 * Extract a poster frame.
 *
 * Sampled one second in rather than at 0s: the opening frame of a reel is very
 * often a fade from black, which makes a useless thumbnail. Falls back to the
 * first frame for clips shorter than that.
 */
export const extractPoster = async (
  videoPath: string,
  outputPath: string
): Promise<string | null> => {
  if (!(await hasFfmpeg())) return null;

  const info = await probeVideo(videoPath);
  const seek = info && info.durationSeconds > 1.5 ? '1' : '0';

  try {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await run('ffmpeg', [
      '-ss', seek,
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',          // high-quality JPEG
      '-y',                 // overwrite
      outputPath,
    ], { timeout: 60_000 });

    if (!fs.existsSync(outputPath)) return null;
    return outputPath;
  } catch (error) {
    logger.warn(`Poster extraction failed for ${path.basename(videoPath)}: ${(error as Error).message}`);
    return null;
  }
};

export interface VideoCheck {
  ok: boolean;
  info: VideoInfo | null;
  message?: string;
}

/**
 * Reject videos too small to render sharply in the reel tile. Skipped entirely
 * when ffmpeg is unavailable — better to accept the upload than to block the
 * feature on a missing binary.
 */
export const checkVideoResolution = async (absolutePath: string): Promise<VideoCheck> => {
  const info = await probeVideo(absolutePath);
  if (!info) return { ok: true, info: null };

  if (info.width < MIN_VIDEO_WIDTH) {
    return {
      ok: false,
      info,
      message:
        `Video is only ${info.width}x${info.height}. Reels need at least ${MIN_VIDEO_WIDTH}px wide ` +
        `or they look blurry on phones and retina screens. Upload the original file rather than a ` +
        `screen recording or a re-download.`,
    };
  }

  return { ok: true, info };
};
