const crypto = require('crypto');
const fs = require('fs');

class SessionStore {
  constructor(sessionsFile, ttlHours) {
    this.sessionsFile = sessionsFile;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.sessions = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const raw = fs.readFileSync(this.sessionsFile, 'utf-8');
        const data = JSON.parse(raw);
        if (data.sessions) {
          for (const [id, session] of Object.entries(data.sessions)) {
            this.sessions.set(id, session);
          }
        }
        this.cleanExpired();
      }
    } catch (err) {
      console.error('Failed to load sessions, starting fresh:', err.message);
      this.sessions.clear();
    }
  }

  _save() {
    try {
      const data = { sessions: Object.fromEntries(this.sessions) };
      const tmp = this.sessionsFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.sessionsFile);
    } catch (err) {
      console.error('Failed to save sessions:', err.message);
    }
  }

  create(user) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      id: sessionId,
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    this._save();
    return sessionId;
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() - session.createdAt > this.ttlMs) {
      this.sessions.delete(sessionId);
      this._save();
      return null;
    }
    return session;
  }

  delete(sessionId) {
    const existed = this.sessions.delete(sessionId);
    if (existed) this._save();
    return existed;
  }

  cleanExpired() {
    const now = Date.now();
    let changed = false;
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > this.ttlMs) {
        this.sessions.delete(id);
        changed = true;
      }
    }
    if (changed) this._save();
  }
}

module.exports = { SessionStore };
