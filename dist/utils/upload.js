"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUploadByUrl = exports.deleteFile = exports.getImageUrl = exports.optimizeImage = exports.validateUploadResolution = exports.discardUploads = exports.uploadedFiles = exports.handleUpload = exports.createUploader = exports.VIDEO_MIME_TYPES = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const imagePipeline_1 = require("./imagePipeline");
const logger_1 = require("./logger");
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
/** Video types accepted for Instagram reels. */
exports.VIDEO_MIME_TYPES = [
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
    'video/x-matroska', 'video/3gpp', 'video/3gpp2', 'video/x-msvideo', 'video/mpeg',
];
/**
 * Browsers are unreliable about video MIME types. Phones and several Android
 * browsers hand a perfectly good reel over as `application/octet-stream`, or
 * with no type at all, so a MIME-only allow-list refuses real uploads for a
 * reason the admin cannot act on.
 *
 * When the type is that vague, the extension decides — and ffprobe still has
 * the final say downstream, since it is the only check here that actually
 * opens the file and confirms it is playable.
 */
const AMBIGUOUS_MIME_TYPES = ['application/octet-stream', 'binary/octet-stream', ''];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.3gp', '.avi', '.mpeg', '.mpg'];
const makeFileFilter = (allowed) => (_req, file, cb) => {
    const permitted = allowed ?? env_1.config.upload.allowedTypes;
    const videosWelcome = permitted.some(t => t.startsWith('video/'));
    if (permitted.includes(file.mimetype))
        return cb(null, true);
    if (videosWelcome && AMBIGUOUS_MIME_TYPES.includes(file.mimetype ?? '')) {
        const ext = path_1.default.extname(file.originalname || '').toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext))
            return cb(null, true);
    }
    const kind = videosWelcome ? 'images or videos' : 'images';
    cb(new Error(`Invalid file type "${file.mimetype}". Only ${kind} are allowed.`));
};
const fileFilter = makeFileFilter();
const createUploader = (folder, maxFileSizeBytes, allowedMimeTypes) => (0, multer_1.default)({
    storage: storage(folder),
    fileFilter: allowedMimeTypes ? makeFileFilter(allowedMimeTypes) : fileFilter,
    limits: { fileSize: maxFileSizeBytes ?? env_1.config.upload.maxFileSize },
});
exports.createUploader = createUploader;
/**
 * Wrap a multer middleware so size/type rejections surface as a clean 400
 * carrying the actual limit, instead of bubbling to the generic 500 handler.
 *
 * Previously only the banner and store routes did this, so an oversized product
 * image failed with an opaque "Internal Server Error" and the admin had no way
 * to know why.
 */
