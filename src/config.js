const path = require("path");
const fs = require("fs");

function loadConfig() {
  const port = parseInt(process.env.PORT, 10) || 3000;
  const storageDir = path.resolve(process.env.STORAGE_DIR || "./data");
  const configDir = path.resolve(process.env.CONFIG_DIR || "./config");
  const sessionTtlHours = parseInt(process.env.SESSION_TTL_HOURS, 10) || 24;
  const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB, 10) || 100;
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
    nodeEnv,
    isProduction: nodeEnv === "production",
    usersFile: path.join(configDir, "users.json"),
    sessionsFile: path.join(configDir, "sessions.json"),
    publicFile: path.join(configDir, "public.json"),
    cookieName: "simplecloud_sid",
  };
}

module.exports = { loadConfig };
