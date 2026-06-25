const fs = require("fs");

class PublicStore {
  constructor(publicFile) {
    this.publicFile = publicFile;
    this.published = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.publicFile)) {
        const raw = fs.readFileSync(this.publicFile, "utf-8");
        const data = JSON.parse(raw);
        this.published = Array.isArray(data.published) ? data.published : [];
        return;
      }
    } catch (err) {
      console.error(
        "Failed to load public links, starting fresh:",
        err.message,
      );
    }
    this.published = [];
  }

  _save() {
    const tmp = this.publicFile + ".tmp";
    fs.writeFileSync(
      tmp,
      JSON.stringify({ published: this.published }, null, 2),
      "utf-8",
    );
    fs.renameSync(tmp, this.publicFile);
  }

  publish(userPath, type) {
    if (this.findByPath(userPath)) {
      return this.findByPath(userPath);
    }
    const entry = {
      path: userPath,
      type,
      createdAt: new Date().toISOString(),
    };
    this.published.push(entry);
    this._save();
    return entry;
  }

  unpublish(userPath) {
    const idx = this.published.findIndex((e) => e.path === userPath);
    if (idx === -1) return false;
    this.published.splice(idx, 1);
    this._save();
    return true;
  }

  findByPath(userPath) {
    return this.published.find((e) => e.path === userPath) || null;
  }

  // Find the matching published entry for a URL path.
  // Returns the entry and the relative subpath within it (for folders).
  findMatching(urlPath) {
    // Normalise: ensure leading /
    let p = urlPath;
    if (!p.startsWith("/")) p = "/" + p;

    // Exact match first
    for (const entry of this.published) {
      if (entry.path === p) return { entry, subpath: "" };
    }

    // Check if urlPath is inside a published folder
    // Sort by path length descending so deeper folders match first
    const folders = this.published
      .filter((e) => e.type === "folder")
      .sort((a, b) => b.path.length - a.path.length);

    for (const entry of folders) {
      const prefix = entry.path.endsWith("/") ? entry.path : entry.path + "/";
      if (p.startsWith(prefix)) {
        return { entry, subpath: p.slice(prefix.length) };
      }
    }

    return null;
  }

  getAll() {
    return [...this.published];
  }
}

module.exports = { PublicStore };
