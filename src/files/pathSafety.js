const path = require('path');
const { ApiError, ErrorCodes } = require('../shared/errors');

const FORBIDDEN_NAMES = new Set(['.', '..']);

function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  if (FORBIDDEN_NAMES.has(name)) return false;
  // Reject control characters including null byte
  if (/[\x00-\x1F]/.test(name)) return false;
  // Reject path separators embedded in names
  if (name.includes('/') || name.includes('\\')) return false;
  return name.trim().length > 0;
}

function resolveStoragePath(userPath, storageDir) {
  let normalized = path.normalize(userPath || '/');

  // Remove leading slash so path.join treats it as relative
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  const absolute = path.resolve(storageDir, normalized);
  const root = path.resolve(storageDir);

  // Must stay within storageDir
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new ApiError(
      ErrorCodes.FORBIDDEN_PATH.code,
      'Path is outside storage directory',
      ErrorCodes.FORBIDDEN_PATH.status,
    );
  }

  return absolute;
}

function toUserPath(absolutePath, storageDir) {
  const root = path.resolve(storageDir);
  let relative = path.relative(root, absolutePath);
  relative = relative.split(path.sep).join('/');
  return '/' + (relative || '');
}

module.exports = { isValidName, resolveStoragePath, toUserPath };
