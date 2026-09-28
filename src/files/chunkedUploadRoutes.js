"use strict";

const fs = require("fs");
const path = require("path");
const { ApiError, ErrorCodes } = require("../shared/errors");
const { asyncRoute } = require("../shared/asyncRoute");
const { resolveStoragePath, isValidName } = require("./pathSafety");

// Slice-based upload endpoints. The client slices a large file (video from an
// iPhone camera roll, typically hundreds of MB) and sends one slice per request:
//
//   POST   /api/files/upload/start   {path, name, size}  -> {uploadId, received}
//   PUT    /api/files/upload/chunk   ?id=&offset=         -> {received}
//   POST   /api/files/upload/finish  ?id=                 -> {files:[...]}
//   GET    /api/files/upload/status                       -> resumable sessions
//   DELETE /api/files/upload/session ?id=
//
// Why this shape: a single 600 MB multipart body is at the mercy of a reverse
// proxy's body limit and timeouts, of the browser keeping the whole upload in
// one in-memory request, and of anything that interrupts it (a network drop, a
// phone locking Safari, a server restart) — which loses every byte received so
// far. One 8 MB slice is none of those things, and a slice that fails is retried
// from the same offset instead of restarting the transfer.

// Collect the request body with a hard cap so a malicious/broken client cannot
// stream gigabytes into memory or past the declared file size.
function receiveChunk(req, partPath, start, cap) {
  return new Promise((resolve, reject) => {
    let written = 0;
    let settled = false;
    const ws = fs.createWriteStream(partPath, { flags: "r+", start });

    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(written);
    };

    ws.on("error", done);
    req.on("error", done);
    req.on("aborted", () =>
      done(new ApiError(ErrorCodes.INVALID_REQUEST.code, "Upload aborted", 400)),
    );
    req.on("data", (buf) => {
      written += buf.length;
      if (written > cap) {
        const err = new ApiError(
          ErrorCodes.UPLOAD_TOO_LARGE.code,
          "Chunk is larger than the allowed slice size",
          413,
        );
        req.destroy();
        ws.destroy();
        done(err);
        return;
      }
      if (!ws.write(buf)) {
        req.pause();
        ws.once("drain", () => req.resume());
      }
    });
    req.on("end", () => {
      ws.end(() => done(null));
    });
  });
}

function splitName(name) {
  const i = name.lastIndexOf(".");
  if (i < 1) return [name, ""];
  return [name.slice(0, i), name.slice(i)];
}

