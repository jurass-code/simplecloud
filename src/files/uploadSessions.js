"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// A big upload is accepted in slices instead of one long request. The bytes
// that already arrived stay on disk, so an interrupted transfer (mobile network
// drop, Safari reloading the tab, a proxy timeout, a server restart) can be
// continued from the last confirmed offset instead of starting over.
//
// Layout, inside CONFIG_DIR/uploads:
//   <id>.json  metadata: owner, destination folder, file name/size, offset
//   <id>.part  the bytes received so far
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ID_RE = /^[a-f0-9]{32}$/;

class UploadSessionStore {
  constructor(config) {
    this.dir = config.uploadDir;
    this.maxUploadBytes = config.maxUploadBytes;
    this.chunkBytes = config.uploadChunkBytes;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  metaPath(id) {
    return path.join(this.dir, id + ".json");
  }

  partPath(id) {
    return path.join(this.dir, id + ".part");
  }

  async read(id) {
    if (!ID_RE.test(String(id || ""))) return null;
    try {
      const meta = JSON.parse(await fs.promises.readFile(this.metaPath(id), "utf8"));
      if (!meta || meta.id !== id || typeof meta.size !== "number") return null;
      return meta;
    } catch (err) {
      return null;
    }
  }

  async write(meta) {
    meta.updatedAt = Date.now();
    const tmp = this.metaPath(meta.id) + "." + process.pid + ".tmp";
    await fs.promises.writeFile(tmp, JSON.stringify(meta));
    await fs.promises.rename(tmp, this.metaPath(meta.id));
  }

  async create({ userId, userPath, name, size }) {
    const id = crypto.randomBytes(16).toString("hex");
    await fs.promises.writeFile(this.partPath(id), "");
    const meta = {
      id,
      userId,
      path: userPath,
      name,
      size,
      received: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.write(meta);
    return meta;
  }

  // The part file is the source of truth: it is what actually survived a crash.
  // `received` follows the file, and any bytes beyond the confirmed offset
  // (written by a chunk that never completed) are dropped.
  async reconcile(meta) {
    const part = this.partPath(meta.id);
    let size = 0;
    try {
      size = (await fs.promises.stat(part)).size;
    } catch (err) {
      size = 0;
    }
    if (size > meta.received) {
      await fs.promises.truncate(part, meta.received).catch(() => {});
      size = meta.received;
    } else if (size < meta.received) {
      meta.received = size;
      await this.write(meta);
    }
    return meta.received;
  }

  async list() {
    let names;
    try {
      names = await fs.promises.readdir(this.dir);
    } catch (err) {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const meta = await this.read(name.slice(0, -5));
      if (meta) out.push(meta);
    }
    return out;
  }

  // Reuse the session for the same file instead of writing a second copy: this
  // is what makes "select the file again" continue instead of restarting.
  async findResumable(userId, userPath, name, size) {
    const now = Date.now();
    const all = await this.list();
    return (
      all.find(
        (m) =>
          m.userId === userId &&
          m.path === userPath &&
          m.name === name &&
          m.size === size &&
          now - m.updatedAt < SESSION_MAX_AGE_MS,
      ) || null
    );
  }

  async listForUser(userId) {
    const all = await this.list();
    return all
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id) {
    await fs.promises.rm(this.partPath(id), { force: true }).catch(() => {});
    await fs.promises.rm(this.metaPath(id), { force: true }).catch(() => {});
  }

  async pruneStale(now = Date.now()) {
    const all = await this.list();
    let removed = 0;
    for (const meta of all) {
      if (now - (meta.updatedAt || 0) > SESSION_MAX_AGE_MS) {
        await this.remove(meta.id);
        removed += 1;
      }
    }
    return removed;
  }
}

function createUploadSessionStore(config) {
  return new UploadSessionStore(config);
}

module.exports = { UploadSessionStore, createUploadSessionStore, SESSION_MAX_AGE_MS };
