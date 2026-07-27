import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { prewarmDerivatives } from './imagePipeline';

type UploadFolder = 'products' | 'banners' | 'categories' | 'blogs' | 'users' | 'media' | 'stores';

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

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (config.upload.allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'));
  }
};

export const createUploader = (folder: UploadFolder, maxFileSizeBytes?: number) =>
  multer({
    storage: storage(folder),
    fileFilter,
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
  if (config.image.prewarmOnUpload) {
    prewarmDerivatives(absFile);
  }

  return `${config.baseUrl}/uploads/${rel}`;
};

export const deleteFile = async (filePath: string): Promise<void> => {
  await fs.promises.unlink(filePath).catch(() => {});
};
