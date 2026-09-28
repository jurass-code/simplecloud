require("dotenv").config();

const { createApp } = require("./application");
const { loadConfig } = require("./config");

const DEFAULT_ADMIN_PASSWORD = "password";

async function bootstrapAdmin(userStore) {
  if (userStore.hasUsers()) return;

  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  userStore.createUser({
    id: "admin",
    username: "admin",
    password: adminPassword,
    role: "admin",
  });

  console.log("-------------------------------------------");
  console.log("  Admin user created:");
  console.log(`    username: admin`);
  console.log(`    password: ${adminPassword}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log("  Set ADMIN_PASSWORD env var to change this.");
  }
  console.log("-------------------------------------------");
}

const config = loadConfig();
const { app, userStore } = createApp(config);

bootstrapAdmin(userStore).then(() => {
  const server = app.listen(config.port, () => {
    console.log(`SimpleCloud running at http://localhost:${config.port}`);
    console.log(`Storage: ${config.storageDir}`);
    console.log(`Config:  ${config.configDir}`);
    console.log(`Mode:    ${config.nodeEnv}`);
    console.log(`Upload:  max ${config.maxUploadMb} MB, ${config.uploadChunkMb} MB slices`);
  });

  // Guard against requests that stop making progress. Note what each knob does
  // (measured on Node 22): requestTimeout covers the header phase only — a body
  // that stalls half-way is NOT aborted by it — while server.timeout is a real
  // socket inactivity timeout, which is what eventually drops a phone that lost
  // signal mid-upload. Both are disabled by REQUEST_TIMEOUT_MS=0.
  server.requestTimeout = config.requestTimeoutMs;
  server.timeout = config.requestTimeoutMs;
  server.headersTimeout = config.requestTimeoutMs
    ? Math.min(65 * 1000, config.requestTimeoutMs)
    : 65 * 1000;
  // Must outlast the idle timeout of the reverse proxy in front of us, or the
  // proxy reuses a socket Node just closed and the next request fails.
  server.keepAliveTimeout = 72 * 1000;
});
