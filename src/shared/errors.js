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
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },
};

function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.toJSON());
  }

  // Multer-specific errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: {
        code: 'UPLOAD_TOO_LARGE',
        message: 'File is too large',
      },
    });
  }

  // Multer: unexpected field or no file
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Unexpected file field',
      },
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}

module.exports = { ApiError, ErrorCodes, errorHandler };
