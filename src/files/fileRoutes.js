const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { ApiError, ErrorCodes } = require('../shared/errors');
const { asyncRoute } = require('../shared/asyncRoute');
const { isValidName } = require('./pathSafety');

function createFileRoutes(fileService) {
  const router = Router();

  // Configure multer with temp storage
  const upload = multer({
    dest: path.join(os.tmpdir(), 'simplecloud-uploads'),
    limits: { fileSize: fileService.maxUploadBytes },
    fileFilter(_req, file, cb) {
      if (!isValidName(file.originalname)) {
        cb(new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Invalid file name', 400));
        return;
      }
      cb(null, true);
    },
  });

  // GET /api/files — list directory contents
  router.get('/', asyncRoute(async (req, res) => {
    const result = await fileService.list(req.query.path, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      sort: req.query.sort || 'name',
      direction: req.query.direction || 'asc',
    });
    res.json(result);
  }));

  // GET /api/files/download — download a file
  router.get('/download', asyncRoute(async (req, res) => {
    const { filename, stream, size } = await fileService.download(req.query.path);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }));

  // POST /api/files/upload
  router.post('/upload', upload.single('file'), asyncRoute(async (req, res) => {
    if (!req.file) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'No file provided', 400);
    }
    const overwrite = req.query.overwrite === 'true';
    const userPath = req.query.path || '/';
    const result = await fileService.uploadFromTemp(userPath, req.file.path, req.file.originalname, overwrite);
    res.status(201).json(result);
  }));

  // POST /api/files/folder — create folder
  router.post('/folder', asyncRoute(async (req, res) => {
    const { path: userPath, name } = req.body;
    if (!name) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Folder name is required', 400);
    }
    const result = await fileService.createFolder(userPath || '/', name);
    res.status(201).json(result);
  }));

  // PATCH /api/files/rename
  router.patch('/rename', asyncRoute(async (req, res) => {
    const { path: userPath, newName } = req.body;
    if (!newName) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'New name is required', 400);
    }
    const result = await fileService.rename(userPath, newName);
    res.json(result);
  }));

  // DELETE /api/files
  router.delete('/', asyncRoute(async (req, res) => {
    const result = await fileService.delete(req.query.path);
    res.json(result);
  }));

  // POST /api/files/move
  router.post('/move', asyncRoute(async (req, res) => {
    const { sourcePath, destPath } = req.body;
    if (!sourcePath || !destPath) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'sourcePath and destPath are required', 400);
    }
    const result = await fileService.move(sourcePath, destPath);
    res.json(result);
  }));

  return router;
}

module.exports = { createFileRoutes };
