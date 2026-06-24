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
  app.listen(config.port, () => {
    console.log(`SimpleCloud running at http://localhost:${config.port}`);
    console.log(`Storage: ${config.storageDir}`);
    console.log(`Config:  ${config.configDir}`);
    console.log(`Mode:    ${config.nodeEnv}`);
  });
});
