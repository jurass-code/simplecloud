const { MAX_FILES_PER_UPLOAD } = require("./limits");

class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

const ErrorCodes = {
  INVALID_REQUEST: { code: 'INVALID_REQUEST', status: 400 },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401 },
  FORBIDDEN_PATH: { code: 'FORBIDDEN_PATH', status: 403 },
  FILE_NOT_FOUND: { code: 'FILE_NOT_FOUND', status: 404 },
  ALREADY_EXISTS: { code: 'ALREADY_EXISTS', status: 409 },
  UPLOAD_TOO_LARGE: { code: 'UPLOAD_TOO_LARGE', status: 413 },
  // Image data we cannot decode (corrupt file, unsupported codec, HEIC without
  // libheif): a 415 tells the client "no preview here" instead of a server bug.
  THUMBNAIL_UNAVAILABLE: { code: 'THUMBNAIL_UNAVAILABLE', status: 415 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },
};

// Multer raises MulterError instances that never reach the route handler.
// Every code below must be mapped here — otherwise the user sees a generic
// "Internal server error" for something as mundane as picking too many photos.
const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: {
    code: 'UPLOAD_TOO_LARGE',
    status: 413,
    message: 'File is too large',
  },
  LIMIT_FILE_COUNT: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Too many files in one upload (max ' + MAX_FILES_PER_UPLOAD + ')',
  },
  LIMIT_PART_COUNT: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Too many parts in the upload',
  },
  LIMIT_UNEXPECTED_FILE: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Unexpected file field',
  },
  LIMIT_FIELD_KEY: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Field name too long',
  },
  LIMIT_FIELD_VALUE: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Field value too long',
  },
  LIMIT_FIELD_COUNT: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Too many fields in the upload',
  },
};

function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.toJSON());
  }

  // Multer-specific errors (multer throws before the route handler runs).
  const multer = err && MULTER_ERRORS[err.code];
  if (multer) {
    return res.status(multer.status).json({
      error: { code: multer.code, message: multer.message },
    });
  }

  if (res.headersSent) {
    if (typeof res.destroy === 'function') res.destroy();
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}

module.exports = { ApiError, ErrorCodes, errorHandler, MULTER_ERRORS };
