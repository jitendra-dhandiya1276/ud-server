import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { prewarmDerivatives, checkSourceResolution } from './imagePipeline';
import { logger } from './logger';

type UploadFolder = 'products' | 'banners' | 'categories' | 'blogs' | 'users' | 'media' | 'stores' | 'reels';

const getUploadPath = (folder: UploadFolder): string => {
  const dir = path.join(config.upload.path, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const storage = (folder: UploadFolder) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, getUploadPath(folder));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      cb(null, filename);
    },
  });

/** Video types accepted for Instagram reels. */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

const makeFileFilter = (allowed?: string[]) =>
  (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const permitted = allowed ?? config.upload.allowedTypes;
    if (permitted.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const kind = permitted.some(t => t.startsWith('video/')) ? 'images or videos' : 'images';
      cb(new Error(`Invalid file type "${file.mimetype}". Only ${kind} are allowed.`));
    }
  };

const fileFilter = makeFileFilter();

export const createUploader = (
  folder: UploadFolder,
  maxFileSizeBytes?: number,
  allowedMimeTypes?: string[]
) =>
  multer({
    storage: storage(folder),
    fileFilter: allowedMimeTypes ? makeFileFilter(allowedMimeTypes) : fileFilter,
    limits: { fileSize: maxFileSizeBytes ?? config.upload.maxFileSize },
  });

/**
 * Wrap a multer middleware so size/type rejections surface as a clean 400
 * carrying the actual limit, instead of bubbling to the generic 500 handler.
 *
 * Previously only the banner and store routes did this, so an oversized product
 * image failed with an opaque "Internal Server Error" and the admin had no way
 * to know why.
 */
export const handleUpload = (
  middleware: (req: Request, res: Response, cb: (err?: any) => void) => void,
  maxFileSizeBytes?: number
) => {
  const limit = maxFileSizeBytes ?? config.upload.maxFileSize;
  const limitMb = Math.round((limit / (1024 * 1024)) * 10) / 10;

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err?: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `Image is too large. Maximum size is ${limitMb} MB.`,
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ success: false, message: 'Too many files uploaded.' });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      if (err) {
        // fileFilter rejections land here (invalid MIME type)
        return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
      }
      return next();
    });
  };
};

/**
 * Reject uploads whose source resolution is too low for where they will be
 * displayed.
 *
 * Runs AFTER multer (which has already written the file to disk) and deletes
 * anything it rejects, so a failed upload leaves nothing behind.
 *
 * This is the only fix for the most common cause of "the image looks blurry":
 * the pipeline never upscales, so a source narrower than its render box is
 * stretched by the browser and no encoder setting can recover the detail.
 * Catching it at upload tells the admin immediately, instead of the problem
 * surfacing later as a customer complaint.
 *
 * Set IMAGE_MIN_RESOLUTION_ENFORCE=false to log warnings instead of rejecting.
 */
export const validateUploadResolution = (folder: UploadFolder) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // multer exposes req.files as an ARRAY for .array() but as an OBJECT keyed
    // by field name for .fields(). Handle both, or routes using .fields()
    // silently validate nothing.
    const raw = req.files as
      | Express.Multer.File[]
      | Record<string, Express.Multer.File[]>
      | undefined;

    const collected: Express.Multer.File[] = Array.isArray(raw)
      ? raw
      : raw
        ? Object.values(raw).flat()
        : [];
    if (req.file) collected.push(req.file);

    // Only images have a resolution to check. A reel's video shares the same
    // request, and running it through Sharp would fail and reject the upload.
    const files = collected.filter(f => f.mimetype.startsWith('image/'));
    if (files.length === 0) return next();

    const enforce = process.env.IMAGE_MIN_RESOLUTION_ENFORCE !== 'false';
    const failures: string[] = [];

    for (const file of files) {
      const result = await checkSourceResolution(file.path, folder).catch(() => null);
      if (result && !result.ok) {
        failures.push(`"${file.originalname}": ${result.message}`);
      }
    }

    if (failures.length === 0) return next();

    if (!enforce) {
      logger.warn(`Low-resolution upload allowed (enforcement off): ${failures.join(' | ')}`);
      return next();
    }

    // Reject: remove every file from this request so half-accepted uploads
    // never leave orphans on disk.
    await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));

    return res.status(400).json({
      success: false,
      message: failures.length === 1
        ? failures[0]
        : `${failures.length} images were rejected. ${failures.join(' ')}`,
    });
  };
};

export const optimizeImage = async (
  inputPath: string,
  outputPath?: string,
  options?: { width?: number; height?: number; quality?: number }
): Promise<string> => {
  const { width = 1200, height, quality = 85 } = options || {};
  const target = outputPath || inputPath.replace(/\.[^.]+$/, '.webp');

  await sharp(inputPath)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(target);

  if (target !== inputPath) {
    await fs.promises.unlink(inputPath).catch(() => {});
  }

  return target;
};

export const getImageUrl = (filePath: string): string => {
  if (!filePath) return '';
  const uploadRoot = path.resolve(config.upload.path);
  const absFile   = path.resolve(filePath);
  const rel       = path.relative(uploadRoot, absFile).replace(/\\/g, '/');

  // Every upload controller calls this exactly once per freshly-written file,
  // which makes it the single choke point where we can kick off derivative
  // generation for the whole application. Pre-warming is fire-and-forget on
  // setImmediate, so it never delays the upload response, and a failure only
  // means the first visitor pays for the transform instead.
  // Videos are not images — Sharp would only throw on them.
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(absFile);
  if (config.image.prewarmOnUpload && !isVideo) {
    prewarmDerivatives(absFile);
  }

  return `${config.baseUrl}/uploads/${rel}`;
};

export const deleteFile = async (filePath: string): Promise<void> => {
  await fs.promises.unlink(filePath).catch(() => {});
};
