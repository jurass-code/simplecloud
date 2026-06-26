const { ApiError, ErrorCodes } = require('../shared/errors');

function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    throw new ApiError(ErrorCodes.UNAUTHORIZED.code, 'Admin access required', 403);
  }
  next();
}

module.exports = { requireAdmin };
