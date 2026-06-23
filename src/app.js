const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { errorHandler, ApiError, ErrorCodes } = require('./shared/errors');
const { asyncRoute } = require('./shared/asyncRoute');
const { UserStore } = require('./auth/userStore');
const { SessionStore } = require('./auth/sessions');
const { createAuthMiddleware } = require('./auth/authMiddleware');
const { FileService } = require('./files/fileService');
const { createFileRoutes } = require('./files/fileRoutes');

function createApp(config) {
  const app = express();

  // ---- stores ----
  const userStore = new UserStore(config.usersFile);
  const sessionStore = new SessionStore(config.sessionsFile, config.sessionTtlHours);
  const fileService = new FileService(config.storageDir, config.maxUploadBytes);

  // ---- middleware ----
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Attach stores for route access
  app.locals.userStore = userStore;
  app.locals.sessionStore = sessionStore;

  // ---- auth middleware factory ----
  const requireAuth = createAuthMiddleware(sessionStore);

  // ---- health ----
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- auth routes ----
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Username and password are required', 400);
    }

    const user = userStore.verifyCredentials(username, password);
    if (!user) {
      throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'Invalid username or password', 401);
    }

    const sessionId = sessionStore.create(user);

    res.cookie(config.cookieName, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlHours * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  }));

  app.post('/api/auth/logout', (req, res) => {
    const sessionId = req.cookies?.[config.cookieName];
    if (sessionId) {
      sessionStore.delete(sessionId);
    }
    res.clearCookie(config.cookieName, { path: '/' });
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = userStore.findById(req.user.id);
    if (!user) {
      throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'User not found', 401);
    }
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  // ---- file routes (all require auth) ----
  const fileRoutes = createFileRoutes(fileService);
  app.use('/api/files', requireAuth, fileRoutes);

  // ---- 404 for unknown API routes ----
  app.use('/api/*', (_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  // ---- error handler ----
  app.use(errorHandler);

  return { app, userStore, config };
}

module.exports = { createApp };
