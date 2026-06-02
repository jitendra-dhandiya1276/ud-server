"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFile = exports.getImageUrl = exports.optimizeImage = exports.createUploader = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const getUploadPath = (folder) => {
    const dir = path_1.default.join(env_1.config.upload.path, folder);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
};
const storage = (folder) => multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, getUploadPath(folder));
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        cb(null, filename);
    },
});
const fileFilter = (_req, file, cb) => {
    if (env_1.config.upload.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only images are allowed.'));
    }
};
const createUploader = (folder, maxFileSizeBytes) => (0, multer_1.default)({
    storage: storage(folder),
    fileFilter,
    limits: { fileSize: maxFileSizeBytes ?? env_1.config.upload.maxFileSize },
});
exports.createUploader = createUploader;
const optimizeImage = async (inputPath, outputPath, options) => {
    const { width = 1200, height, quality = 85 } = options || {};
    const target = outputPath || inputPath.replace(/\.[^.]+$/, '.webp');
    await (0, sharp_1.default)(inputPath)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(target);
    if (target !== inputPath) {
        await fs_1.default.promises.unlink(inputPath).catch(() => { });
    }
    return target;
};
exports.optimizeImage = optimizeImage;
const getImageUrl = (filePath) => {
    if (!filePath)
        return '';
    const uploadRoot = path_1.default.resolve(env_1.config.upload.path);
    const absFile = path_1.default.resolve(filePath);
    const rel = path_1.default.relative(uploadRoot, absFile).replace(/\\/g, '/');
    return `${env_1.config.baseUrl}/uploads/${rel}`;
};
exports.getImageUrl = getImageUrl;
const deleteFile = async (filePath) => {
    await fs_1.default.promises.unlink(filePath).catch(() => { });
};
exports.deleteFile = deleteFile;
