const path = require('path');
const fs = require('fs');
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

// Fetch {size, mtimeMs} for many entries concurrently. readdir(withFileTypes)
// gives name+type but not size/mtime, so we stat each entry.
// Concurrency is bounded to keep the in-flight promise/uv-request set small
// on huge dirs — actual I/O parallelism is still gated by libuv's threadpool
// (UV_THREADPOOL_SIZE, default 4). Raise that env if stat throughput bites.
async function statMany(dirPath, entries, concurrency = 32) {
  const results = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= entries.length) return;
      const abs = path.join(dirPath, entries[i].name);
      try {
        const st = await fs.promises.stat(abs);
        results[i] = { size: st.size, mtimeMs: st.mtimeMs };
      } catch {
        results[i] = null; // entry vanished between readdir and stat
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, worker),
  );
  return results;
}

module.exports = { isValidName, resolveStoragePath, toUserPath, statMany };
