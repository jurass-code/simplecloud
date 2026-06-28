const fs = require("fs");
const path = require("path");
const { ApiError, ErrorCodes } = require("../shared/errors");
const { resolveStoragePath, toUserPath, isValidName } = require("./pathSafety");

class FileService {
  // rootDir is the true storage root; a scoped service keeps rootDir so it can
  // translate between home-relative paths (what the user sees) and root-relative
  // paths (what /pub and publicStore use). For the root service rootDir === storageDir.
  constructor(storageDir, maxUploadBytes, rootDir) {
    this.storageDir = storageDir;
    this.maxUploadBytes = maxUploadBytes;
    this.rootDir = rootDir || storageDir;
  }

  // Return a view of the file service rooted at a per-user home directory.
  // Containment in resolveStoragePath then confines every operation to that
  // home, which is the whole sandboxing mechanism for non-admin users.
  scoped(homeDir) {
    return new FileService(homeDir, this.maxUploadBytes, this.rootDir);
  }

  // Root service view for a user: admins see the whole storage, everyone else
  // is sandboxed to data/homes/<username>. Called on the root fileService.
  scopeForUser(user) {
    if (user.role === 'admin') return this;
    if (!isValidName(user.username)) {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        'Invalid username for home directory',
        400,
      );
    }
    return this.scoped(path.join(this.rootDir, 'homes', user.username));
  }

  // Lazily create a non-admin's home directory. Idempotent; called on login.
  async ensureHome(user) {
    if (user.role === 'admin') return;
    if (!isValidName(user.username)) {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        'Invalid username for home directory',
        400,
      );
    }
    await fs.promises.mkdir(
      path.join(this.rootDir, 'homes', user.username),
      { recursive: true },
    );
  }

  // Translate a home-relative user path into a root-relative path (for publicStore / /pub).
  toRootUserPath(userPath) {
    const abs = resolveStoragePath(userPath, this.storageDir);
    return toUserPath(abs, this.rootDir);
  }

  // Translate a root-relative path into this scope's home-relative path.
  // Returns null if the path lies outside this scope (e.g. another user's home).
  fromRootUserPath(rootUserPath) {
    let abs;
    try {
      abs = resolveStoragePath(rootUserPath, this.rootDir);
    } catch {
      return null;
    }
    const scope = path.resolve(this.storageDir);
    if (abs !== scope && !abs.startsWith(scope + path.sep)) return null;
    return toUserPath(abs, this.storageDir);
  }

  // ---------- stat ----------

  async stat(userPath) {
    const targetPath = resolveStoragePath(userPath, this.storageDir);
    try {
      const st = await fs.promises.stat(targetPath);
      return {
        type: st.isDirectory() ? "folder" : "file",
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      };
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Path not found",
          404,
        );
      }
      throw err;
    }
  }

  // ---------- list ----------

  async list(
    userPath,
    { page = 1, pageSize = 50, sort = "name", direction = "asc" } = {},
  ) {
    const dirPath = resolveStoragePath(userPath, this.storageDir);

    let stat;
    try {
      stat = await fs.promises.stat(dirPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Directory not found",
          404,
        );
      }
      throw err;
    }

    if (!stat.isDirectory()) {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        "Path is not a directory",
        400,
      );
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
        type: entry.isDirectory() ? "folder" : "file",
        size: entry.isDirectory() ? 0 : itemStat.size,
        modifiedAt: itemStat.mtime.toISOString(),
      });
    }

    const dir = direction === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sort === "name") {
        if (a.type !== b.type) return a.type === "folder" ? -dir : dir;
        return a.name.localeCompare(b.name) * dir;
      }
      if (sort === "size") return (a.size - b.size) * dir;
      if (sort === "modifiedAt")
        return (new Date(a.modifiedAt) - new Date(b.modifiedAt)) * dir;
      if (sort === "type") return a.type.localeCompare(b.type) * dir;
      return 0;
    });

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.min(
      200,
      Math.max(10, parseInt(pageSize, 10) || 50),
    );
    const total = items.length;
    const start = (safePage - 1) * safePageSize;

    return {
      path: userPath || "/",
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
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "File not found",
          404,
        );
      }
      throw err;
    }

    if (!stat.isFile()) {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        "Path is not a file",
        400,
      );
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
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        "Invalid folder name",
        400,
      );
    }

    const parentPath = resolveStoragePath(userPath, this.storageDir);

    try {
      const s = await fs.promises.stat(parentPath);
      if (!s.isDirectory()) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Parent path is not a directory",
          400,
        );
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Parent directory not found",
          404,
        );
      }
      throw err;
    }

    const folderPath = path.join(parentPath, name);
    try {
      await fs.promises.mkdir(folderPath);
    } catch (err) {
      if (err.code === "EEXIST") {
        throw new ApiError(
          ErrorCodes.ALREADY_EXISTS.code,
          "Folder already exists",
          409,
        );
      }
      throw err;
    }

    return {
      name,
      path: toUserPath(folderPath, this.storageDir),
      type: "folder",
    };
  }

  // ---------- rename ----------

  async rename(userPath, newName) {
    if (!isValidName(newName)) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Invalid name", 400);
    }

    const oldPath = resolveStoragePath(userPath, this.storageDir);
    const root = path.resolve(this.storageDir);
    if (oldPath === root) {
      throw new ApiError(
        ErrorCodes.FORBIDDEN_PATH.code,
        "Cannot rename root",
        403,
      );
    }

    try {
      await fs.promises.access(oldPath);
    } catch {
      throw new ApiError(
        ErrorCodes.FILE_NOT_FOUND.code,
        "File or folder not found",
        404,
      );
    }

    const newPath = path.join(path.dirname(oldPath), newName);
    if (newPath !== root && !newPath.startsWith(root + path.sep)) {
      throw new ApiError(
        ErrorCodes.FORBIDDEN_PATH.code,
        "New path is outside storage",
        403,
      );
    }

    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (err) {
      if (err.code === "EEXIST") {
        throw new ApiError(
          ErrorCodes.ALREADY_EXISTS.code,
          "Name already exists",
          409,
        );
      }
      throw err;
    }

    return {
      oldPath: userPath,
      newPath: toUserPath(newPath, this.storageDir),
      newName,
    };
  }

  // ---------- delete ----------

  async delete(userPath) {
    const targetPath = resolveStoragePath(userPath, this.storageDir);
    const root = path.resolve(this.storageDir);
    if (targetPath === root) {
      throw new ApiError(
        ErrorCodes.FORBIDDEN_PATH.code,
        "Cannot delete root",
        403,
      );
    }

    let stat;
    try {
      stat = await fs.promises.stat(targetPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "File or folder not found",
          404,
        );
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
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        "Invalid file name",
        400,
      );
    }

    const dirPath = resolveStoragePath(userPath, this.storageDir);

    try {
      const s = await fs.promises.stat(dirPath);
      if (!s.isDirectory()) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Target is not a directory",
          400,
        );
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Target directory not found",
          404,
        );
      }
      throw err;
    }

    const destPath = path.join(dirPath, filename);

    try {
      await fs.promises.access(destPath);
      if (!overwrite) {
        await fs.promises.unlink(tempPath).catch(() => {});
        throw new ApiError(
          ErrorCodes.ALREADY_EXISTS.code,
          "File already exists. Use overwrite=true",
          409,
        );
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }

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
      type: "file",
      size: finalStat.size,
    };
  }

  // ---------- move ----------

  async move(sourcePath, destPath) {
    const srcAbs = resolveStoragePath(sourcePath, this.storageDir);
    const dstAbs = resolveStoragePath(destPath, this.storageDir);
    const root = path.resolve(this.storageDir);

    if (srcAbs === root) {
      throw new ApiError(
        ErrorCodes.FORBIDDEN_PATH.code,
        "Cannot move root",
        403,
      );
    }

    try {
      await fs.promises.access(srcAbs);
    } catch {
      throw new ApiError(
        ErrorCodes.FILE_NOT_FOUND.code,
        "Source not found",
        404,
      );
    }

    const dstParent = path.dirname(dstAbs);
    try {
      const s = await fs.promises.stat(dstParent);
      if (!s.isDirectory()) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Destination parent is not a directory",
          400,
        );
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Destination directory not found",
          404,
        );
      }
      throw err;
    }

    try {
      await fs.promises.rename(srcAbs, dstAbs);
    } catch (err) {
      if (err.code === "EEXIST") {
        throw new ApiError(
          ErrorCodes.ALREADY_EXISTS.code,
          "File already exists at destination",
          409,
        );
      }
      throw err;
    }

    return { sourcePath, destPath };
  }
}

module.exports = { FileService };