// Same convention as the client ("video (1).mov") so a name collision is
// resolved without throwing away bytes we already received.
async function uniqueNameIn(dirPath, name) {
  let taken;
  try {
    taken = new Set((await fs.promises.readdir(dirPath)).map((n) => n.toLowerCase()));
  } catch (err) {
    return name;
  }
  if (!taken.has(name.toLowerCase())) return name;
  const [base, ext] = splitName(name);
  for (let i = 1; i < 500; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(1) + " MB";
}

function registerChunkedUploadRoutes(router, { config, uploadSessions, serviceFor }) {
  const store = uploadSessions;

  // Fail before the client spends bandwidth: the target folder must exist.
  function targetDir(service, userPath) {
    let abs;
    try {
      abs = resolveStoragePath(userPath, service.storageDir);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Invalid path", 400);
    }
    return abs;
  }

  async function assertDirectory(service, userPath) {
    const abs = targetDir(service, userPath);
    let stat;
    try {
      stat = await fs.promises.stat(abs);
    } catch (err) {
      throw new ApiError(
        ErrorCodes.FILE_NOT_FOUND.code,
        "Target directory not found",
        404,
      );
    }
    if (!stat.isDirectory()) {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST.code,
        "Target is not a directory",
        400,
      );
    }
    return abs;
  }

  async function ownedSession(req, id) {
    const meta = await store.read(id);
    if (!meta || meta.userId !== req.user.id) {
      throw new ApiError(
        "UPLOAD_SESSION_NOT_FOUND",
        "Upload session not found or expired",
        404,
      );
    }
    return meta;
  }

  router.post(
    "/upload/start",
    asyncRoute(async (req, res) => {
      const body = req.body || {};
      const userPath = typeof body.path === "string" && body.path ? body.path : "/";
      const name = typeof body.name === "string" ? body.name : "";
      const size = Number(body.size);

      if (!isValidName(name)) {
        throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Invalid file name", 400);
      }
      if (!Number.isInteger(size) || size <= 0) {
        throw new ApiError(ErrorCodes.INVALID_REQUEST.code, "Invalid file size", 400);
      }
      if (size > config.maxUploadBytes) {
        throw new ApiError(
          ErrorCodes.UPLOAD_TOO_LARGE.code,
          `File is ${formatSize(size)} — the server limit is ${config.maxUploadMb} MB`,
          413,
        );
      }

      // Fire-and-forget housekeeping: sessions older than a day are dead bytes.
      store.pruneStale().catch(() => {});

      const service = serviceFor(req);
      await assertDirectory(service, userPath);

      let meta = await store.findResumable(req.user.id, userPath, name, size);
      if (!meta) {
        meta = await store.create({
          userId: req.user.id,
          userPath,
          name,
          size,
        });
      }
      const received = await store.reconcile(meta);
      res.json({
        uploadId: meta.id,
        received,
        chunkBytes: store.chunkBytes,
        name: meta.name,
        size: meta.size,
      });
    }),
  );

  router.put(
    "/upload/chunk",
    asyncRoute(async (req, res) => {
      const meta = await ownedSession(req, req.query.id);
      const offset = Number(req.query.offset);
      const received = await store.reconcile(meta);

      if (!Number.isInteger(offset) || offset < 0 || offset !== received) {
        // The client's idea of the offset is stale (a chunk was retried after a
        // partial write, or the tab reloaded). Tell it the truth.
        res.status(409).json({
          error: {
            code: "UPLOAD_OFFSET_MISMATCH",
            message: "Upload offset does not match the server",
          },
          uploadId: meta.id,
          received,
        });
        return;
      }
      if (received >= meta.size) {
        res.json({ uploadId: meta.id, received, complete: true });
        return;
      }

      const remaining = meta.size - received;
      // Slack over the nominal slice size keeps the last slice and slightly
      // larger client slices working; the declared file size is still the cap.
      const cap = Math.min(store.chunkBytes * 2, remaining);
      const declared = Number(req.headers["content-length"]);
      if (Number.isFinite(declared) && declared > cap) {
        throw new ApiError(
          ErrorCodes.UPLOAD_TOO_LARGE.code,
          "Chunk is larger than the allowed slice size",
          413,
        );
      }

      const part = store.partPath(meta.id);
      // Any bytes a previous failed attempt left behind are invalid; start the
      // slice from the offset both sides agreed on.
      await fs.promises.truncate(part, received).catch(() => {});

      let written;
      try {
        written = await receiveChunk(req, part, received, cap);
      } catch (err) {
        // Never keep an unconfirmed tail: the resume offset must stay truthful.
        await fs.promises.truncate(part, received).catch(() => {});
        throw err;
      }

      meta.received = received + written;
      await store.write(meta);
      res.json({
        uploadId: meta.id,
        received: meta.received,
        size: meta.size,
      });
    }),
  );

  router.post(
    "/upload/finish",
    asyncRoute(async (req, res) => {
      const meta = await ownedSession(req, req.query.id);
      const received = await store.reconcile(meta);
      if (received !== meta.size) {
        res.status(409).json({
          error: {
            code: "UPLOAD_INCOMPLETE",
            message:
              "Upload is not complete (" +
              formatSize(received) +
              " of " +
              formatSize(meta.size) +
              ")",
          },
          uploadId: meta.id,
          received,
          size: meta.size,
        });
        return;
      }

      const service = serviceFor(req);
      const dirPath = await assertDirectory(service, meta.path);
      const finalName = await uniqueNameIn(dirPath, meta.name);

      const result = await service.uploadFromTemp(
        meta.path,
        store.partPath(meta.id),
        finalName,
        false,
      );
      await store.remove(meta.id);
      res.json({
        files: [
          {
            status: "ok",
            name: result.name,
            path: result.path,
            type: "file",
            size: result.size,
          },
        ],
      });
    }),
  );

  router.get(
    "/upload/status",
    asyncRoute(async (req, res) => {
      const metas = await store.listForUser(req.user.id);
      const sessions = [];
      for (const meta of metas) {
        const received = await store.reconcile(meta);
        if (received <= 0 || received >= meta.size) continue;
        sessions.push({
          uploadId: meta.id,
          path: meta.path,
          name: meta.name,
          size: meta.size,
          received,
          updatedAt: meta.updatedAt,
        });
      }
      res.json({ sessions, chunkBytes: store.chunkBytes });
    }),
  );

  // Cancel: drop the partial bytes the client no longer wants.
  router.delete(
    "/upload/session",
    asyncRoute(async (req, res) => {
      const meta = await store.read(req.query.id);
      if (meta && meta.userId === req.user.id) await store.remove(meta.id);
      res.json({ deleted: true });
    }),
  );
}

module.exports = { registerChunkedUploadRoutes, receiveChunk, uniqueNameIn };
