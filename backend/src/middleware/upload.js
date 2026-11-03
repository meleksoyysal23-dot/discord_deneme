/**
 * File Upload Middleware (FAZ 4)
 * Multer configuration for message attachments
 * Max 10MB per file, max 5 files per message
 * Allowed types: images, videos, PDF
 */

import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Upload destination - backend/uploads/
const UPLOAD_DIR = join(__dirname, '..', '..', 'uploads');

// Allowed MIME types
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
];

// Allowed extensions (whitelist)
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.webm', '.mov',
  '.pdf',
];

/**
 * Multer disk storage configuration
 * Generates UUID-based filenames to prevent collisions and path traversal
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

/**
 * File filter - validates MIME type and extension
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File extension ${ext} is not allowed`));
  }

  if (!ALLOWED_MIMES.includes(mime)) {
    return cb(new Error(`File type ${mime} is not allowed`));
  }

  cb(null, true);
};

/**
 * Multer instance configured for message attachments
 * - Max 10MB per file
 * - Max 5 files per request
 */
export const uploadAttachment = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5,
  },
}).array('attachments', 5);

/**
 * Multer error handler middleware
 * Converts multer errors to user-friendly responses
 */
export function handleUploadError(err, req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 10MB limit',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 files allowed per message',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  // Custom file filter error
  if (err.message) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  next(err);
}

export { UPLOAD_DIR };
