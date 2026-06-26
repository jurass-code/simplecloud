const { Router } = require('express');
const { ApiError, ErrorCodes } = require('../shared/errors');
const { asyncRoute } = require('../shared/asyncRoute');

function createAdminRoutes(userStore) {
  const router = Router();

  router.get('/users', asyncRoute(async (_req, res) => {
    const users = userStore.getAll().map(function (u) {
      return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
    });
    res.json({ users: users });
  }));

  router.post('/users', asyncRoute(async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Username and password are required', 400);
    if (username.length < 2 || username.length > 32) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Username must be 2–32 characters', 400);
    if (password.length < 4) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Password must be at least 4 characters', 400);
    const safeRole = role === 'admin' ? 'admin' : 'user';
    try {
      const user = userStore.createUser({ id: username, username, password, role: safeRole });
      res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      if (err.message && err.message.includes('already exists')) throw new ApiError(ErrorCodes.ALREADY_EXISTS.code, err.message, 409);
      throw err;
    }
  }));

  router.patch('/users/:username', asyncRoute(async (req, res) => {
    const targetUser = userStore.findByUsername(req.params.username);
    if (!targetUser) throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'User not found', 404);
    if (targetUser.id === req.user.id && req.body.role !== 'admin') throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Cannot demote yourself', 400);
    const newRole = req.body.role === 'admin' ? 'admin' : 'user';
    userStore.updateRole(targetUser.id, newRole);
    res.json({ id: targetUser.id, username: targetUser.username, role: newRole });
  }));

  router.patch('/users/:username/password', asyncRoute(async (req, res) => {
    const targetUser = userStore.findByUsername(req.params.username);
    if (!targetUser) throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'User not found', 404);
    const pw = req.body.password;
    if (!pw || pw.length < 4) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Password must be at least 4 characters', 400);
    userStore.changePassword(targetUser.id, pw);
    res.json({ success: true });
  }));

  router.delete('/users/:username', asyncRoute(async (req, res) => {
    const targetUser = userStore.findByUsername(req.params.username);
    if (!targetUser) throw new ApiError(ErrorCodes.FILE_NOT_FOUND.code, 'User not found', 404);
    if (targetUser.id === req.user.id) throw new ApiError(ErrorCodes.INVALID_REQUEST.code, 'Cannot delete yourself', 400);
    userStore.deleteUser(targetUser.id);
    res.json({ success: true });
  }));

  return router;
}

module.exports = { createAdminRoutes };
