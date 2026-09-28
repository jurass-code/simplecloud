const { Router } = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ApiError, ErrorCodes } = require("../shared/errors");
const { asyncRoute } = require("../shared/asyncRoute");
const { isValidName } = require("./pathSafety");
const { mimeFor, isInlineSafe } = require("./mimeTypes");
const { MAX_FILES_PER_UPLOAD } = require("../shared/limits");

// multer/busboy decode multipart filenames as latin1, so a UTF-8 name such as
// "Снимок экрана 2026-01-01.png" (macOS/iOS with a non-English locale, very
// common on phones) arrives as mojibake. Re-encode the raw bytes as UTF-8 when
// they form valid UTF-8; otherwise keep the original name.
function decodeOriginalName(name) {
  if (!name || typeof name !== "string") return name;
  const bytes = Buffer.from(name, "latin1");
  const decoded = bytes.toString("utf8");
  if (decoded.includes("\uFFFD")) return name;
  return Buffer.compare(Buffer.from(decoded, "utf8"), bytes) === 0
    ? decoded
    : name;
}

// Parse a single-range "bytes=" header. Returns { start, end } or
// { unsatisfiable: true } when the range cannot be served.
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start;
  let end;
  if (rawStart === "") {
    const suffixLength = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd === "" ? size - 1 : parseInt(rawEnd, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end > size - 1) end = size - 1;
  }

  if (start >= size || start > end) return { unsatisfiable: true };
  return { start, end };
}

function contentDisposition(kind, filename) {
  const ascii = String(filename).replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return (
    kind +
    '; filename="' +
    ascii +
    '"; filename*=UTF-8\'\'' +
    encodeURIComponent(filename)
  );
}

