const { ApiError, ErrorCodes } = require('../shared/errors');

function createAuthMiddleware(sessionStore) {
  return function authMiddleware(req, res, next) {
    const sessionId = req.cookies?.simplecloud_sid;
    if (sessionId) {
      const session = sessionStore.get(sessionId);
      if (session) {
        req.user = {
          id: session.userId,
          username: session.username,
          role: session.role,
        };
        req.sessionId = sessionId;
        return next();
      }
    }

    throw new ApiError(
      ErrorCodes.UNAUTHORIZED.code,
      'Authentication required',
      ErrorCodes.UNAUTHORIZED.status,
    );
  };
}

module.exports = { createAuthMiddleware };
