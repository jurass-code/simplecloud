const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ApiError, ErrorCodes } = require("../shared/errors");
const { resolveStoragePath } = require("./pathSafety");

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".tiff", ".tif", ".bmp",
]);

const THUMBNAIL_SIZE = 200;
const THUMBNAIL_QUALITY = 75;
const CACHE_DIR = ".thumbnails";

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

class ThumbnailService {
  // storageDir is the root storage path; thumbnails are cached under
  // storageDir/.thumbnails/<relative-path>.jpg so they survive restarts.
  constructor(storageDir) {
    this.storageDir = storageDir;
    this.cacheDir = path.join(storageDir, CACHE_DIR);
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  // Returns a cache key for a file: a flat filename derived from the
  // storage-relative path by replacing path separators with underscores.
  _cacheKey(userPath) {
    const abs = resolveStoragePath(userPath, this.storageDir);
    const relative = path.relative(this.storageDir, abs);
    return relative.split(path.sep).join("__") + ".jpg";
  }

  _cachePath(userPath) {
    return path.join(this.cacheDir, this._cacheKey(userPath));
  }

  // Serve a thumbnail. Returns { stream, size, cached }.
  // If a cache hit: serve the cached file. Otherwise generate, cache, and return.
  async serve(userPath) {
    const absPath = resolveStoragePath(userPath, this.storageDir);

    let sourceStat;
    try {
      sourceStat = await fs.promises.stat(absPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, "File not found", 404);
      }
      throw err;
    }

    if (!sourceStat.isFile()) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Not a file", 400);
    }

    if (!isImageFile(path.basename(absPath))) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Not an image file", 400);
    }

    const thumbPath = this._cachePath(userPath);

    // Cache hit: return cached thumbnail if it's newer than the source file.
    try {
      const thumbStat = await fs.promises.stat(thumbPath);
      if (thumbStat.mtimeMs >= sourceStat.mtimeMs) {
        const stream = fs.createReadStream(thumbPath);
        return { stream, size: thumbStat.size, cached: true };
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    // Generate new thumbnail.
    await sharp(absPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(thumbPath);

    const thumbStat = await fs.promises.stat(thumbPath);
    const stream = fs.createReadStream(thumbPath);
    return { stream, size: thumbStat.size, cached: false };
  }
}

module.exports = { ThumbnailService, isImageFile };
