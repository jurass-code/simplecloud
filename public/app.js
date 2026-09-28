/* SimpleCloud frontend.
 *
 * Mobile-first: the file list is a touch list, every action is reachable from a
 * bottom sheet, modals are sheets, uploads run in small chunks with real
 * progress so one oversized video can never fail a whole selection of photos.
 *
 * No build step, no dependencies — keep it that way.
 */
(function () {
  "use strict";

  // ======================================================================
  // Icons (inline SVG, currentColor, stroke-only unless .icon--fill)
  // ======================================================================
  var ICONS = {
    folder:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h3.6l1.7 2H19a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
    file:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/></svg>',
    image:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 18l5-5 3.5 3.5L16 13l4 4"/></svg>',
    video:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5l5 2.5-5 2.5z"/></svg>',
    audio:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></svg>',
    play:
      '<svg class="icon icon--fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    kebab:
      '<svg class="icon icon--fill" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
    eye:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    download:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>',
    pencil:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    trash:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l.9 12a2 2 0 002 1.9h5.2a2 2 0 002-1.9l.9-12"/></svg>',
    link:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 13.5a4 4 0 005.7 0l2.6-2.6a4 4 0 10-5.7-5.7l-1 1"/><path d="M13.5 10.5a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 105.7 5.7l1-1"/></svg>',
    select:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5L16 9.5"/></svg>',
    check:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>',
    alert:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
    eyeOff:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 12h.01"/></svg>',
    settings:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 010-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 4.1a2 2 0 014 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11a2 2 0 010 4z"/></svg>',
    logout:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h9"/></svg>',
    user:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg>',
  };

  // Extensions the server can rasterise into a thumbnail (must stay in sync
  // with src/files/thumbnailService.js IMAGE_EXTENSIONS).
  var THUMBNAIL_EXTS = [
    "jpg", "jpeg", "png", "gif", "webp", "avif", "tiff", "tif", "bmp",
  ];
  // Extensions we can preview in-app via /api/files/raw.
  var VIEWER_EXTS = {
    image: THUMBNAIL_EXTS.slice(),
    video: ["mp4", "m4v", "mov", "webm", "ogv"],
    audio: ["mp3", "m4a", "wav", "ogg", "oga", "opus", "aac", "flac"],
    text: ["txt", "log", "md", "csv", "json"],
  };
  var MAX_TEXT_PREVIEW = 262144; // 256 KB is plenty for a glance
  var UPLOAD_CHUNK_SIZE = 4;

  // ======================================================================
  // State
  // ======================================================================
  var state = {
    user: null,
    config: { maxUploadBytes: 100 * 1024 * 1024, maxUploadMb: 100, maxFilesPerUpload: 50 },
    currentPath: "/",
    page: 1,
    pageSize: 50,
    sort: "name",
    direction: "asc",
    listData: null,
    loading: false,
    published: [],
    selected: {},
    viewMode: null,
    listToken: 0,
    overlays: [],
    // history.back() we triggered ourselves (closing an overlay) — the popstate
    // it produces must not be treated as the user navigating.
    expectedPops: 0,
  };

  // ======================================================================
  // Helpers
  // ======================================================================
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function create(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function eh(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function ea(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function extOf(name) {
    var i = String(name).lastIndexOf(".");
    return i < 1 ? "" : String(name).slice(i + 1).toLowerCase();
  }
  function kindOf(name) {
    var ext = extOf(name);
    if (VIEWER_EXTS.image.indexOf(ext) !== -1) return "image";
    if (VIEWER_EXTS.video.indexOf(ext) !== -1) return "video";
    if (VIEWER_EXTS.audio.indexOf(ext) !== -1) return "audio";
    if (VIEWER_EXTS.text.indexOf(ext) !== -1) return "text";
    return "file";
  }
  function isThumbnailable(name) {
    return THUMBNAIL_EXTS.indexOf(extOf(name)) !== -1;
  }
  function isPreviewable(name, type) {
    if (type === "folder") return false;
    return kindOf(name) !== "file";
  }
  function formatSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(1) + " GB";
  }
  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return (
      d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  }
  function isTouchUi() {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 640;
  }

  // ======================================================================
  // Toasts
  // ======================================================================
  var toastsEl = $("#toasts");
  function toast(message, type) {
    if (!message) return;
    var icon =
      type === "error" || type === "warn"
        ? ICONS.alert
        : type === "success"
          ? ICONS.check
          : ICONS.eyeOff;
    var el = create(
      '<div class="toast toast--' + (type || "info") + '">' +
        icon +
        "<span>" + eh(message) + "</span></div>",
    );
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 3) toastsEl.removeChild(toastsEl.firstChild);
    var ms = type === "error" ? 6000 : type === "warn" ? 5000 : 3500;
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }, ms);
  }

  // Keep floating status UI clear of the upload dock / batch bar.
  function positionFloatingUi() {
    var batch = $("#batch-bar");
    var batchVisible = !!batch && !batch.classList.contains("hidden");
    var dock = $("#upload-dock");
    var dockHeight = dock ? dock.offsetHeight : 0;
    document.body.classList.toggle("batch-active", batchVisible);
    document.body.classList.toggle("upload-active", dockHeight > 0);
    document.documentElement.style.setProperty(
      "--dock-space",
      dockHeight ? dockHeight + "px" : "0px",
    );
    var bottom = 16;
    if (batchVisible) bottom = 72;
    if (dockHeight) bottom = Math.max(bottom, dockHeight + 16);
    document.documentElement.style.setProperty("--toast-offset", bottom + "px");
  }

  // ======================================================================
  // Overlays (sheets, modals, viewer): scroll lock + Android back button
  // ======================================================================
  var scrollLockY = 0;
  function lockScroll(lock) {
    if (lock) {
      scrollLockY = window.scrollY || 0;
      document.body.style.top = -scrollLockY + "px";
      document.body.classList.add("has-overlay");
    } else {
      document.body.classList.remove("has-overlay");
      document.body.style.top = "";
      if (scrollLockY) window.scrollTo(0, scrollLockY);
    }
  }

  var BACKGROUND_REGIONS = ["#app-screen", "#admin-screen", "#login-screen"];

  function setBackgroundHidden(hidden) {
    BACKGROUND_REGIONS.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (hidden) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    });
  }

  function focusableIn(root) {
    return $$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root,
    ).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  // Keep Tab inside the open overlay (WCAG 2.4.3 / best practice for dialogs).
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !state.overlays.length) return;
    var top = state.overlays[state.overlays.length - 1].el;
    var items = focusableIn(top);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!top.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  });

  function overlayIndex(el) {
    for (var i = state.overlays.length - 1; i >= 0; i--) {
      if (state.overlays[i].el === el) return i;
    }
    return -1;
  }

  function focusOverlay(el, focusTarget) {
    var target = focusTarget || el.querySelector("input, select, button");
    if (!target || typeof target.focus !== "function") return;
    setTimeout(function () {
      try {
        target.focus({ preventScroll: true });
      } catch (e) {
        target.focus();
      }
    }, 30);
  }

  // Show an overlay. The first overlay in the stack pushes one history entry so
  // the Android/iOS back gesture closes it instead of leaving the app; nested
  // overlays share that entry.
  function pushOverlay(el, onClose, focusTarget) {
    if (overlayIndex(el) >= 0) return;
    var wasEmpty = state.overlays.length === 0;
    state.overlays.push({
      el: el,
      onClose: onClose || null,
      restoreFocus: document.activeElement,
    });
    el.classList.remove("hidden");
    lockScroll(true);
    setBackgroundHidden(true);
    if (wasEmpty) {
      try {
        history.pushState(
          { simplecloudOverlay: true, scPath: state.currentPath },
          "",
          currentQuery(),
        );
      } catch (e) {
        /* history is unavailable in some embedded webviews */
      }
    }
    focusOverlay(el, focusTarget);
  }
  function openOverlay(el, onClose, focusTarget) {
    pushOverlay(el, onClose, focusTarget);
  }

  // Hand the overlay slot from one element to another in the same tick. Going
  // through closeOverlay()+openOverlay() would call history.back() and then
  // pushState() in the same task, and the pending popstate would close the new
  // overlay immediately — so the history entry is simply carried over.
  function swapOverlay(fromEl, toEl, onClose, focusTarget) {
    var idx = overlayIndex(fromEl);
    var keepEntry = false;
    if (idx >= 0) {
      keepEntry = idx === 0 && state.overlays.length === 1;
      hideOverlay(state.overlays.splice(idx, 1)[0]);
    }
    if (keepEntry) {
      state.overlays.push({
        el: toEl,
        onClose: onClose || null,
        restoreFocus: document.activeElement,
      });
      toEl.classList.remove("hidden");
      lockScroll(true);
      setBackgroundHidden(true);
      focusOverlay(toEl, focusTarget);
    } else {
      pushOverlay(toEl, onClose, focusTarget);
    }
  }

  function hideOverlay(entry) {
    entry.el.classList.add("hidden");
    if (entry.onClose) entry.onClose();
    if (entry.restoreFocus && document.contains(entry.restoreFocus)) {
      try {
        entry.restoreFocus.focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    }
  }

  // Drop the history entry an overlay pushed (so the back gesture keeps
  // working) while marking the resulting popstate as ours.
  function popHistoryEntry() {
    try {
      state.expectedPops++;
      history.back();
    } catch (e) {
      state.expectedPops = Math.max(0, state.expectedPops - 1);
    }
  }

  function closeOverlay(el) {
    var idx = overlayIndex(el);
    if (idx < 0) return false;
    hideOverlay(state.overlays.splice(idx, 1)[0]);
    if (!state.overlays.length) {
      lockScroll(false);
      setBackgroundHidden(false);
      popHistoryEntry();
    }
    return true;
  }

  function closeTopOverlay() {
    if (!state.overlays.length) return false;
    closeOverlay(state.overlays[state.overlays.length - 1].el);
    return true;
  }

  window.addEventListener("popstate", function (e) {
    var internal = state.expectedPops > 0;
    if (internal) state.expectedPops--;

    if (state.overlays.length) {
      var entry = state.overlays.pop();
      hideOverlay(entry);
      if (!state.overlays.length) {
        lockScroll(false);
        setBackgroundHidden(false);
      }
      return;
    }

    if (internal) {
      // Closing an overlay drops its entry. If the entry we land on is not a
      // folder entry (it is the overlay's own entry, or an unknown one), adopt
      // it for the folder on screen so the address bar never lies. A real
      // folder entry is left untouched — Back must still reach it.
      var landed = e.state || {};
      if (!landed.scFolder) syncUrl();
      return;
    }

    // Back from the admin panel means "back to my files".
    if (!$("#admin-screen").classList.contains("hidden")) {
      showApp({ resetPath: false });
      return;
    }

    // The user pressed Back/Forward: follow the folder recorded in the entry.
    var target = e.state && e.state.scPath;
    if (!target) {
      var params = new URLSearchParams(location.search);
      target = params.get("path");
    }
    if (target && target !== state.currentPath) {
      applyHistoryPath(target);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (closeTopOverlay()) e.preventDefault();
      return;
    }
    var viewerOpen = !$("#viewer").classList.contains("hidden");
    if (viewerOpen && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      stepViewer(e.key === "ArrowRight" ? 1 : -1);
    }
  });

  // Backdrop / [data-modal-close] / [data-sheet-close]
  document.addEventListener("click", function (e) {
    var closer = e.target.closest("[data-modal-close], [data-sheet-close]");
    if (closer) {
      var overlay = closer.closest(".modal, .sheet");
      if (overlay) closeOverlay(overlay);
    }
  });

  // ======================================================================
  // API
  // ======================================================================
  function ApiError(message, status, code) {
    this.name = "ApiError";
    this.message = message || "Request failed";
    this.status = status;
    this.code = code;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body instanceof FormData) {
      opts.body = body;
    } else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw new ApiError("Network error — check your connection", 0);
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
    }
    if (res.status === 401) {
      handleSessionExpired();
      throw new ApiError("Session expired", 401, "UNAUTHORIZED");
    }
    if (!res.ok) {
      var msg = (data && data.error && data.error.message) || "Request failed (" + res.status + ")";
      throw new ApiError(msg, res.status, data && data.error && data.error.code);
    }
    return data;
  }

  function handleSessionExpired() {
    if (!state.user) return;
    state.user = null;
    showLogin();
    toast("Your session expired. Please sign in again.", "error");
  }

  // ======================================================================
  // Dialogs (replacing window.confirm / prompt — they are unusable on mobile)
  // ======================================================================
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var modal = $("#confirm-modal");
      var ok = $("#confirm-modal-ok");
      $("#confirm-modal-title").textContent = opts.title || "Are you sure?";
      $("#confirm-modal-message").textContent = opts.message || "";
      ok.textContent = opts.okLabel || "Confirm";
      ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var cancelBtn = modal.querySelector(".modal-actions .btn");
      var focusTarget = opts.danger ? cancelBtn : ok;
      var onClose = function () { finish(false); };
      if (opts.from) swapOverlay(opts.from, modal, onClose, focusTarget);
      else openOverlay(modal, onClose, focusTarget);
      ok.onclick = function () {
        finish(true);
        closeOverlay(modal);
      };
    });
  }

  function promptDialog(opts) {
    return new Promise(function (resolve) {
      var modal = $("#prompt-modal");
      var input = $("#prompt-modal-input");
      $("#prompt-modal-title").textContent = opts.title || "Enter a value";
      $("#prompt-modal-message").textContent = opts.message || "";
      $("#prompt-modal-label").textContent = opts.label || "Value";
      input.type = opts.type || "password";
      input.value = opts.value || "";
      input.placeholder = opts.placeholder || "";
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var onClose = function () { finish(null); };
      if (opts.from) swapOverlay(opts.from, modal, onClose, input);
      else openOverlay(modal, onClose, input);
      $("#prompt-form").onsubmit = function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) return;
        finish(v);
        closeOverlay(modal);
      };
    });
  }

  // ======================================================================
  // Auth
  // ======================================================================
  var loginScreen = $("#login-screen");
  var appScreen = $("#app-screen");
  var adminScreen = $("#admin-screen");

  $("#login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var banner = $("#login-error");
    var btn = $("#login-btn");
    banner.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      var data = await api("POST", "/api/auth/login", {
        username: fd.get("username"),
        password: fd.get("password"),
      });
      state.user = data.user;
      readUrlState();
      showApp({ resetPath: false });
      updateSortIndicators();
    } catch (err) {
      banner.textContent = err.message;
      banner.classList.remove("hidden");
      $("#login-password").focus();
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });

  $("#logout-btn").addEventListener("click", async function () {
    try {
      await api("POST", "/api/auth/logout");
    } catch (e) {
      /* signing out locally is enough */
    }
    state.user = null;
    showLogin();
  });

  // ======================================================================
  // Navigation
  // ======================================================================
  function goToPath(path, opts) {
    if (path === state.currentPath) return;
    state.currentPath = path;
    state.page = 1;
    clearSelection();
    buildBreadcrumbs();
    loadFiles();
    window.scrollTo({ top: 0, behavior: "auto" });
    if (!opts || opts.push !== false) pushFolderEntry();
  }

  function nav(path) {
    goToPath(path, { push: true });
  }

  // Coming back through history: the entry already exists, only re-render.
  function applyHistoryPath(path) {
    goToPath(path, { push: false });
  }

  function parentPath(p) {
    if (!p || p === "/") return "/";
    var parts = p.split("/").filter(Boolean);
    parts.pop();
    return "/" + parts.join("/");
  }

  function buildBreadcrumbs() {
    var parts = state.currentPath.split("/").filter(Boolean);
    var crumbs = [{ label: "Home", path: "/" }];
    var acc = "";
    parts.forEach(function (part) {
      acc += "/" + part;
      crumbs.push({ label: part, path: acc });
    });

    var html = crumbs
      .map(function (c, i) {
        var last = i === crumbs.length - 1;
        return (
          (i ? '<span class="sep" aria-hidden="true">/</span>' : "") +
          '<a href="?path=' + encodeURIComponent(c.path) + '" data-path="' + ea(c.path) + '"' +
          (last ? ' aria-current="page"' : "") + ">" + eh(c.label) + "</a>"
        );
      })
      .join("");
    var container = $("#breadcrumbs");
    container.innerHTML = html;
    $$("a", container).forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        nav(a.dataset.path);
      });
    });
    var up = $("#up-btn");
    up.disabled = state.currentPath === "/";
    $("#empty-hint").textContent = isTouchUi()
      ? "Tap Upload to add photos, videos or files."
      : "Drag & drop files here, or use Upload.";
  }

  $("#up-btn").addEventListener("click", function () {
    nav(parentPath(state.currentPath));
  });

  // ======================================================================
  // Selection
  // ======================================================================
  var selectAll = $("#select-all");
  var batchBar = $("#batch-bar");

  function clearSelection() {
    state.selected = {};
    selectAll.checked = false;
    updateBatchBar();
  }

  function toggleSelected(path) {
    if (state.selected[path]) delete state.selected[path];
    else state.selected[path] = true;
    updateBatchBar();
    updateSelectAllState();
    refreshSelectionClasses();
  }

  function updateSelectAllState() {
    if (!state.listData || !state.listData.items.length) {
      selectAll.checked = false;
      return;
    }
    selectAll.checked = state.listData.items.every(function (i) {
      return state.selected[i.path];
    });
  }

  function updateBatchBar() {
    var count = Object.keys(state.selected).length;
    if (count) {
      batchBar.classList.remove("hidden");
      $("#batch-count").textContent =
        count + (count === 1 ? " item selected" : " items selected");
    } else {
      batchBar.classList.add("hidden");
    }
    positionFloatingUi();
  }

  function refreshSelectionClasses() {
    $$("#file-list tr, #file-grid .grid-item").forEach(function (row) {
      var path = row.dataset.path;
      if (path && state.selected[path]) row.classList.add("selected");
      else row.classList.remove("selected");
    });
  }

  selectAll.addEventListener("change", function () {
    if (!state.listData) return;
    if (selectAll.checked) {
      state.listData.items.forEach(function (i) {
        state.selected[i.path] = true;
      });
    } else {
      state.selected = {};
    }
    $$("#file-list .row-checkbox, #file-grid .row-checkbox").forEach(function (cb) {
      cb.checked = selectAll.checked;
    });
    updateBatchBar();
    refreshSelectionClasses();
  });

  $("#batch-select-all-btn").addEventListener("click", function () {
    if (!state.listData) return;
    state.listData.items.forEach(function (i) {
      state.selected[i.path] = true;
    });
    selectAll.checked = true;
    $$("#file-list .row-checkbox, #file-grid .row-checkbox").forEach(function (cb) {
      cb.checked = true;
    });
    updateBatchBar();
    refreshSelectionClasses();
  });

  $("#batch-clear-btn").addEventListener("click", function () {
    clearSelection();
    $$("#file-list .row-checkbox, #file-grid .row-checkbox").forEach(function (cb) {
      cb.checked = false;
    });
    refreshSelectionClasses();
  });

  $("#batch-delete-btn").addEventListener("click", async function () {
    var paths = Object.keys(state.selected);
    if (!paths.length) return;
    var ok = await confirmDialog({
      title: "Delete " + paths.length + (paths.length === 1 ? " item?" : " items?"),
      message: "This permanently removes the selection from storage.",
      okLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      var result = await api("POST", "/api/files/delete-batch", { paths: paths });
      var failed = (result.deleted || []).filter(function (r) {
        return r.status !== "ok";
      });
      clearSelection();
      hideError();
      if (failed.length) toast(failed.length + " item(s) could not be deleted", "error");
      else toast(paths.length + " item(s) deleted", "success");
      if (state.listData && state.listData.items.length === paths.length && state.page > 1) {
        state.page--;
      }
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });

  // ======================================================================
  // Listing
  // ======================================================================
  // Keep the address bar in sync with path/page/sort/view. Folder changes push
  // an entry (pushFolderEntry) so the Back button walks the tree; everything
  // else rewrites the current entry. Makes any view deep-linkable and keeps the
  // location across a refresh on mobile.
  function currentQuery() {
    var params = new URLSearchParams();
    if (state.currentPath && state.currentPath !== "/") params.set("path", state.currentPath);
    if (state.page > 1) params.set("page", String(state.page));
    if (state.sort !== "name") params.set("sort", state.sort);
    if (state.direction !== "asc") params.set("direction", state.direction);
    if (state.viewMode) params.set("view", state.viewMode);
    var qs = params.toString();
    return qs ? "?" + qs : location.pathname;
  }

  function folderState() {
    return { scPath: state.currentPath, scFolder: true };
  }

  function syncUrl() {
    if (!state.user) return;
    try {
      history.replaceState(folderState(), "", currentQuery());
    } catch (e) {
      /* ignore */
    }
  }

  // Push one entry per folder so the browser Back button (the reflex on
  // desktop) walks the folder tree instead of leaving the app. An entry is
  // tagged as a folder entry; overlay entries are tagged separately so a pop
  // can tell which one it landed on.
  function pushFolderEntry() {
    if (!state.user) return;
    try {
      history.pushState(folderState(), "", currentQuery());
    } catch (e) {
      /* ignore */
    }
  }

  function readUrlState() {
    var params = new URLSearchParams(location.search);
    var path = params.get("path");
    var page = parseInt(params.get("page"), 10);
    var sort = params.get("sort");
    var direction = params.get("direction");
    var view = params.get("view");
    if (path && path.charAt(0) === "/") state.currentPath = path;
    if (page > 0) state.page = page;
    if (["name", "size", "modifiedAt", "type"].indexOf(sort) !== -1) state.sort = sort;
    if (direction === "asc" || direction === "desc") state.direction = direction;
    if (view === "grid" || view === "table") state.viewMode = view;
  }

  async function loadFiles() {
    var token = ++state.listToken;
    state.loading = true;
    showLoading();
    hideError();
    try {
      var params = new URLSearchParams({
        path: state.currentPath,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort,
        direction: state.direction,
      });
      var data = await api("GET", "/api/files?" + params.toString());
      if (token !== state.listToken) return; // a newer navigation won
      state.listData = data;
      state.loading = false;
      await loadPublished();
      if (token !== state.listToken) return;
      renderList();
      syncUrl();
    } catch (err) {
      if (token !== state.listToken) return;
      state.loading = false;
      state.listData = null;
      showError(err.message);
      renderList();
      // A shared link with a stale path (or a foreign one for this user) should
      // not strand the user: drop back to the root folder and say so.
      var pathGone = err.code === "FILE_NOT_FOUND" || err.code === "FORBIDDEN_PATH" ||
        err.code === "INVALID_REQUEST" || err.status === 404 || err.status === 403;
      if (state.currentPath !== "/" && pathGone) {
        toast("That folder is not available — showing your files", "warn");
        state.currentPath = "/";
        state.page = 1;
        buildBreadcrumbs();
        loadFiles();
      } else {
        syncUrl();
      }
    }
  }

  function showLoading() {
    $("#file-list").innerHTML = "";
    $("#file-grid").innerHTML = "";
    $("#loading-state").classList.remove("hidden");
    $("#empty-state").classList.add("hidden");
    $("#drop-zone").setAttribute("aria-busy", "true");
  }

  async function loadPublished() {
    try {
      state.published = await api("GET", "/api/files/published");
    } catch (e) {
      state.published = [];
    }
  }
  function isPublished(path) {
    return state.published.find(function (p) {
      return p.path === path;
    });
  }

  function iconFor(item) {
    if (item.type === "folder") {
      return '<span class="file-icon file-icon--folder">' + ICONS.folder + "</span>";
    }
    if (isThumbnailable(item.name)) {
      return (
        '<img class="thumbnail" src="/api/files/thumbnail?path=' +
        encodeURIComponent(item.path) +
        '" alt="" loading="lazy" decoding="async" data-fallback="' +
        kindOf(item.name) +
        '">'
      );
    }
    var kind = kindOf(item.name);
    var glyph = ICONS[kind === "image" ? "image" : kind === "video" ? "video" : kind === "audio" ? "audio" : "file"];
    return '<span class="file-icon file-icon--' + kind + '">' + glyph + "</span>";
  }

  function kebabButton(item, extraClass) {
    return (
      '<button type="button" class="icon-btn kebab ' + (extraClass || "") + '"' +
      ' data-action="menu" data-path="' + ea(item.path) + '"' +
      ' aria-label="Actions for ' + ea(item.name) + '" aria-haspopup="dialog">' +
      ICONS.kebab +
      "</button>"
    );
  }

  function itemLink(item, withIcon) {
    // Every item keeps a real href: keyboard focus, Cmd/Ctrl+click, middle-click
    // and the browser status bar all keep working. Plain clicks are intercepted
    // below (SPA navigation / in-app viewer).
    var href;
    if (item.type === "folder") {
      href = "?path=" + encodeURIComponent(item.path);
    } else if (isPreviewable(item.name, item.type)) {
      href = "/api/files/raw?path=" + encodeURIComponent(item.path);
    } else {
      href = "/api/files/download?path=" + encodeURIComponent(item.path);
    }
    var attrs =
      'href="' + eh(href) + '" data-path="' + ea(item.path) + '"' +
      (item.type === "folder" || isPreviewable(item.name, item.type)
        ? ""
        : ' download');
    return (
      '<a class="file-link" ' + attrs + '>' +
      (withIcon ? iconFor(item) : "") +
      '<span class="file-name">' + eh(item.name) + "</span></a>"
    );
  }

  function publishedBadge(path) {
    return isPublished(path)
      ? '<span class="badge-published">' + ICONS.link + "Public</span>"
      : "";
  }

  function renderList() {
    $("#loading-state").classList.add("hidden");
    $("#drop-zone").setAttribute("aria-busy", "false");
    var data = state.listData;
    var isGrid = state.viewMode === "grid";
    $("#file-table-head").classList.toggle("hidden", isGrid);
    $("#file-grid").classList.toggle("hidden", !isGrid);

    if (!data || !data.items.length) {
      $("#file-list").innerHTML = "";
      $("#file-grid").innerHTML = "";
      // A null listing means the request failed — the error banner is the
      // message, "this folder is empty" would be a lie.
      $("#empty-state").classList.toggle("hidden", state.loading || !data);
    } else {
      $("#empty-state").classList.add("hidden");
    }
    if (!data) {
      renderPagination();
      return;
    }
    if (isGrid) {
      $("#file-list").innerHTML = "";
      renderGrid(data);
    } else {
      $("#file-grid").innerHTML = "";
      renderTable(data);
    }
    updateSelectAllState();
    updateSortIndicators();
    renderPagination();
    positionFloatingUi();
  }

  function renderTable(data) {
    $("#file-list").innerHTML = data.items
      .map(function (item) {
        var selected = state.selected[item.path];
        var meta =
          item.type === "folder"
            ? ""
            : '<span class="file-size">' + formatSize(item.size) + '</span><span class="dot"></span>';
        return (
          '<tr class="' + (selected ? "selected" : "") + '" data-path="' + ea(item.path) + '" data-type="' + item.type + '">' +
          '<td class="cell-check col-check"><label class="check-hit"><input type="checkbox" class="row-checkbox" data-path="' +
          ea(item.path) + '" aria-label="Select ' + ea(item.name) + '"' + (selected ? " checked" : "") + "></label></td>" +
          '<td class="cell-name" data-label="Name">' + itemLink(item, true) +
          '<span class="file-sub">' + meta + '<span class="file-date">' + formatDate(item.modifiedAt) + "</span>" +
          publishedBadge(item.path) + "</span></td>" +
          '<td data-label="Type">' + item.type + "</td>" +
          '<td class="file-size" data-label="Size">' + (item.type === "folder" ? "—" : formatSize(item.size)) + "</td>" +
          '<td class="file-date" data-label="Modified">' + formatDate(item.modifiedAt) + "</td>" +
          '<td class="cell-actions" data-label="Actions">' + kebabButton(item) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderGrid(data) {
    $("#file-grid").innerHTML = data.items
      .map(function (item) {
        var selected = state.selected[item.path];
        var kind = item.type === "folder" ? "folder" : kindOf(item.name);
        var preview;
        if (kind === "image" && isThumbnailable(item.name)) {
          preview =
            '<img class="grid-thumb" src="/api/files/thumbnail?path=' +
            encodeURIComponent(item.path) +
            '" alt="" width="200" height="200" loading="lazy" decoding="async" data-fallback="image">';
        } else {
          preview = '<span class="file-icon file-icon--' + kind + '">' +
            (kind === "image" ? ICONS.image : kind === "video" ? ICONS.video : kind === "audio" ? ICONS.audio : kind === "folder" ? ICONS.folder : ICONS.file) +
            "</span>";
        }
        return (
          '<div class="grid-item' + (selected ? " selected" : "") + '" data-path="' + ea(item.path) + '" data-type="' + item.type + '">' +
          '<label class="grid-check"><input type="checkbox" class="row-checkbox" data-path="' + ea(item.path) +
          '" aria-label="Select ' + ea(item.name) + '"' + (selected ? " checked" : "") + "></label>" +
          kebabButton(item, "grid-kebab") +
          '<div class="grid-preview">' + preview +
          (kind === "video" ? '<span class="grid-play">' + ICONS.play + "</span>" : "") +
          "</div>" +
          '<div class="grid-name">' + itemLink(item, false) + "</div>" +
          '<div class="grid-meta">' +
          (item.type === "folder" ? "" : formatSize(item.size)) +
          publishedBadge(item.path) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // Broken/unavailable thumbnails fall back to the type glyph instead of the
  // browser's broken-image icon (error events do not bubble — capture them).
  ["#file-list", "#file-grid"].forEach(function (sel) {
    $(sel).addEventListener(
      "error",
      function (e) {
        var img = e.target;
        if (!img || img.tagName !== "IMG") return;
        var kind = img.dataset.fallback || "file";
        var glyph = ICONS[kind === "image" ? "image" : kind === "video" ? "video" : kind === "audio" ? "audio" : "file"];
        var span = create('<span class="file-icon file-icon--' + kind + '">' + glyph + "</span>");
        if (img.parentNode) img.parentNode.replaceChild(span, img);
      },
      true,
    );
  });

  function renderPagination() {
    var data = state.listData;
    var prev = $("#prev-page");
    var next = $("#next-page");
    var info = $("#page-info");
    var wrapper = $("#pagination");
    if (!data || !data.total) {
      prev.disabled = true;
      next.disabled = true;
      info.textContent = "";
      if (wrapper) wrapper.classList.add("hidden");
      return;
    }
    if (wrapper) wrapper.classList.remove("hidden");
    var pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    // A single page needs no dead Previous/Next controls — just the count.
    var single = pages <= 1;
    prev.classList.toggle("hidden", single);
    next.classList.toggle("hidden", single);
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= pages;
    info.textContent = single
      ? data.total + (data.total === 1 ? " item" : " items")
      : "Page " + state.page + " of " + pages + " · " + data.total + " items";
  }

  // ======================================================================
  // Sorting / view mode
  // ======================================================================
  function applySort(sort, direction) {
    state.sort = sort;
    state.direction = direction === "desc" ? "desc" : "asc";
    state.page = 1;
    clearSelection();
    updateSortIndicators();
    loadFiles();
  }

  $$(".sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var field = th.dataset.sort;
      if (state.sort === field) {
        applySort(field, state.direction === "asc" ? "desc" : "asc");
      } else {
        applySort(field, field === "size" || field === "modifiedAt" ? "desc" : "asc");
      }
    });
  });

  var mobileSort = $("#mobile-sort");
  mobileSort.addEventListener("change", function () {
    var parts = mobileSort.value.split("-");
    applySort(parts[0], parts[1]);
  });

  function updateSortIndicators() {
    $$(".sort-arrow").forEach(function (el) {
      el.classList.remove("asc", "desc");
    });
    $$(".file-table th.sortable").forEach(function (th) {
      th.setAttribute("aria-sort", "none");
    });
    var arrow = $('th[data-sort="' + state.sort + '"] .sort-arrow');
    var th = $('th[data-sort="' + state.sort + '"]');
    if (arrow) arrow.classList.add(state.direction);
    if (th) {
      th.setAttribute("aria-sort", state.direction === "asc" ? "ascending" : "descending");
    }
    var value = state.sort + "-" + state.direction;
    if ($$("#mobile-sort option").some(function (o) { return o.value === value; })) {
      mobileSort.value = value;
    } else {
      mobileSort.value = state.sort + (state.direction === "asc" ? "-asc" : "-desc");
    }
  }

  function syncViewToggle() {
    var isGrid = state.viewMode === "grid";
    $(".view-icon-grid").classList.toggle("hidden", isGrid);
    $(".view-icon-table").classList.toggle("hidden", !isGrid);
    $("#view-toggle-btn").setAttribute(
      "aria-label",
      isGrid ? "Switch to list view" : "Switch to grid view",
    );
  }

  $("#view-toggle-btn").addEventListener("click", function () {
    state.viewMode = state.viewMode === "grid" ? "table" : "grid";
    try {
      localStorage.setItem("simplecloud_view", state.viewMode);
    } catch (e) {
      /* private mode */
    }
    syncViewToggle();
    renderList();
    syncUrl();
  });

  $("#refresh-btn").addEventListener("click", function () {
    loadFiles();
    toast("Refreshed");
  });

  $("#prev-page").addEventListener("click", function () {
    if (state.page > 1) {
      state.page--;
      clearSelection();
      loadFiles();
    }
  });
  $("#next-page").addEventListener("click", function () {
    var pages = Math.ceil(((state.listData && state.listData.total) || 0) / state.pageSize);
    if (state.page < pages) {
      state.page++;
      clearSelection();
      loadFiles();
    }
  });

  // ======================================================================
  // Item interaction (list rows, grid tiles, links, checkboxes, kebab)
  // ======================================================================
  function findItem(path) {
    if (!state.listData) return null;
    return state.listData.items.find(function (i) {
      return i.path === path;
    }) || null;
  }

  function downloadItem(path) {
    var a = document.createElement("a");
    a.href = "/api/files/download?path=" + encodeURIComponent(path);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openItem(path) {
    var item = findItem(path);
    if (!item) return;
    if (item.type === "folder") nav(path);
    else if (isPreviewable(item.name, item.type)) openViewer(path);
    else downloadItem(path);
  }

  function bindListDelegation(container) {
    container.addEventListener("change", function (e) {
      var cb = e.target.closest(".row-checkbox");
      if (cb) toggleSelected(cb.dataset.path);
    });
    container.addEventListener("click", function (e) {
      // Let the browser handle new-tab/new-window intent.
      var modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      var menuBtn = e.target.closest('[data-action="menu"]');
      if (menuBtn) {
        e.preventDefault();
        openActionSheet(menuBtn.dataset.path);
        return;
      }
      var link = e.target.closest("a[data-path]");
      if (link) {
        if (modified) return;
        e.preventDefault();
        openItem(link.dataset.path);
        return;
      }
      if (e.target.closest("a[href], label, input, button")) return;
      if (modified) return;
      var host = e.target.closest("[data-path]");
      if (host) openItem(host.dataset.path);
    });
  }
  bindListDelegation($("#file-list"));
  bindListDelegation($("#file-grid"));

  // ======================================================================
  // Action sheet — the single action surface on every screen size
  // ======================================================================
  var actionSheet = $("#action-sheet");

  function sheetItemHtml(action) {
    return (
      '<button type="button" class="sheet-item' + (action.danger ? " sheet-item--danger" : "") + '"' +
      (action.disabled ? " disabled" : "") + ">" +
      (action.icon || "") +
      '<span class="sheet-item-text"><strong>' + eh(action.label) + "</strong>" +
      (action.hint ? "<small>" + eh(action.hint) + "</small>" : "") +
      "</span></button>"
    );
  }

  function openActionSheet(path) {
    var item = findItem(path);
    if (!item) return;
    var isFolder = item.type === "folder";
    var previewable = isPreviewable(item.name, item.type);
    var published = !!isPublished(path);
    var selected = !!state.selected[path];

    var actions = [];
    if (isFolder) {
      actions.push({ label: "Open folder", icon: ICONS.folder, run: function () { nav(path); } });
    } else if (previewable) {
      actions.push({ label: "Preview", icon: ICONS.eye, run: function (from) { openViewer(path, from); } });
    }
    if (!isFolder) {
      actions.push({ label: "Download", icon: ICONS.download, run: function () { downloadItem(path); } });
    }
    actions.push({
      label: "Rename",
      icon: ICONS.pencil,
      run: function (from) { openRenameModal(path, item.name, from); },
    });
    if (published) {
      actions.push({
        label: "Copy public link",
        icon: ICONS.link,
        hint: "Already published",
        run: function (from) { openPublishModal(path, from); },
      });
    } else {
      actions.push({
        label: "Publish",
        icon: ICONS.link,
        hint: "Create a public link",
        run: function (from) { publishItem(path, from); },
      });
    }
    actions.push({
      label: selected ? "Deselect" : "Select",
      icon: ICONS.select,
      run: function () { toggleSelected(path); },
    });
    actions.push({
      label: "Delete",
      icon: ICONS.trash,
      danger: true,
      run: function (from) { confirmDeleteItem(path, item.name, from); },
    });

    $("#action-sheet-title").textContent = item.name;
    $("#action-sheet-sub").textContent =
      (isFolder ? "Folder" : formatSize(item.size) + " · " + formatDate(item.modifiedAt)) +
      (published ? " · public link active" : "");
    var list = $("#action-sheet-actions");
    list.innerHTML = actions.map(sheetItemHtml).join("");
    $$("button", list).forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        var action = actions[i];
        runSheetAction(actionSheet, action);
      });
    });
    openOverlay(actionSheet, null, $$("button", list)[0]);
  }

  // Run a sheet action. The action receives the sheet element so anything that
  // opens another overlay can swap it in; otherwise the sheet closes itself.
  function runSheetAction(sheetEl, action) {
    try {
      action.run(sheetEl);
    } catch (err) {
      showError(err.message);
    }
    setTimeout(function () {
      if (overlayIndex(sheetEl) >= 0) closeOverlay(sheetEl);
    }, 0);
  }

  // ======================================================================
  // Rename / delete / folder creation
  // ======================================================================
  var renameModal = $("#rename-modal");
  var renameInput = $("#rename-input");
  var renameTarget = "";

  function openRenameModal(path, name, fromEl) {
    renameTarget = path;
    renameInput.value = name;
    if (fromEl) swapOverlay(fromEl, renameModal, null, renameInput);
    else pushOverlay(renameModal, null, renameInput);
    setTimeout(function () {
      renameInput.select();
    }, 60);
  }

  $("#rename-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = renameInput.value.trim();
    if (!name) return;
    try {
      await api("PATCH", "/api/files/rename", { path: renameTarget, newName: name });
      closeOverlay(renameModal);
      hideError();
      toast("Renamed to " + name, "success");
      loadFiles();
    } catch (err) {
      closeOverlay(renameModal);
      showError(err.message);
    }
  });

  async function confirmDeleteItem(path, name, fromEl) {
    var ok = await confirmDialog({
      title: "Delete?",
      message: '"' + name + '" will be permanently deleted.',
      okLabel: "Delete",
      danger: true,
      from: fromEl,
    });
    if (!ok) return;
    try {
      await api("DELETE", "/api/files?path=" + encodeURIComponent(path));
      hideError();
      toast("Deleted " + name, "success");
      if (state.listData && state.listData.items.length === 1 && state.page > 1) state.page--;
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  }

  var folderModal = $("#folder-modal");
  var folderInput = $("#folder-name-input");

  $("#create-folder-btn").addEventListener("click", function () {
    folderInput.value = "";
    openOverlay(folderModal, null, folderInput);
  });

  $("#folder-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = folderInput.value.trim();
    if (!name) return;
    try {
      await api("POST", "/api/files/folder", { path: state.currentPath, name: name });
      closeOverlay(folderModal);
      hideError();
      toast("Folder created", "success");
      loadFiles();
    } catch (err) {
      closeOverlay(folderModal);
      showError(err.message);
    }
  });

  // ======================================================================
  // Publishing
  // ======================================================================
  var publishModal = $("#publish-modal");
  var publishInput = $("#publish-url-input");
  var publishTarget = "";

  async function publishItem(path, fromEl) {
    try {
      await api("POST", "/api/files/publish", { path: path });
      await loadPublished();
      renderList();
      openPublishModal(path, fromEl);
    } catch (err) {
      showError(err.message);
    }
  }

  function openPublishModal(path, fromEl) {
    publishTarget = path;
    $("#publish-path").textContent = path;
    var pub = isPublished(path);
    if (pub) {
      publishInput.value = location.origin + "/pub" + path;
      $("#publish-revoke-btn").classList.remove("hidden");
    } else {
      publishInput.value = "(not published)";
      $("#publish-revoke-btn").classList.add("hidden");
    }
    if (fromEl) swapOverlay(fromEl, publishModal, null, $("#publish-copy-btn"));
    else pushOverlay(publishModal, null, $("#publish-copy-btn"));
  }

  $("#publish-revoke-btn").addEventListener("click", async function () {
    try {
      await api("DELETE", "/api/files/publish", { path: publishTarget });
      closeOverlay(publishModal);
      await loadPublished();
      renderList();
      toast("Public link revoked", "success");
    } catch (err) {
      closeOverlay(publishModal);
      showError(err.message);
    }
  });

  $("#publish-copy-btn").addEventListener("click", async function () {
    var btn = $("#publish-copy-btn");
    var value = publishInput.value;
    var copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (e) {
        copied = false;
      }
    }
    if (!copied) {
      publishInput.select();
      publishInput.setSelectionRange(0, value.length);
      try {
        copied = document.execCommand("copy");
      } catch (e) {
        copied = false;
      }
    }
    btn.textContent = copied ? "Copied!" : "Select and copy";
    setTimeout(function () {
      btn.textContent = "Copy";
    }, 1600);
  });

  // ======================================================================
  // Preview viewer
  // ======================================================================
  var viewer = $("#viewer");
  var viewerStage = $("#viewer-stage");
  var viewerItems = [];
  var viewerIndex = 0;

  function viewerCandidates() {
    if (!state.listData) return [];
    return state.listData.items.filter(function (i) {
      return isPreviewable(i.name, i.type);
    });
  }

  function openViewer(path, fromEl) {
    viewerItems = viewerCandidates();
    viewerIndex = viewerItems.findIndex(function (i) {
      return i.path === path;
    });
    if (viewerIndex < 0) {
      downloadItem(path);
      return;
    }
    renderViewer();
    if (fromEl) swapOverlay(fromEl, viewer, destroyViewer, $("#viewer-close"));
    else pushOverlay(viewer, destroyViewer, $("#viewer-close"));
  }

  function destroyViewer() {
    viewerStage.innerHTML = "";
  }

  function renderViewer() {
    var item = viewerItems[viewerIndex];
    if (!item) return;
    var kind = kindOf(item.name);
    var url = "/api/files/raw?path=" + encodeURIComponent(item.path);
    $("#viewer-title").textContent = item.name;
    $("#viewer-meta").textContent =
      viewerIndex + 1 + " / " + viewerItems.length + " · " + formatSize(item.size);
    $("#viewer-prev").disabled = viewerIndex <= 0;
    $("#viewer-next").disabled = viewerIndex >= viewerItems.length - 1;
    viewerStage.innerHTML = "";
    viewerStage.scrollTop = 0;

    if (kind === "image") {
      var img = document.createElement("img");
      img.src = url;
      img.alt = item.name;
      img.decoding = "async";
      img.addEventListener("error", function () {
        showViewerFallback(item, "Preview is not supported by this browser.");
      });
      viewerStage.appendChild(img);
    } else if (kind === "video") {
      var video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.preload = "metadata";
      video.addEventListener("error", function () {
        showViewerFallback(item, "This video format cannot be played here.");
      });
      viewerStage.appendChild(video);
    } else if (kind === "audio") {
      var audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      viewerStage.appendChild(audio);
    } else if (kind === "text") {
      loadTextViewer(item, url);
    }
  }

  function showViewerFallback(item, message) {
    viewerStage.innerHTML = "";
    var box = create(
      '<div class="viewer-fallback"><p>' + eh(message) + "</p></div>",
    );
    var btn = create('<button type="button" class="btn btn-primary">Download</button>');
    btn.addEventListener("click", function () {
      downloadItem(item.path);
    });
    box.appendChild(btn);
    viewerStage.appendChild(box);
  }

  async function loadTextViewer(item, url) {
    var pre = create('<pre class="viewer-text"></pre>');
    viewerStage.appendChild(pre);
    pre.textContent = "Loading…";
    try {
      var res = await fetch(url, {
        headers: { Range: "bytes=0-" + (MAX_TEXT_PREVIEW - 1) },
      });
      if (!res.ok) throw new Error("Could not load file");
      var text = await res.text();
      var range = res.headers.get("content-range") || "";
      var total = parseInt((range.split("/")[1] || "0"), 10);
      pre.textContent = text;
      if (total > MAX_TEXT_PREVIEW) {
        viewerStage.appendChild(
          create('<p class="viewer-note">Showing the first 256 KB of ' + formatSize(total) + ".</p>"),
        );
      }
    } catch (e) {
      pre.textContent = "Could not load this file.";
    }
  }

  function stepViewer(delta) {
    var next = viewerIndex + delta;
    if (next < 0 || next >= viewerItems.length) return;
    viewerIndex = next;
    renderViewer();
  }

  $("#viewer-close").addEventListener("click", function () {
    closeOverlay(viewer);
  });
  $("#viewer-prev").addEventListener("click", function () {
    stepViewer(-1);
  });
  $("#viewer-next").addEventListener("click", function () {
    stepViewer(1);
  });
  $("#viewer-download").addEventListener("click", function () {
    var item = viewerItems[viewerIndex];
    if (item) downloadItem(item.path);
  });
  $("#viewer").addEventListener("click", function (e) {
    if (e.target === viewer || e.target === viewerStage) closeOverlay(viewer);
  });

  // Swipe between previewable items (images/videos) on touch screens.
  var swipeStart = null;
  viewerStage.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1) return;
      swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  viewerStage.addEventListener(
    "touchend",
    function (e) {
      if (!swipeStart) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - swipeStart.x;
      var dy = t.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        stepViewer(dx < 0 ? 1 : -1);
      }
    },
    { passive: true },
  );

  // ======================================================================
  // Upload: chunked, resumable-per-file, real progress
  // ======================================================================
  var uploadInput = $("#upload-input");
  var uploadMediaInput = $("#upload-media-input");
  var uploadCameraInput = $("#upload-camera-input");
  var uploadSheet = $("#upload-sheet");
  var uploadState = {
    items: [],
    active: false,
    cancelled: false,
    xhr: null,
    dock: null,
    minimized: false,
  };

  function splitName(name) {
    var i = name.lastIndexOf(".");
    if (i < 1) return [name, ""];
    return [name.slice(0, i), name.slice(i)];
  }

  function uniqueName(name, taken) {
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
    var parts = splitName(name);
    for (var i = 1; i < 500; i++) {
      var candidate = parts[0] + " (" + i + ")" + parts[1];
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
    return name;
  }

  function namesInCurrentView() {
    var taken = new Set();
    if (state.listData) {
      state.listData.items.forEach(function (i) {
        taken.add(i.name.toLowerCase());
      });
    }
    return taken;
  }

  $("#upload-btn").addEventListener("click", function () {
    if (isTouchUi()) {
      openOverlay(uploadSheet, null, $("label", uploadSheet));
    } else {
      uploadInput.click();
    }
  });

  $$("label", uploadSheet).forEach(function (label) {
    label.addEventListener("click", function () {
      closeOverlay(uploadSheet);
    });
  });

  [uploadInput, uploadMediaInput, uploadCameraInput].forEach(function (input) {
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = "";
      if (files.length) startUpload(files);
    });
  });

  function startUpload(files) {
    if (uploadState.active) {
      toast("An upload is already running — wait for it to finish.", "error");
      return;
    }
    var taken = namesInCurrentView();
    var items = files.map(function (file) {
      var name = uniqueName(file.name || "file", taken);
      var item = {
        file: file,
        name: name,
        size: file.size || 0,
        status: "pending",
        message: "",
        attempts: 0,
      };
      if (item.size > state.config.maxUploadBytes) {
        item.status = "error";
        item.permanent = true;
        item.message = "Too large (" + formatSize(item.size) + ", max " + state.config.maxUploadMb + " MB)";
      } else if (!item.size) {
        item.status = "error";
        item.permanent = true;
        item.message = "Empty file";
      }
      return item;
    });
    uploadState.items = items;
    uploadState.cancelled = false;
    uploadState.active = true;
    hideError();
    renderUploadDock();
    runUploadQueue().then(function () {
      uploadState.active = false;
      uploadState.xhr = null;
      renderUploadDock();
      loadFiles();
      var okCount = uploadState.items.filter(function (i) { return i.status === "ok"; }).length;
      var failCount = uploadState.items.filter(function (i) { return i.status === "error"; }).length;
      if (okCount && !failCount) toast("Uploaded " + okCount + " file(s)", "success");
      else if (okCount && failCount) toast(okCount + " uploaded, " + failCount + " failed", "error");
      else if (failCount) {
        var firstError = uploadState.items.find(function (i) { return i.status === "error"; });
        toast("Upload failed: " + (firstError ? firstError.message : "unknown error"), "error");
      }
      if (!failCount) {
        setTimeout(function () {
          if (!uploadState.active) dismissUploadDock();
        }, 4000);
      }
    });
  }

  function uploadChunk(group) {
    return new Promise(function (resolve) {
      var fd = new FormData();
      group.forEach(function (item) {
        fd.append("files", item.file, item.name);
      });
      var xhr = new XMLHttpRequest();
      uploadState.xhr = xhr;
      xhr.open(
        "POST",
        "/api/files/upload?path=" + encodeURIComponent(state.currentPath),
      );
      xhr.upload.addEventListener("progress", function (e) {
        group.forEach(function (item) {
          if (item.status === "pending") item.status = "uploading";
        });
        updateUploadProgress(e.loaded, e.total);
      });
      xhr.addEventListener("load", function () {
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data && data.files) {
          resolve({ ok: true, files: data.files });
        } else {
          resolve({
            ok: false,
            message: (data && data.error && data.error.message) || "Upload failed (" + xhr.status + ")",
          });
        }
      });
      xhr.addEventListener("error", function () {
        resolve({ ok: false, message: "Network error while uploading" });
      });
      xhr.addEventListener("abort", function () {
        resolve({ ok: false, aborted: true, message: "Cancelled" });
      });
      xhr.send(fd);
    });
  }

  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function runUploadQueue() {
    var items = uploadState.items;
    var pending = items.filter(function (i) { return i.status === "pending"; });
    var groups = chunk(pending, UPLOAD_CHUNK_SIZE);

    for (var g = 0; g < groups.length; g++) {
      if (uploadState.cancelled) break;
      var group = groups[g];
      group.forEach(function (i) {
        i.status = "uploading";
      });
      renderUploadDock();
      var result = await uploadChunk(group);
      if (result.aborted) {
        group.forEach(function (i) {
          if (i.status !== "ok") {
            i.status = "error";
            i.message = "Cancelled";
          }
        });
        break;
      }
      if (!result.ok) {
        group.forEach(function (i) {
          if (i.status !== "ok") {
            i.status = "error";
            i.message = result.message;
          }
        });
        renderUploadDock();
        continue;
      }
      group.forEach(function (item, index) {
        var res = result.files[index];
        if (res && res.status === "ok") {
          item.status = "ok";
          item.name = res.name;
          item.path = res.path;
        } else {
          var message = (res && res.message) || "Upload failed";
          if (/exist/i.test(message) && item.attempts < 3) {
            item.status = "pending";
            item.message = "Name taken — retrying";
          } else {
            item.status = "error";
            item.message = message;
          }
        }
      });
      renderUploadDock();
    }

    // Retry name collisions once more with a fresh suffix.
    var retries = items.filter(function (i) { return i.status === "pending"; });
    var takenAll = namesInCurrentView();
    items.forEach(function (i) {
      if (i.status === "ok") takenAll.add(i.name.toLowerCase());
    });
    for (var r = 0; r < retries.length; r++) {
      if (uploadState.cancelled) break;
      var item = retries[r];
      item.attempts += 1;
      item.name = uniqueName(item.name, takenAll);
      item.status = "uploading";
      renderUploadDock();
      var single = await uploadChunk([item]);
      var first = single.files && single.files[0];
      if (single.ok && first && first.status === "ok") {
        item.status = "ok";
        item.name = first.name;
        item.path = first.path;
      } else if (item.attempts >= 3) {
        item.status = "error";
        item.message = (first && first.message) || single.message || "Upload failed";
      } else {
        item.status = "pending";
      }
      renderUploadDock();
    }
    // Any leftover pending item is a real failure.
    items.forEach(function (i) {
      if (i.status === "pending") {
        i.status = "error";
        i.message = i.message || "Upload failed";
      }
    });
  }

  function renderUploadDock() {
    var items = uploadState.items;
    if (!items.length) {
      dismissUploadDock();
      return;
    }
    var done = items.filter(function (i) {
      return i.status === "ok" || i.status === "error";
    }).length;
    var totalBytes = items.reduce(function (a, i) { return a + Math.max(1, i.size); }, 0);
    var sentBytes = items.reduce(function (a, i) {
      if (i.status === "ok" || i.status === "error") return a + Math.max(1, i.size);
      return a;
    }, 0);

    var dock = $("#upload-dock");
    if (!dock) {
      dock = create(
        '<section id="upload-dock" class="upload-dock" aria-label="Upload progress">' +
          '<div class="upload-dock-head"><h3 id="upload-dock-title">Uploading…</h3>' +
          '<span class="upload-dock-count" id="upload-dock-count"></span></div>' +
          '<div class="upload-bar"><div class="upload-bar-fill" id="upload-bar-fill"></div></div>' +
          '<ul class="upload-list" id="upload-list"></ul>' +
          '<div class="upload-dock-actions">' +
          '<button type="button" class="btn btn-sm" id="upload-minimize-btn" aria-label="Minimize upload panel">Minimize</button>' +
          '<button type="button" class="btn btn-sm hidden" id="upload-retry-btn">Retry failed</button>' +
          '<button type="button" class="btn btn-sm" id="upload-hide-btn">Hide</button>' +
          '<button type="button" class="btn btn-sm btn-danger" id="upload-cancel-btn">Cancel</button>' +
          "</div></section>",
      );
      document.body.appendChild(dock);
      $("#upload-cancel-btn").addEventListener("click", function () {
        uploadState.cancelled = true;
        if (uploadState.xhr) uploadState.xhr.abort();
        dismissUploadDock();
      });
      $("#upload-hide-btn").addEventListener("click", dismissUploadDock);
      $("#upload-minimize-btn").addEventListener("click", toggleUploadDock);
      $("#upload-retry-btn").addEventListener("click", function () {
        var failed = uploadState.items.filter(function (i) {
          return i.status === "error" && !i.permanent;
        });
        if (!failed.length) return;
        failed.forEach(function (i) {
          i.status = "pending";
          i.message = "";
        });
        uploadState.cancelled = false;
        uploadState.active = true;
        renderUploadDock();
        runUploadQueue().then(function () {
          uploadState.active = false;
          renderUploadDock();
          loadFiles();
        });
      });
    }
    uploadState.dock = dock;

    var failedCount = items.filter(function (i) { return i.status === "error"; }).length;
    $("#upload-dock-title").textContent = uploadState.active
      ? "Uploading " + Math.min(done + 1, items.length) + " of " + items.length + "…"
      : done === items.length
        ? "Upload finished"
        : "Upload stopped";
    $("#upload-dock-count").textContent = done + "/" + items.length;
    $("#upload-bar-fill").style.width = Math.round((sentBytes / totalBytes) * 100) + "%";
    $("#upload-cancel-btn").classList.toggle("hidden", !uploadState.active);
    $("#upload-hide-btn").classList.toggle("hidden", uploadState.active);
    var retryable = items.filter(function (i) {
      return i.status === "error" && !i.permanent;
    }).length;
    $("#upload-retry-btn").classList.toggle("hidden", retryable === 0);
    $("#upload-list").innerHTML = items
      .map(function (i) {
        var statusText =
          i.status === "ok"
            ? "✓"
            : i.status === "error"
              ? i.message || "Failed"
              : i.status === "uploading"
                ? "uploading…"
                : "queued";
        return (
          '<li class="upload-row upload-row--' + i.status + '">' +
          (i.status === "ok" ? ICONS.check : i.status === "error" ? ICONS.alert : ICONS.file) +
          '<span class="upload-row-name">' + eh(i.name) + "</span>" +
          '<span class="upload-row-status">' + eh(statusText) + "</span></li>"
        );
      })
      .join("");
    positionFloatingUi();
  }

  function updateUploadProgress(loaded, total) {
    var fill = $("#upload-bar-fill");
    if (!fill) return;
    var items = uploadState.items;
    var settled = items.reduce(function (a, i) {
      return a + (i.status === "ok" || i.status === "error" ? Math.max(1, i.size) : 0);
    }, 0);
    var totalBytes = items.reduce(function (a, i) { return a + Math.max(1, i.size); }, 0);
    var inFlight = Math.max(0, Math.min(loaded || 0, total || 0));
    fill.style.width = Math.min(100, Math.round(((settled + inFlight) / totalBytes) * 100)) + "%";
  }

  function dismissUploadDock() {
    var dock = $("#upload-dock");
    if (dock) dock.remove();
    uploadState.dock = null;
    uploadState.items = [];
    positionFloatingUi();
  }

  function toggleUploadDock() {
    var dock = $("#upload-dock");
    if (!dock) return;
    uploadState.minimized = !uploadState.minimized;
    dock.classList.toggle("upload-dock--minimized", !!uploadState.minimized);
    var btn = $("#upload-minimize-btn");
    if (btn) {
      btn.setAttribute(
        "aria-label",
        uploadState.minimized ? "Expand upload panel" : "Minimize upload panel",
      );
      btn.textContent = uploadState.minimized ? "Expand" : "Minimize";
    }
    positionFloatingUi();
  }

  window.addEventListener("beforeunload", function (e) {
    if (!uploadState.active) return;
    e.preventDefault();
    e.returnValue = "";
    return "";
  });

  // ---- Drag & drop (pointer devices only) ----
  var dragDepth = 0;
  function overlayOpen() {
    return state.overlays.length > 0;
  }
  appScreen.addEventListener("dragenter", function (e) {
    if (appScreen.classList.contains("hidden") || overlayOpen()) return;
    e.preventDefault();
    dragDepth++;
    if (dragDepth === 1) $("#drop-overlay").classList.remove("hidden");
  });
  appScreen.addEventListener("dragleave", function (e) {
    if (appScreen.classList.contains("hidden")) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $("#drop-overlay").classList.add("hidden");
  });
  appScreen.addEventListener("dragover", function (e) {
    if (appScreen.classList.contains("hidden") || overlayOpen()) return;
    e.preventDefault();
  });
  appScreen.addEventListener("drop", function (e) {
    if (appScreen.classList.contains("hidden") || overlayOpen()) return;
    e.preventDefault();
    dragDepth = 0;
    $("#drop-overlay").classList.add("hidden");
    var files = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (files.length) startUpload(files);
  });

  // ======================================================================
  // Account sheet
  // ======================================================================
  var accountSheet = $("#account-sheet");

  function openAccountSheet() {
    var actions = [];
    if (state.user && state.user.role === "admin") {
      actions.push({
        label: "Settings",
        icon: ICONS.settings,
        hint: "Users and password",
        run: showAdmin,
      });
    }
    actions.push({
      label: "Log out",
      icon: ICONS.logout,
      run: function () { $("#logout-btn").click(); },
    });
    $("#account-sheet-sub").textContent = state.user
      ? state.user.username + " · " + state.user.role
      : "";
    var list = $("#account-sheet-actions");
    list.innerHTML = actions.map(sheetItemHtml).join("");
    $$("button", list).forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        var action = actions[i];
        runSheetAction(accountSheet, action);
      });
    });
    openOverlay(accountSheet, null, $$("button", list)[0]);
  }

  $("#account-btn").addEventListener("click", openAccountSheet);

  // ======================================================================
  // Admin
  // ======================================================================
  var adminUserList = $("#admin-user-list");
  var adminSheet = null;

  function showAdmin() {
    appScreen.classList.add("hidden");
    adminScreen.classList.remove("hidden");
    loadAdminUsers();
    window.scrollTo({ top: 0 });
  }

  $("#admin-btn").addEventListener("click", showAdmin);
  $("#admin-back-btn").addEventListener("click", function () {
    adminScreen.classList.add("hidden");
    showApp({ resetPath: false });
  });

  async function loadAdminUsers() {
    try {
      var data = await api("GET", "/api/admin/users");
      adminUserList.innerHTML = data.users
        .map(function (u) {
          var isSelf = state.user && u.id === state.user.id;
          return (
            "<tr>" +
            "<td>" + eh(u.username) + (isSelf ? ' <span class="user-self-note">(you)</span>' : "") + "</td>" +
            '<td><span class="admin-role-badge ' + ea(u.role) + '">' + eh(u.role) + "</span></td>" +
            '<td class="file-date">' + formatDate(u.createdAt) + "</td>" +
            "<td>" +
            '<button type="button" class="icon-btn kebab" data-admin-menu="' + ea(u.username) + '"' +
            ' data-admin-role="' + ea(u.role) + '" data-admin-self="' + (isSelf ? "1" : "0") + '"' +
            ' aria-label="Actions for ' + ea(u.username) + '" aria-haspopup="dialog">' + ICONS.kebab + "</button>" +
            "</td></tr>"
          );
        })
        .join("");
      $$("[data-admin-menu]", adminUserList).forEach(function (btn) {
        btn.addEventListener("click", function () {
          openAdminSheet(btn.dataset.adminMenu, btn.dataset.adminRole, btn.dataset.adminSelf === "1");
        });
      });
    } catch (err) {
      adminUserList.innerHTML =
        '<tr><td colspan="4">Error: ' + eh(err.message) + "</td></tr>";
    }
  }

  function openAdminSheet(username, role, isSelf) {
    if (!adminSheet) {
      adminSheet = create(
        '<div id="admin-sheet" class="sheet hidden" role="dialog" aria-modal="true" aria-labelledby="admin-sheet-title">' +
          '<div class="sheet-backdrop" data-sheet-close></div>' +
          '<div class="sheet-panel"><div class="sheet-handle" aria-hidden="true"></div>' +
          '<h2 class="sheet-title" id="admin-sheet-title"></h2>' +
          '<p class="sheet-sub" id="admin-sheet-sub"></p>' +
          '<div class="sheet-list" id="admin-sheet-actions"></div>' +
          '<button type="button" class="btn btn-full sheet-cancel" data-sheet-close>Cancel</button>' +
          "</div></div>",
      );
      document.body.appendChild(adminSheet);
    }
    var actions = [];
    if (role === "admin") {
      actions.push({
        label: "Make user",
        icon: ICONS.user,
        disabled: isSelf,
        hint: isSelf ? "You cannot change your own role" : "",
        run: function () { adminSetRole(username, "user"); },
      });
    } else {
      actions.push({
        label: "Make admin",
        icon: ICONS.user,
        run: function () { adminSetRole(username, "admin"); },
      });
    }
    actions.push({
      label: "Reset password",
      icon: ICONS.pencil,
      run: function (from) { adminResetPassword(username, from); },
    });
    if (!isSelf) {
      actions.push({
        label: "Delete user",
        icon: ICONS.trash,
        danger: true,
        run: function (from) { adminDeleteUser(username, from); },
      });
    }
    $("#admin-sheet-title").textContent = username;
    $("#admin-sheet-sub").textContent = "Role: " + role;
    var list = $("#admin-sheet-actions");
    list.innerHTML = actions.map(sheetItemHtml).join("");
    $$("button", list).forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        runSheetAction(adminSheet, actions[i]);
      });
    });
    openOverlay(adminSheet, null, $$("button", list)[0]);
  }

  async function adminSetRole(username, role) {
    try {
      await api("PATCH", "/api/admin/users/" + encodeURIComponent(username), { role: role });
      toast(username + " is now " + (role === "admin" ? "an admin" : "a user"), "success");
      loadAdminUsers();
    } catch (e) {
      showError(e.message);
    }
  }

  async function adminDeleteUser(username, fromEl) {
    var ok = await confirmDialog({
      title: "Delete user?",
      message: '"' + username + '" will be removed and lose access. Their files stay in storage.',
      okLabel: "Delete",
      danger: true,
      from: fromEl,
    });
    if (!ok) return;
    try {
      await api("DELETE", "/api/admin/users/" + encodeURIComponent(username));
      toast("User deleted", "success");
      loadAdminUsers();
    } catch (e) {
      showError(e.message);
    }
  }

  async function adminResetPassword(username, fromEl) {
    var password = await promptDialog({
      title: "Reset password",
      message: "New password for " + username + " (at least 4 characters).",
      label: "New password",
      type: "password",
      from: fromEl,
    });
    if (!password) return;
    if (password.length < 4) {
      toast("Password must be at least 4 characters", "error");
      return;
    }
    try {
      await api("PATCH", "/api/admin/users/" + encodeURIComponent(username) + "/password", {
        password: password,
      });
      toast("Password reset for " + username, "success");
    } catch (e) {
      showError(e.message);
    }
  }

  $("#admin-create-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var username = $("#admin-username").value.trim();
    var password = $("#admin-password").value;
    var role = $("#admin-role").value;
    var banner = $("#admin-create-error");
    banner.classList.add("hidden");
    if (!username || !password) {
      banner.textContent = "Username and password are required";
      banner.classList.remove("hidden");
      return;
    }
    try {
      await api("POST", "/api/admin/users", { username: username, password: password, role: role });
      $("#admin-username").value = "";
      $("#admin-password").value = "";
      toast("User created", "success");
      loadAdminUsers();
    } catch (err) {
      banner.textContent = err.message;
      banner.classList.remove("hidden");
    }
  });

  $("#admin-self-pw-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var oldPassword = $("#admin-self-oldpw").value;
    var newPassword = $("#admin-self-newpw").value;
    var banner = $("#admin-self-pw-error");
    banner.classList.add("hidden");
    banner.classList.remove("success");
    if (!oldPassword || !newPassword) {
      banner.textContent = "Both fields are required";
      banner.classList.remove("hidden");
      return;
    }
    if (newPassword.length < 4) {
      banner.textContent = "New password must be at least 4 characters";
      banner.classList.remove("hidden");
      return;
    }
    try {
      await api("PATCH", "/api/auth/password", {
        oldPassword: oldPassword,
        newPassword: newPassword,
      });
      $("#admin-self-oldpw").value = "";
      $("#admin-self-newpw").value = "";
      banner.textContent = "Password changed.";
      banner.classList.add("success");
      banner.classList.remove("hidden");
      setTimeout(function () {
        banner.classList.add("hidden");
        banner.classList.remove("success");
      }, 4000);
    } catch (err) {
      banner.textContent = err.message;
      banner.classList.remove("hidden");
    }
  });

  // ======================================================================
  // Screens
  // ======================================================================
  function showError(message) {
    var banner = $("#error-banner");
    banner.textContent = message;
    banner.classList.remove("hidden");
  }
  function hideError() {
    $("#error-banner").classList.add("hidden");
  }

  function showLogin() {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    adminScreen.classList.add("hidden");
    dismissUploadDock();
    clearSelection();
    var user = $("#login-username");
    if (user) user.focus();
  }

  function showApp(opts) {
    var resetPath = !opts || opts.resetPath !== false;
    loginScreen.classList.add("hidden");
    adminScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    $("#current-user").textContent = state.user.username;
    $("#user-initials").textContent = state.user.username.slice(0, 2);
    $("#admin-btn").classList.toggle("hidden", state.user.role !== "admin");
    if (state.viewMode === null) {
      state.viewMode =
        (function () {
          try {
            return localStorage.getItem("simplecloud_view");
          } catch (e) {
            return null;
          }
        })() || (isTouchUi() ? "table" : "grid");
    }
    syncViewToggle();
    if (resetPath) {
      state.currentPath = "/";
      state.page = 1;
    }
    clearSelection();
    buildBreadcrumbs();
    loadFiles();
  }

  // ======================================================================
  // Boot
  // ======================================================================
  (async function init() {
    try {
      var data = await api("GET", "/api/auth/me");
      state.user = data.user;
      readUrlState();
      showApp({ resetPath: false });
      updateSortIndicators();
      try {
        state.config = Object.assign(state.config, await api("GET", "/api/config"));
      } catch (e) {
        /* keep defaults */
      }
    } catch (e) {
      showLogin();
    }
  })();
})();
