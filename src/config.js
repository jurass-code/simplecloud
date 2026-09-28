const path = require("path");
const fs = require("fs");

function loadConfig() {
  const port = parseInt(process.env.PORT, 10) || 3001;
  const storageDir = path.resolve(process.env.STORAGE_DIR || "./data");
  const configDir = path.resolve(process.env.CONFIG_DIR || "./config");
  const sessionTtlHours = parseInt(process.env.SESSION_TTL_HOURS, 10) || 24;
  const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB, 10) || 100;
  // Large files are uploaded in slices of this size (see chunkedUploadRoutes).
  const chunkMb = parseInt(process.env.UPLOAD_CHUNK_MB, 10);
  const uploadChunkMb = Number.isFinite(chunkMb) && chunkMb > 0 ? chunkMb : 8;
  // Inactivity budget for one connection, in ms (0 disables). A phone that
  // loses signal leaves a socket that would otherwise hang until the OS gives
  // up; this is how long the server waits for progress before dropping it.
  // Slices keep a single request short either way.
  const rawRequestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS, 10);
  const requestTimeoutMs = Number.isFinite(rawRequestTimeout)
    ? rawRequestTimeout
    : 15 * 60 * 1000;
  const nodeEnv = process.env.NODE_ENV || "development";

  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });

  return {
    port,
    storageDir,
    configDir,
    sessionTtlHours,
    maxUploadMb,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    uploadChunkMb,
    uploadChunkBytes: uploadChunkMb * 1024 * 1024,
    requestTimeoutMs,
    uploadDir: path.join(configDir, "uploads"),
    nodeEnv,
    isProduction: nodeEnv === "production",
    usersFile: path.join(configDir, "users.json"),
    sessionsFile: path.join(configDir, "sessions.json"),
    publicFile: path.join(configDir, "public.json"),
    cookieName: "simplecloud_sid",
  };
}

module.exports = { loadConfig };
