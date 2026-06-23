#!/usr/bin/env node
const path = require('path');
const { loadConfig } = require('../src/config');
const { UserStore } = require('../src/auth/userStore');

const config = loadConfig();
const userStore = new UserStore(config.usersFile);

const args = process.argv.slice(2);
const username = args[0] || 'admin';
const password = args[1] || 'password';
const role = args[2] || 'admin';

if (userStore.findByUsername(username)) {
  console.log(`User "${username}" already exists.`);
  process.exit(0);
}

userStore.createUser({
  id: username,
  username,
  password,
  role,
});

console.log(`User "${username}" created with role "${role}".`);
