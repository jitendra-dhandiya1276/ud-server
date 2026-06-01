import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { config } from '../config/env';

type UploadFolder = 'products' | 'banners' | 'categories' | 'blogs' | 'users' | 'media';

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
  return `${config.baseUrl}/uploads/${rel}`;
};

export const deleteFile = async (filePath: string): Promise<void> => {
  await fs.promises.unlink(filePath).catch(() => {});
};