const handleUpload = (middleware, maxFileSizeBytes) => {
    const limit = maxFileSizeBytes ?? env_1.config.upload.maxFileSize;
    const limitMb = Math.round((limit / (1024 * 1024)) * 10) / 10;
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err instanceof multer_1.default.MulterError) {
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
exports.handleUpload = handleUpload;
/**
 * Every file multer attached to this request, however it was attached.
 *
 * `.array()` puts them in an array, `.fields()` in an object keyed by field
 * name, and `.single()` on `req.file`. Cleanup paths that only knew one shape
 * silently left the others on disk.
 */
const uploadedFiles = (req) => {
    const raw = req.files;
    const collected = Array.isArray(raw)
        ? raw
        : raw
            ? Object.values(raw).flat()
            : [];
    if (req.file)
        collected.push(req.file);
    return collected;
};
exports.uploadedFiles = uploadedFiles;
/**
 * Delete everything this request uploaded. Called whenever a handler rejects
 * after multer has already written to disk — without it a refused upload keeps
 * its bytes forever, and a 60 MB reel video is an expensive thing to leak.
 */
const discardUploads = async (req) => {
    const files = (0, exports.uploadedFiles)(req);
    if (!files.length)
        return;
    await Promise.all(files.map(f => fs_1.default.promises.unlink(f.path).catch(() => { })));
    logger_1.logger.info(`Discarded ${files.length} uploaded file(s) after a rejected request`);
};
exports.discardUploads = discardUploads;
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
const validateUploadResolution = (folder, 
/**
 * Per-field overrides of the folder minimum.
 *
 * A folder-wide floor is too blunt once a request carries images with
 * different jobs. A desktop hero spans the viewport and needs >=1440px, but
 * the portrait crop beside it is displayed at phone width — 1080x1440 is the
 * standard for that and would be rejected by the desktop floor for no reason.
 */
fieldMinimums = {}) => {
    return async (req, res, next) => {
        const collected = (0, exports.uploadedFiles)(req);
        // Only images have a resolution to check. A reel's video shares the same
        // request, and running it through Sharp would fail and reject the upload.
        const files = collected.filter(f => f.mimetype.startsWith('image/'));
        if (files.length === 0)
            return next();
        const enforce = process.env.IMAGE_MIN_RESOLUTION_ENFORCE !== 'false';
        const failures = [];
        for (const file of files) {
            const override = fieldMinimums[file.fieldname];
            const result = await (0, imagePipeline_1.checkSourceResolution)(file.path, folder, override).catch(() => null);
            if (result && !result.ok) {
                failures.push(`"${file.originalname}": ${result.message}`);
            }
        }
        if (failures.length === 0)
            return next();
        if (!enforce) {
            logger_1.logger.warn(`Low-resolution upload allowed (enforcement off): ${failures.join(' | ')}`);
            return next();
        }
        // Reject: remove every file from this request so half-accepted uploads
        // never leave orphans on disk. `collected`, not `files` — `files` is only
        // the images that were checked, so rejecting a reel's poster used to strip
        // the poster and keep the video it arrived with.
        await Promise.all(collected.map(f => fs_1.default.promises.unlink(f.path).catch(() => { })));
        return res.status(400).json({
            success: false,
            message: failures.length === 1
                ? failures[0]
                : `${failures.length} images were rejected. ${failures.join(' ')}`,
        });
    };
};
exports.validateUploadResolution = validateUploadResolution;
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
    // Every upload controller calls this exactly once per freshly-written file,
    // which makes it the single choke point where we can kick off derivative
    // generation for the whole application. Pre-warming is fire-and-forget on
    // setImmediate, so it never delays the upload response, and a failure only
    // means the first visitor pays for the transform instead.
    // Videos are not images — Sharp would only throw on them.
    const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(absFile);
    if (env_1.config.image.prewarmOnUpload && !isVideo) {
        (0, imagePipeline_1.prewarmDerivatives)(absFile);
    }
    return `${env_1.config.baseUrl}/uploads/${rel}`;
};
exports.getImageUrl = getImageUrl;
const deleteFile = async (filePath) => {
    await fs_1.default.promises.unlink(filePath).catch(() => { });
};
exports.deleteFile = deleteFile;
/**
 * Remove an uploaded file, and the files generated from it, given its URL.
 *
 * Deleting a record only ever removed the row — the bytes stayed on disk
 * forever. The reels directory had accumulated 178 MB that nothing referenced.
 *
 * A stored URL is data, not a trusted path, so this refuses anything that
 * resolves outside the upload root: `/uploads/../../etc/passwd` must not turn
 * into an unlink. Dotted directories are skipped too, which keeps the
 * derivative cache out of reach.
 *
 * Silent on missing files by design — callers delete the row either way, and a
 * file that is already gone is the desired end state.
 */
const deleteUploadByUrl = async (url) => {
    if (!url)
        return;
    const marker = '/uploads/';
    const at = url.indexOf(marker);
    if (at === -1)
        return; // an external URL is not ours to delete
    const rel = decodeURIComponent(url.slice(at + marker.length)).split('?')[0];
    if (!rel)
        return;
    const uploadRoot = path_1.default.resolve(env_1.config.upload.path);
    const abs = path_1.default.resolve(uploadRoot, rel);
    if (abs !== uploadRoot && !abs.startsWith(uploadRoot + path_1.default.sep)) {
        logger_1.logger.warn(`Refusing to delete a path outside the upload root: ${url}`);
        return;
    }
    // Any dotted segment, at any depth — the derivative cache lives at
    // `.derivatives/ab/cd.avif`, so checking only the immediate parent missed it.
    const segments = path_1.default.relative(uploadRoot, abs).split(path_1.default.sep);
    if (segments.some(segment => segment.startsWith('.')))
        return;
    const base = abs.replace(/\.[^.]+$/, '');
    const targets = new Set([
        abs,
        `${base}-web.mp4`,
        `${base}-poster.jpg`,
        `${base}-web-poster.jpg`,
        `${base}-master.jpg`,
    ]);
    // A reel row points at the optimised rendition, so the untranscoded source
    // sits beside it under the pre-suffix name and would otherwise be left behind
    // — and it is the big one.
    if (base.endsWith('-web')) {
        const source = base.slice(0, -4);
        for (const ext of ['.mp4', '.webm', '.mov', '.m4v'])
            targets.add(source + ext);
        targets.add(`${source}-poster.jpg`);
    }
    let removed = 0;
    for (const target of targets) {
        try {
            await fs_1.default.promises.unlink(target);
            removed += 1;
        }
        catch {
            // not present — fine
        }
    }
    if (removed)
        logger_1.logger.info(`Removed ${removed} file(s) for ${path_1.default.basename(abs)}`);
};
exports.deleteUploadByUrl = deleteUploadByUrl;
