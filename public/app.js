(function () {
  "use strict";

  var state = {
    user: null,
    currentPath: "/",
    page: 1,
    pageSize: 50,
    sort: "name",
    direction: "asc",
    listData: null,
    loading: false,
    published: [],
    selected: {},
  };

  var $ = function (sel) {
    return document.querySelector(sel);
  };

  var loginScreen = $("#login-screen");
  var appScreen = $("#app-screen");
  var loginForm = $("#login-form");
  var loginError = $("#login-error");
  var errorBanner = $("#error-banner");
  var fileTbody = $("#file-list");
  var breadcrumbs = $("#breadcrumbs");
  var loadingState = $("#loading-state");
  var emptyState = $("#empty-state");
  var pageInfo = $("#page-info");
  var prevBtn = $("#prev-page");
  var nextBtn = $("#next-page");
  var currentUser = $("#current-user");
  var dropZone = $("#drop-zone");
  var dropOverlay = $("#drop-overlay");
  var batchBar = $("#batch-bar");
  var batchCount = $("#batch-count");
  var selectAll = $("#select-all");

  // ---- API ----
  async function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body && !(body instanceof FormData)) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    var res = await fetch(url, opts);
    var data = await res.json();
    if (!res.ok)
      throw new Error(data && data.error ? data.error.message : res.statusText);
    return data;
  }

  async function loadPublished() {
    try {
      state.published = await api("GET", "/api/files/published");
    } catch (e) {
      state.published = [];
    }
  }

  function isPublished(userPath) {
    return state.published.find(function (p) {
      return p.path === userPath;
    });
  }

  // ---- Auth ----
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(loginForm);
    loginError.classList.add("hidden");
    var btn = $("#login-btn");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      var data = await api("POST", "/api/auth/login", {
        username: fd.get("username"),
        password: fd.get("password"),
      });
      state.user = data.user;
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });

  $("#logout-btn").addEventListener("click", async function () {
    await api("POST", "/api/auth/logout");
    state.user = null;
    showLogin();
  });

  // ---- Navigation ----
  function navigateTo(p) {
    state.currentPath = p;
    state.page = 1;
    clearSelection();
    loadFiles();
  }

  function buildBreadcrumbs() {
    var parts = state.currentPath.split("/").filter(Boolean);
    var html = '<a data-path="/">Home</a>';
    var acc = "";
    for (var i = 0; i < parts.length; i++) {
      acc += "/" + parts[i];
      html +=
        ' <span class="sep">/</span> <a data-path="' +
        escapeAttr(acc) +
        '">' +
        escapeHtml(parts[i]) +
        "</a>";
    }
    breadcrumbs.innerHTML = html;
    breadcrumbs.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        navigateTo(a.dataset.path);
      });
    });
  }

  // ---- Selection ----
  function clearSelection() {
    state.selected = {};
    selectAll.checked = false;
    updateBatchBar();
  }

  function toggleSelect(path) {
    if (state.selected[path]) delete state.selected[path];
    else state.selected[path] = true;
    updateBatchBar();
    updateSelectAllCheckbox();
    highlightRows();
  }

  function updateSelectAllCheckbox() {
    if (!state.listData || state.listData.items.length === 0) {
      selectAll.checked = false;
      return;
    }
    selectAll.checked = state.listData.items.every(function (i) {
      return state.selected[i.path];
    });
  }

  function updateBatchBar() {
    var count = Object.keys(state.selected).length;
    if (count > 0) {
      batchBar.classList.remove("hidden");
      batchCount.textContent = count + " selected";
    } else {
      batchBar.classList.add("hidden");
    }
  }

  function highlightRows() {
    fileTbody.querySelectorAll("tr").forEach(function (tr) {
      var cb = tr.querySelector(".row-checkbox");
      if (cb && cb.checked) tr.classList.add("selected");
      else tr.classList.remove("selected");
    });
  }

  selectAll.addEventListener("change", function () {
    if (!state.listData) return;
    if (selectAll.checked)
      state.listData.items.forEach(function (i) {
        state.selected[i.path] = true;
      });
    else state.selected = {};
    fileTbody.querySelectorAll(".row-checkbox").forEach(function (cb) {
      cb.checked = selectAll.checked;
    });
    updateBatchBar();
    highlightRows();
  });

  // ---- Batch delete ----
  $("#batch-delete-btn").addEventListener("click", async function () {
    var paths = Object.keys(state.selected);
    if (paths.length === 0) return;
    if (!confirm("Delete " + paths.length + " item(s)?")) return;
    try {
      await api("POST", "/api/files/delete-batch", { paths: paths });
      clearSelection();
      hideError();
      if (
        state.listData &&
        state.listData.items.length === paths.length &&
        state.page > 1
      )
        state.page--;
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });

  $("#batch-clear-btn").addEventListener("click", function () {
    clearSelection();
    highlightRows();
  });

  // ---- File loading ----
  async function loadFiles() {
    state.loading = true;
    renderLoading();
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
      state.listData = data;
      state.loading = false;
      await loadPublished();
      renderFiles();
    } catch (err) {
      state.loading = false;
      state.listData = null;
      showError(err.message);
      renderFiles();
    }
  }

  function renderLoading() {
    fileTbody.innerHTML = "";
    loadingState.classList.remove("hidden");
    emptyState.classList.add("hidden");
  }

  function renderFiles() {
    loadingState.classList.add("hidden");
    var data = state.listData;
    if (!data || data.items.length === 0) {
      fileTbody.innerHTML = "";
      emptyState.classList.toggle("hidden", !!state.loading);
    } else {
      emptyState.classList.add("hidden");
    }
    if (!data) return;

    fileTbody.innerHTML = data.items
      .map(function (item) {
        var pub = isPublished(item.path);
        var checked = state.selected[item.path] ? " checked" : "";
        var typeIcon =
          item.type === "folder"
            ? '<span class="folder-icon">&#128193;</span>'
            : "<span>&#128196;</span>";
        var nameCell =
          item.type === "folder"
            ? '<a class="file-link" data-path="' +
              escapeAttr(item.path) +
              '">' +
              typeIcon +
              " " +
              escapeHtml(item.name) +
              "</a>"
            : '<a class="file-link" href="/api/files/download?path=' +
              encodeURIComponent(item.path) +
              '" download>' +
              typeIcon +
              " " +
              escapeHtml(item.name) +
              "</a>";

        return (
          '<tr class="' +
          (checked ? "selected" : "") +
          '">' +
          '<td class="col-check"><input type="checkbox" class="row-checkbox" data-path="' +
          escapeAttr(item.path) +
          '"' +
          checked +
          "></td>" +
          "<td>" +
          nameCell +
          "</td>" +
          "<td>" +
          item.type +
          "</td>" +
          '<td class="file-size">' +
          (item.type === "folder" ? "—" : formatSize(item.size)) +
          "</td>" +
          '<td class="file-date">' +
          formatDate(item.modifiedAt) +
          "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn-sm rename-btn" data-path="' +
          escapeAttr(item.path) +
          '" data-name="' +
          escapeAttr(item.name) +
          '">Rename</button>' +
          '<button class="btn btn-sm btn-danger delete-btn" data-path="' +
          escapeAttr(item.path) +
          '" data-name="' +
          escapeAttr(item.name) +
          '">Del</button>' +
          (pub
            ? '<button class="btn btn-sm btn-publish pub-link-btn" data-path="' +
              escapeAttr(item.path) +
              '">Link</button>'
            : '<button class="btn btn-sm publish-btn" data-path="' +
              escapeAttr(item.path) +
              '">Publish</button>') +
          "</div></td></tr>"
        );
      })
      .join("");

    fileTbody.querySelectorAll(".row-checkbox").forEach(function (cb) {
      cb.addEventListener("change", function () {
        toggleSelect(cb.dataset.path);
      });
    });
    fileTbody.querySelectorAll("a[data-path]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        navigateTo(a.dataset.path);
      });
    });
    fileTbody.querySelectorAll(".rename-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openRenameModal(btn.dataset.path, btn.dataset.name);
      });
    });
    fileTbody.querySelectorAll(".delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openDeleteModal(btn.dataset.path, btn.dataset.name);
      });
    });
    fileTbody.querySelectorAll(".publish-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        publishPath(btn.dataset.path);
      });
    });
    fileTbody
      .querySelectorAll(".pub-link-btn, .pub-badge")
      .forEach(function (el) {
        el.addEventListener("click", function () {
          openPublishModal(el.dataset.path);
        });
      });

    updateSelectAllCheckbox();
    renderSortArrows();
    renderPagination();
  }

  function renderPagination() {
    var data = state.listData;
    if (!data || data.total === 0) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageInfo.textContent = "";
      return;
    }
    var totalPages = Math.ceil(data.total / data.pageSize);
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pageInfo.textContent =
      "Page " +
      state.page +
      " of " +
      totalPages +
      " (" +
      data.total +
      " items)";
  }

  document.querySelectorAll(".sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var field = th.dataset.sort;
      if (state.sort === field)
        state.direction = state.direction === "asc" ? "desc" : "asc";
      else {
        state.sort = field;
        state.direction = "asc";
      }
      state.page = 1;
      clearSelection();
      loadFiles();
    });
  });

  function renderSortArrows() {
    document.querySelectorAll(".sort-arrow").forEach(function (el) {
      el.classList.remove("asc", "desc");
    });
    var active = document.querySelector(
      'th[data-sort="' + state.sort + '"] .sort-arrow',
    );
    if (active) active.classList.add(state.direction);
  }

  prevBtn.addEventListener("click", function () {
    if (state.page > 1) {
      state.page--;
      clearSelection();
      loadFiles();
    }
  });
  nextBtn.addEventListener("click", function () {
    var totalPages = Math.ceil(
      ((state.listData && state.listData.total) || 0) / state.pageSize,
    );
    if (state.page < totalPages) {
      state.page++;
      clearSelection();
      loadFiles();
    }
  });

  // ---- Upload (click) ----
  var uploadInput = $("#upload-input");
  $("#upload-btn").addEventListener("click", function () {
    uploadInput.click();
  });
  uploadInput.addEventListener("change", function () {
    doUpload(uploadInput.files);
  });

  // ---- Drag and drop (scoped to app screen) ----
  var dragCounter = 0;

  function isAppVisible() {
    return !appScreen.classList.contains("hidden");
  }
  function anyModalOpen() {
    return (
      !$("#folder-modal").classList.contains("hidden") ||
      !$("#rename-modal").classList.contains("hidden") ||
      !$("#delete-modal").classList.contains("hidden") ||
      !$("#publish-modal").classList.contains("hidden")
    );
  }

  appScreen.addEventListener("dragenter", function (e) {
    if (!isAppVisible() || anyModalOpen()) return;
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dropOverlay.classList.remove("hidden");
  });
  appScreen.addEventListener("dragleave", function (e) {
    if (!isAppVisible()) return;
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropOverlay.classList.add("hidden");
  });
  appScreen.addEventListener("dragover", function (e) {
    if (!isAppVisible() || anyModalOpen()) return;
    e.preventDefault();
  });
  appScreen.addEventListener("drop", function (e) {
    if (!isAppVisible() || anyModalOpen()) return;
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add("hidden");
    if (e.dataTransfer.files.length > 0) doUpload(e.dataTransfer.files);
  });

  async function doUpload(files) {
    if (!files || files.length === 0) return;
    hideError();

    var progressEl = showUploadProgress(files.length);
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append("files", files[i]);

    try {
      var res = await fetch(
        "/api/files/upload?path=" + encodeURIComponent(state.currentPath),
        { method: "POST", body: fd },
      );
      var data = await res.json();
      if (!res.ok)
        throw new Error(
          (data && data.error && data.error.message) || "Upload failed",
        );
      if (data.files) updateUploadProgress(progressEl, data.files);
    } catch (err) {
      showError("Upload: " + err.message);
      if (progressEl) progressEl.remove();
    }
    uploadInput.value = "";
    loadFiles();
  }

  function showUploadProgress(total) {
    var el = document.createElement("div");
    el.className = "upload-progress";
    el.innerHTML =
      "<h3>Uploading " +
      total +
      " file(s)...</h3>" +
      '<div class="bar"><div class="bar-fill" style="width:0%"></div></div>';
    document.body.appendChild(el);
    // Animate bar to 90% over ~30s so it doesn't look frozen
    setTimeout(function () {
      var bar = el.querySelector(".bar-fill");
      if (bar) {
        bar.style.transition = "width 30s linear";
        bar.style.width = "90%";
      }
    }, 100);
    return el;
  }

  function updateUploadProgress(el, files) {
    var total = files.length;
    var ok = 0,
      err = 0;
    files.forEach(function (f) {
      if (f.status === "ok") ok++;
      else err++;
    });
    var done = ok + err;
    var pct = Math.round((done / total) * 100);
    var bar = el.querySelector(".bar-fill");
    if (bar) {
      bar.style.transition = "width 0.3s ease";
      bar.style.width = pct + "%";
    }

    var html = "<h3>Uploaded " + done + " of " + total + "</h3>";
    files.forEach(function (f) {
      var cls = f.status === "ok" ? "ok" : "err";
      var icon = f.status === "ok" ? "✓" : "✗";
      html +=
        '<div class="file-item"><span>' +
        icon +
        " " +
        escapeHtml(f.name) +
        '</span><span class="' +
        cls +
        '">' +
        (f.status === "ok" ? formatSize(f.size || 0) : f.message || "error") +
        "</span></div>";
    });
    html +=
      '<div class="bar"><div class="bar-fill" style="width:' +
      pct +
      '%"></div></div>';
    el.innerHTML = html;
    setTimeout(function () {
      el.remove();
    }, 4000);
  }

  // ---- Create folder modal ----
  var folderModal = $("#folder-modal");
  var folderInput = $("#folder-name-input");
  $("#create-folder-btn").addEventListener("click", function () {
    folderModal.classList.remove("hidden");
    folderInput.value = "";
    folderInput.focus();
  });
  $("#folder-cancel").addEventListener("click", function () {
    folderModal.classList.add("hidden");
  });
  $("#folder-confirm").addEventListener("click", async function () {
    var name = folderInput.value.trim();
    if (!name) return;
    try {
      await api("POST", "/api/files/folder", {
        path: state.currentPath,
        name: name,
      });
      folderModal.classList.add("hidden");
      hideError();
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });
  folderInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#folder-confirm").click();
    if (e.key === "Escape") folderModal.classList.add("hidden");
  });

  // ---- Rename modal ----
  var renameModal = $("#rename-modal");
  var renameInput = $("#rename-input");
  var renameTarget = "";
  function openRenameModal(p, name) {
    renameTarget = p;
    renameInput.value = name;
    renameModal.classList.remove("hidden");
    renameInput.focus();
  }
  $("#rename-cancel").addEventListener("click", function () {
    renameModal.classList.add("hidden");
  });
  $("#rename-confirm").addEventListener("click", async function () {
    var n = renameInput.value.trim();
    if (!n) return;
    try {
      await api("PATCH", "/api/files/rename", {
        path: renameTarget,
        newName: n,
      });
      renameModal.classList.add("hidden");
      hideError();
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });
  renameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#rename-confirm").click();
    if (e.key === "Escape") renameModal.classList.add("hidden");
  });

  // ---- Delete modal ----
  var deleteModal = $("#delete-modal");
  var deleteNameEl = $("#delete-name");
  var deleteTarget = "";
  function openDeleteModal(p, name) {
    deleteTarget = p;
    deleteNameEl.textContent = name;
    deleteModal.classList.remove("hidden");
  }
  $("#delete-cancel").addEventListener("click", function () {
    deleteModal.classList.add("hidden");
  });
  $("#delete-confirm").addEventListener("click", async function () {
    try {
      await api(
        "DELETE",
        "/api/files?path=" + encodeURIComponent(deleteTarget),
      );
      deleteModal.classList.add("hidden");
      hideError();
      if (state.listData && state.listData.items.length === 1 && state.page > 1)
        state.page--;
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });

  // ---- Publish ----
  async function publishPath(p) {
    try {
      await api("POST", "/api/files/publish", { path: p });
      await loadPublished();
      renderFiles();
      openPublishModal(p);
    } catch (err) {
      showError(err.message);
    }
  }

  var publishModal = $("#publish-modal");
  var publishUrlInput = $("#publish-url-input");
  var publishPathEl = $("#publish-path");
  var publishRevokeBtn = $("#publish-revoke-btn");
  var curPubPath = "";

  function openPublishModal(p) {
    curPubPath = p;
    publishPathEl.textContent = p;
    var pub = isPublished(p);
    if (pub) {
      publishUrlInput.value = window.location.origin + "/pub" + p;
      publishRevokeBtn.classList.remove("hidden");
    } else {
      publishUrlInput.value = "(not published)";
      publishRevokeBtn.classList.add("hidden");
    }
    publishModal.classList.remove("hidden");
  }

  $("#publish-close").addEventListener("click", function () {
    publishModal.classList.add("hidden");
  });
  $("#publish-revoke-btn").addEventListener("click", async function () {
    try {
      await api("DELETE", "/api/files/publish", { path: curPubPath });
      publishModal.classList.add("hidden");
      hideError();
      await loadPublished();
      renderFiles();
    } catch (err) {
      showError(err.message);
    }
  });
  $("#publish-copy-btn").addEventListener("click", function () {
    publishUrlInput.select();
    document.execCommand("copy");
    var b = $("#publish-copy-btn");
    b.textContent = "Copied!";
    setTimeout(function () {
      b.textContent = "Copy";
    }, 1500);
  });

  // ---- Refresh ----
  $("#refresh-btn").addEventListener("click", function () {
    loadFiles();
  });

  // ---- Error ----
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
  }
  function hideError() {
    errorBanner.classList.add("hidden");
  }

  // ---- Utils ----
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(1) + " GB";
  }
  function formatDate(iso) {
    var d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
  }
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---- Modals backdrop ----
  document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
    bd.addEventListener("click", function () {
      folderModal.classList.add("hidden");
      renameModal.classList.add("hidden");
      deleteModal.classList.add("hidden");
      publishModal.classList.add("hidden");
    });
  });

  // ---- Screens ----
  function showLogin() {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
  async function showApp() {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    currentUser.textContent = state.user.username;
    state.currentPath = "/";
    state.page = 1;
    buildBreadcrumbs();
    await loadFiles();
  }

  // ---- Init ----
  (async function init() {
    try {
      var d = await api("GET", "/api/auth/me");
      state.user = d.user;
      showApp();
    } catch (e) {
      showLogin();
    }
  })();
})();
