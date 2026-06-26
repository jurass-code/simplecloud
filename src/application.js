const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { errorHandler, ApiError, ErrorCodes } = require('./shared/errors');
const { asyncRoute } = require('./shared/asyncRoute');
const { UserStore } = require('./auth/userStore');
const { SessionStore } = require('./auth/sessions');
const { createAuthMiddleware } = require('./auth/authMiddleware');
const { FileService } = require('./files/fileService');
const { createFileRoutes } = require('./files/fileRoutes');
const { PublicStore } = require('./files/publicStore');
const { resolveStoragePath } = require('./files/pathSafety');
const { createAdminRoutes } = require('./admin/adminRoutes');
const { requireAdmin } = require('./admin/adminMiddleware');

function createPublicRouter(publicStore, storageDir) {
  const router = express.Router();

  router.get('/*', asyncRoute(async (req, res) => {
    const urlPath = '/' + (req.params[0] || '').replace(/\/+$/, '') || '/';
    const match = publicStore.findMatching(urlPath);
    if (!match) throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'Not published', 404);

    const { entry, subpath } = match;
    const realPath = subpath ? entry.path + '/' + subpath : entry.path;
    const absolutePath = resolveStoragePath(realPath, storageDir);

    let stat;
    try { stat = await fs.promises.stat(absolutePath); }
    catch (err) { if (err.code === 'ENOENT') throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'File not found', 404); throw err; }

    if (stat.isDirectory()) {
      if (!req.originalUrl.endsWith('/') && subpath !== '') return res.redirect(req.originalUrl + '/');
      const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
      const items = [];
      for (const e of entries) {
        try { const st = await fs.promises.stat(path.join(absolutePath, e.name)); items.push({ name: e.name, type: e.isDirectory() ? 'folder' : 'file', size: st.size }); }
        catch { /* skip */ }
      }
      items.sort((a, b) => { if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; return a.name.localeCompare(b.name); });
      const displayPath = subpath || entry.path;
      const cleanUrl = req.originalUrl.split('?')[0];
      const parentUrl = path.posix.dirname(cleanUrl) || '/pub';
      const base = cleanUrl.endsWith('/') ? cleanUrl : cleanUrl + '/';

      const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + e(displayPath) + '</title>' +
        '<style>body{font:14px -apple-system,sans-serif;max-width:800px;margin:20px auto;padding:0 16px}' +
        'a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}' +
        'table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #e0e0e0}' +
        '.folder{color:#f59e0b}.size{color:#666;font-size:13px}h2{font-size:18px;margin-bottom:12px}' +
        '.back{margin-bottom:12px;font-size:13px}</style></head><body>' +
        '<h2>&#128193; ' + e(displayPath) + '</h2>' +
        (subpath ? '<p class="back"><a href="' + ea(parentUrl) + '">&#11017; Parent</a></p>' : '') +
        '<table>' + items.map(function (i) { return '<tr><td>' + (i.type === 'folder' ? '<span class="folder">&#128193;</span>' : '&#128196;') +
        ' <a href="' + ea(base + i.name) + (i.type === 'folder' ? '/' : '') + '">' + e(i.name) + '</a></td>' +
        '<td class="size">' + (i.type === 'folder' ? '' : fmt(i.size)) + '</td></tr>'; }).join('') + '</table></body></html>';
      return res.send(html);
    }

    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(path.basename(absolutePath)) + '"');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(absolutePath);
    stream.on('error', function () { if (!res.headersSent) res.status(500).end(); });
    stream.pipe(res);
  }));
  return router;
}

function fmt(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'; return (b / 1073741824).toFixed(1) + ' GB'; }
function e(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ea(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function createApp(config) {
  const app = express();
  const userStore = new UserStore(config.usersFile);
  const sessionStore = new SessionStore(config.sessionsFile, config.sessionTtlHours);
  const fileService = new FileService(config.storageDir, config.maxUploadBytes);
  const publicStore = new PublicStore(config.publicFile);

  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const requireAuth = createAuthMiddleware(sessionStore);

  app.use('/pub', createPublicRouter(publicStore, config.storageDir));

  app.get('/api/health', function (_req, res) { res.json({ status: 'ok' }); });

  app.post('/api/auth/login', asyncRoute(async function (req, res) {
    const { username, password } = req.body;
    if (!username || !password) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Username and password are required', 400);
    const user = userStore.verifyCredentials(username, password);
    if (!user) throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'Invalid username or password', 401);
    const sessionId = sessionStore.create(user);
    res.cookie(config.cookieName, sessionId, { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: config.sessionTtlHours * 60 * 60 * 1000, path: '/' });
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  }));

  app.post('/api/auth/logout', function (req, res) {
    const sid = req.cookies && req.cookies[config.cookieName];
    if (sid) sessionStore.delete(sid);
    res.clearCookie(config.cookieName, { path: '/' });
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, function (req, res) {
    const user = userStore.findById(req.user.id);
    if (!user) throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'User not found', 401);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.patch('/api/auth/password', requireAuth, asyncRoute(async function (req, res) {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Old and new passwords are required', 400);
    if (newPassword.length < 4) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'New password must be at least 4 characters', 400);
    const ok = userStore.verifyCredentials(req.user.username, oldPassword);
    if (!ok) throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'Current password is incorrect', 401);
    userStore.changePassword(req.user.id, newPassword);
    res.json({ success: true });
  }));

  const fileRoutes = createFileRoutes(fileService, publicStore);
  app.use('/api/files', requireAuth, fileRoutes);

  const adminRoutes = createAdminRoutes(userStore);
  app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);

  app.use('/api/*', function (_req, res) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }); });
  app.use(errorHandler);

  return { app, userStore, config };
}

module.exports = { createApp };
