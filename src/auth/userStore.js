const fs = require('fs');
const { hashPassword, verifyPassword } = require('./password');

class UserStore {
  constructor(usersFile) {
    this.usersFile = usersFile;
    this.users = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.usersFile)) {
        const raw = fs.readFileSync(this.usersFile, 'utf-8');
        const data = JSON.parse(raw);
        this.users = Array.isArray(data.users) ? data.users : [];
        return;
      }
    } catch (err) {
      console.error('Failed to load users, starting fresh:', err.message);
    }
    this.users = [];
  }

  _save() {
    const tmp = this.usersFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ users: this.users }, null, 2), 'utf-8');
    fs.renameSync(tmp, this.usersFile);
  }

  findByUsername(username) {
    return this.users.find((u) => u.username === username) || null;
  }

  findById(id) {
    return this.users.find((u) => u.id === id) || null;
  }

  verifyCredentials(username, password) {
    const user = this.findByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return { id: user.id, username: user.username, role: user.role };
  }

  createUser({ id, username, password, role = 'user' }) {
    if (this.findByUsername(username)) {
      throw new Error(`User "${username}" already exists`);
    }
    const user = {
      id,
      username,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    this._save();
    return { id: user.id, username: user.username, role: user.role };
  }

  hasUsers() {
    return this.users.length > 0;
  }

  getAll() {
    return [...this.users];
  }

  updateRole(id, role) {
    const user = this.findById(id);
    if (!user) return false;
    user.role = role;
    this._save();
    return true;
  }

  deleteUser(id) {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    this._save();
    return true;
  }

  changePassword(id, newPassword) {
    const user = this.findById(id);
    if (!user) return false;
    user.passwordHash = hashPassword(newPassword);
    this._save();
    return true;
  }
}

module.exports = { UserStore };
