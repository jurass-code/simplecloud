const { Router } = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");
const { ApiError, ErrorCodes } = require("../shared/errors");
const { asyncRoute } = require("../shared/asyncRoute");
const { isValidName } = require("./pathSafety");

function createFileRoutes(fileService, publicStore) {
  const router = Router();

  const upload = multer({
    dest: path.join(os.tmpdir(), "simplecloud-uploads"),
    limits: { fileSize: fileService.maxUploadBytes, files: 50 },
    fileFilter(_req, file, cb) {
      if (!isValidName(file.originalname)) {
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

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      const result = await fileService.list(req.query.path, {
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
      const { filename, stream, size } = await fileService.download(
        req.query.path,
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="' + encodeURIComponent(filename) + '"',
      );
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", size);
      stream.on("error", function () {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }),
  );

  router.post(
    "/upload",
    upload.array("files", 50),
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
      const results = [];
      for (const f of req.files) {
        try {
          const r = await fileService.uploadFromTemp(
            userPath,
            f.path,
            f.originalname,
            overwrite,
          );
          results.push({
            name: r.name,
            path: r.path,
            size: r.size,
            status: "ok",
          });
        } catch (err) {
          results.push({
            name: f.originalname,
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
      const result = await fileService.createFolder(userPath || "/", name);
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
      const result = await fileService.rename(userPath, newName);
      res.json(result);
    }),
  );

  router.delete(
    "/",
    asyncRoute(async (req, res) => {
      const result = await fileService.delete(req.query.path);
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
      const results = [];
      for (const p of paths) {
        try {
          await fileService.delete(p);
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
      const result = await fileService.move(sourcePath, destPath);
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
      const stat = await fileService.stat(userPath);
      const entry = publicStore.publish(userPath, stat.type);
      res
        .status(201)
        .json({
          path: entry.path,
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
      const ok = publicStore.unpublish(userPath);
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
    asyncRoute(async (_req, res) => {
      res.json(publicStore.getAll());
    }),
  );

  return router;
}

module.exports = { createFileRoutes };
