const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { ApiError, ErrorCodes } = require('../shared/errors');
const { resolveStoragePath, toUserPath, isValidName } = require('./pathSafety');

class FileService {
  constructor(storageDir, maxUploadBytes) {
    this.storageDir = storageDir;
    this.maxUploadBytes = maxUploadBytes;
  }

  // ---------- list ----------

  async list(userPath, { page = 1, pageSize = 50, sort = 'name', direction = 'asc' } = {}) {
    const dirPath = resolveStoragePath(userPath, this.storageDir);

    let stat;
    try {
      stat = await fs.promises.stat(dirPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Directory not found', 404);
      }
      throw err;
    }

    if (!stat.isDirectory()) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Path is not a directory', 400);
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    const items = [];
    for (const entry of entries) {
      let itemStat;
      try {
        itemStat = await fs.promises.stat(path.join(dirPath, entry.name));
      } catch {
        continue;
      }

      items.push({
        name: entry.name,
        path: toUserPath(path.join(dirPath, entry.name), this.storageDir),
        type: entry.isDirectory() ? 'folder' : 'file',
        size: entry.isDirectory() ? 0 : itemStat.size,
        modifiedAt: itemStat.mtime.toISOString(),
      });
    }

    // Sort
    const dir = direction === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      if (sort === 'name') {
        if (a.type !== b.type) return a.type === 'folder' ? -dir : dir;
        return a.name.localeCompare(b.name) * dir;
      }
      if (sort === 'size') return (a.size - b.size) * dir;
      if (sort === 'modifiedAt') return (new Date(a.modifiedAt) - new Date(b.modifiedAt)) * dir;
      if (sort === 'type') return a.type.localeCompare(b.type) * dir;
      return 0;
    });

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.min(200, Math.max(10, parseInt(pageSize, 10) || 50));
    const total = items.length;
    const start = (safePage - 1) * safePageSize;

    return {
      path: userPath || '/',
      page: safePage,
      pageSize: safePageSize,
      total,
      items: items.slice(start, start + safePageSize),
    };
  }

  // ---------- download ----------

  async download(userPath) {
    const filePath = resolveStoragePath(userPath, this.storageDir);

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'File not found', 404);
      }
      throw err;
    }

    if (!stat.isFile()) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Path is not a file', 400);
    }

    return {
      filename: path.basename(filePath),
      stream: fs.createReadStream(filePath),
      size: stat.size,
    };
  }

  // ---------- create folder ----------

  async createFolder(userPath, name) {
    if (!isValidName(name)) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Invalid folder name', 400);
    }

    const parentPath = resolveStoragePath(userPath, this.storageDir);

    try {
      const s = await fs.promises.stat(parentPath);
      if (!s.isDirectory()) {
        throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Parent path is not a directory', 400);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Parent directory not found', 404);
      }
      throw err;
    }

    const folderPath = path.join(parentPath, name);
    try {
      await fs.promises.mkdir(folderPath);
    } catch (err) {
      if (err.code === 'EEXIST') {
        throw new ApiError(ErrorCodes.ALREADY_EXISTS.code, 'Folder already exists', 409);
      }
      throw err;
    }

    return { name, path: toUserPath(folderPath, this.storageDir), type: 'folder' };
  }

  // ---------- rename ----------

  async rename(userPath, newName) {
    if (!isValidName(newName)) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Invalid name', 400);
    }

    const oldPath = resolveStoragePath(userPath, this.storageDir);
    const root = path.resolve(this.storageDir);
    if (oldPath === root) {
      throw new ApiError(ErrorCodes.FORBIDDEN_PATH.code, 'Cannot rename root', 403);
    }

    try {
      await fs.promises.access(oldPath);
    } catch {
      throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'File or folder not found', 404);
    }

    const newPath = path.join(path.dirname(oldPath), newName);
    if (newPath !== root && !newPath.startsWith(root + path.sep)) {
      throw new ApiError(ErrorCodes.FORBIDDEN_PATH.code, 'New path is outside storage', 403);
    }

    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (err) {
      if (err.code === 'EEXIST') {
        throw new ApiError(ErrorCodes.ALREADY_EXISTS.code, 'Name already exists', 409);
      }
      throw err;
    }

    return { oldPath: userPath, newPath: toUserPath(newPath, this.storageDir), newName };
  }

  // ---------- delete ----------

  async delete(userPath) {
    const targetPath = resolveStoragePath(userPath, this.storageDir);
    const root = path.resolve(this.storageDir);
    if (targetPath === root) {
      throw new ApiError(ErrorCodes.FORBIDDEN_PATH.code, 'Cannot delete root', 403);
    }

    let stat;
    try {
      stat = await fs.promises.stat(targetPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'File or folder not found', 404);
      }
      throw err;
    }

    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(targetPath);
    }

    return { deleted: userPath };
  }

  // ---------- upload ----------

  async uploadFromTemp(userPath, tempPath, filename, overwrite = false) {
    if (!isValidName(filename)) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Invalid file name', 400);
    }

    const dirPath = resolveStoragePath(userPath, this.storageDir);

    try {
      const s = await fs.promises.stat(dirPath);
      if (!s.isDirectory()) {
        throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Target is not a directory', 400);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Target directory not found', 404);
      }
      throw err;
    }

    const destPath = path.join(dirPath, filename);

    try {
      await fs.promises.access(destPath);
      if (!overwrite) {
        // Clean up temp file
        await fs.promises.unlink(tempPath).catch(() => {});
        throw new ApiError(ErrorCodes.ALREADY_EXISTS.code, 'File already exists. Use overwrite=true', 409);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // File doesn't exist — proceed
    }

    // Copy temp file to destination then remove temp
    try {
      await fs.promises.copyFile(tempPath, destPath);
      await fs.promises.unlink(tempPath);
    } catch (err) {
      await fs.promises.unlink(tempPath).catch(() => {});
      await fs.promises.unlink(destPath).catch(() => {});
      throw err;
    }

    const finalStat = await fs.promises.stat(destPath);
    return {
      name: filename,
      path: toUserPath(destPath, this.storageDir),
      type: 'file',
      size: finalStat.size,
    };
  }

  // ---------- move ----------

  async move(sourcePath, destPath) {
    const srcAbs = resolveStoragePath(sourcePath, this.storageDir);
    const dstAbs = resolveStoragePath(destPath, this.storageDir);
    const root = path.resolve(this.storageDir);

    if (srcAbs === root) {
      throw new ApiError(ErrorCodes.FORBIDDEN_PATH.code, 'Cannot move root', 403);
    }

    try {
      await fs.promises.access(srcAbs);
    } catch {
      throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Source not found', 404);
    }

    const dstParent = path.dirname(dstAbs);
    try {
      const s = await fs.promises.stat(dstParent);
      if (!s.isDirectory()) {
        throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Destination parent is not a directory', 400);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Destination directory not found', 404);
      }
      throw err;
    }

    try {
      await fs.promises.rename(srcAbs, dstAbs);
    } catch (err) {
      if (err.code === 'EEXIST') {
        throw new ApiError(ErrorCodes.ALREADY_EXISTS.code, 'File already exists at destination', 409);
      }
      throw err;
    }

    return { sourcePath, destPath };
  }
}

module.exports = { FileService };