function createFileRoutes(rootFileService, publicStore, thumbnailService) {
  const router = Router();

  const upload = multer({
    dest: path.join(os.tmpdir(), "simplecloud-uploads"),
    limits: { fileSize: rootFileService.maxUploadBytes, files: MAX_FILES_PER_UPLOAD },
    fileFilter(_req, file, cb) {
      if (!isValidName(decodeOriginalName(file.originalname))) {
        cb(
          new ApiError(
            ErrorCodes.INVALID_REQUEST.code,
            "Invalid file name",
            400,
          ),
        );
        return;
      }
      cb(null, true);
    },
  });

  // Per-request scoped view: admins see the whole storage, everyone else is
  // confined to data/homes/<username> by resolveStoragePath containment.
  function svc(req) {
    return rootFileService.scopeForUser(req.user);
  }

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      const result = await svc(req).list(req.query.path, {
        page: req.query.page,
        pageSize: req.query.pageSize,
        sort: req.query.sort || "name",
        direction: req.query.direction || "asc",
      });
      res.json(result);
    }),
  );

  router.get(
    "/download",
    asyncRoute(async (req, res) => {
      const { filename, stream, size } = await svc(req).download(
        req.query.path,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", contentDisposition("attachment", filename));
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", size);
      stream.on("error", function () {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }),
  );

  // Inline media endpoint used by the in-app preview (images, video, audio).
  // Serves only whitelisted media types with correct MIME so <img>/<video> can
  // render, advertises byte ranges (Safari will not play video without 206
  // support), and falls back to a download for anything else — an uploaded
  // .html or .svg must never be rendered on the app's own origin.
  router.get(
    "/raw",
    asyncRoute(async (req, res) => {
      const file = await svc(req).resolveFile(req.query.path);
      const mime = mimeFor(file.filename);

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

      if (!isInlineSafe(mime)) {
        res.setHeader(
          "Content-Disposition",
          contentDisposition("attachment", file.filename),
        );
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", file.size);
        const stream = fs.createReadStream(file.filePath);
        stream.on("error", function () {
          if (!res.headersSent) res.status(500).end();
        });
        return stream.pipe(res);
      }

      res.setHeader("Content-Type", mime);
      res.setHeader(
        "Content-Disposition",
        contentDisposition("inline", file.filename),
      );
      res.setHeader("Accept-Ranges", "bytes");
      // Defence in depth: even a whitelisted type cannot run script if it is
      // ever navigated to directly.
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

      const range = req.headers.range ? parseRange(req.headers.range, file.size) : null;
      if (range && range.unsatisfiable) {
        res.status(416);
        res.setHeader("Content-Range", "bytes */" + file.size);
        return res.end();
      }

      if (range) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
        res.setHeader("Content-Length", range.end - range.start + 1);
        const stream = fs.createReadStream(file.filePath, {
          start: range.start,
          end: range.end,
        });
        stream.on("error", function () {
          if (!res.headersSent) res.status(500).end();
        });
        return stream.pipe(res);
      }

      res.setHeader("Content-Length", file.size);
      const stream = fs.createReadStream(file.filePath);
      stream.on("error", function () {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }),
  );

  router.get(
    "/thumbnail",
    asyncRoute(async (req, res) => {
      // Translate from home-relative to root-relative so the thumbnail cache
      // is keyed against the real storage path (shared across users for admin).
      const rootPath = svc(req).toRootUserPath(req.query.path);
      const { stream, size } = await thumbnailService.serve(rootPath);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      stream.on("error", function () {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }),
  );

  router.post(
    "/upload",
    upload.array("files", MAX_FILES_PER_UPLOAD),
    asyncRoute(async (req, res) => {
      if (!req.files || req.files.length === 0) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "No files provided",
          400,
        );
      }
      const overwrite = req.query.overwrite === "true";
      const userPath = req.query.path || "/";
      const s = svc(req);
      const results = [];
      for (const f of req.files) {
        const originalName = decodeOriginalName(f.originalname);
        try {
          const r = await s.uploadFromTemp(
            userPath,
            f.path,
            originalName,
            overwrite,
          );
          results.push({
            name: r.name,
            path: r.path,
            size: r.size,
            status: "ok",
          });
        } catch (err) {
          // Do not leak the temp file when the copy never happened.
          await fs.promises.unlink(f.path).catch(() => {});
          results.push({
            name: originalName,
            status: "error",
            message: err.message,
          });
        }
      }
      res.status(201).json({ files: results });
    }),
  );

  router.post(
    "/folder",
    asyncRoute(async (req, res) => {
      const { path: userPath, name } = req.body;
      if (!name) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Folder name is required",
          400,
        );
      }
      const result = await svc(req).createFolder(userPath || "/", name);
      res.status(201).json(result);
    }),
  );

  router.patch(
    "/rename",
    asyncRoute(async (req, res) => {
      const { path: userPath, newName } = req.body;
      if (!newName) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "New name is required",
          400,
        );
      }
      const result = await svc(req).rename(userPath, newName);
      res.json(result);
    }),
  );

  router.delete(
    "/",
    asyncRoute(async (req, res) => {
      const result = await svc(req).delete(req.query.path);
      res.json(result);
    }),
  );

  // Batch delete — max 50 paths
  router.post(
    "/delete-batch",
    asyncRoute(async (req, res) => {
      const paths = req.body.paths;
      if (!Array.isArray(paths) || paths.length === 0 || paths.length > 50) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Paths array must contain 1–50 items",
          400,
        );
      }
      const s = svc(req);
      const results = [];
      for (const p of paths) {
        try {
          await s.delete(p);
          results.push({ path: p, status: "ok" });
        } catch (err) {
          results.push({ path: p, status: "error", message: err.message });
        }
      }
      res.json({ deleted: results });
    }),
  );

  router.post(
    "/move",
    asyncRoute(async (req, res) => {
      const { sourcePath, destPath } = req.body;
      if (!sourcePath || !destPath) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "sourcePath and destPath are required",
          400,
        );
      }
      const result = await svc(req).move(sourcePath, destPath);
      res.json(result);
    }),
  );

  router.post(
    "/publish",
    asyncRoute(async (req, res) => {
      const userPath = req.body.path;
      if (!userPath) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Path is required",
          400,
        );
      }
      if (userPath === "/") {
        throw new ApiError(
          ErrorCodes.FORBIDDEN_PATH.code,
          "Cannot publish root directory",
          403,
        );
      }
      const s = svc(req);
      const stat = await s.stat(userPath);
      // publicStore and /pub operate on root-relative paths; translate from
      // the user's home-relative view so the link resolves correctly.
      const rootPath = s.toRootUserPath(userPath);
      const entry = publicStore.publish(rootPath, stat.type);
      res.status(201).json({
        path: userPath,
        type: entry.type,
        publicUrl: "/pub" + entry.path,
      });
    }),
  );

  router.delete(
    "/publish",
    asyncRoute(async (req, res) => {
      const userPath = req.body.path;
      if (!userPath) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST.code,
          "Path is required",
          400,
        );
      }
      const rootPath = svc(req).toRootUserPath(userPath);
      const ok = publicStore.unpublish(rootPath);
      if (!ok) {
        throw new ApiError(
          ErrorCodes.FILE_NOT_FOUND.code,
          "Published link not found",
          404,
        );
      }
      res.json({ success: true });
    }),
  );

  router.get(
    "/published",
    asyncRoute(async (req, res) => {
      const s = svc(req);
      // Only show this user's own published links. Non-admins get paths
      // translated back to their home-relative view; admins see all as-is.
      const items = publicStore
        .getAll()
        .map(function (entry) {
          const homePath = s.fromRootUserPath(entry.path);
          if (homePath === null) return null;
          return {
            path: homePath,
            type: entry.type,
            createdAt: entry.createdAt,
          };
        })
        .filter(Boolean);
      res.json(items);
    }),
  );

  return router;
}

module.exports = { createFileRoutes };
