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
  };

  var $ = function (sel) {
    return document.querySelector(sel);
  };

  var loginScreen = $("#login-screen");
  var appScreen = $("#app-screen");
  var loginForm = $("#login-form");
  var loginError = $("#login-error");
  var errorBanner = $("#error-banner");
  var fileList = $("#file-list");
  var breadcrumbs = $("#breadcrumbs");
  var loadingState = $("#loading-state");
  var emptyState = $("#empty-state");
  var pageInfo = $("#page-info");
  var prevBtn = $("#prev-page");
  var nextBtn = $("#next-page");
  var currentUser = $("#current-user");

  // ---- API helpers ----
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
    if (!res.ok) throw new Error(data?.error?.message || res.statusText);
    return data;
  }

  async function loadPublished() {
    try {
      state.published = await api("GET", "/api/files/published");
    } catch {
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
    loadFiles();
  }

  function buildBreadcrumbs() {
    var parts = state.currentPath.split("/").filter(Boolean);
    var html = '<a data-path="/">Home</a>';
    var acc = "";
    for (var i = 0; i < parts.length; i++) {
      acc += "/" + parts[i];
      html += ' <span class="sep">/</span> ';
      html +=
        '<a data-path="' +
        escapeAttr(acc) +
        '">' +
        escapeHtml(parts[i]) +
        "</a>";
    }
    breadcrumbs.innerHTML = html;
    breadcrumbs.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(a.dataset.path);
      });
    });
  }

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
    fileList.innerHTML = "";
    loadingState.classList.remove("hidden");
    emptyState.classList.add("hidden");
  }

  function renderFiles() {
    loadingState.classList.add("hidden");
    var data = state.listData;
    if (!data || data.items.length === 0) {
      fileList.innerHTML = "";
      emptyState.classList.toggle("hidden", !!state.loading);
    } else {
      emptyState.classList.add("hidden");
    }
    if (!data) return;

    fileList.innerHTML = data.items
      .map(function (item) {
        var pub = isPublished(item.path);
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
          "<tr>" +
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
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    fileList.querySelectorAll("a[data-path]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(a.dataset.path);
      });
    });
    fileList.querySelectorAll(".rename-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openRenameModal(btn.dataset.path, btn.dataset.name);
      });
    });
    fileList.querySelectorAll(".delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openDeleteModal(btn.dataset.path, btn.dataset.name);
      });
    });
    fileList.querySelectorAll(".publish-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        publishPath(btn.dataset.path);
      });
    });
    fileList
      .querySelectorAll(".pub-link-btn, .pub-badge")
      .forEach(function (el) {
        el.addEventListener("click", function () {
          openPublishModal(el.dataset.path);
        });
      });

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

  // ---- Sort ----
  document.querySelectorAll(".sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var field = th.dataset.sort;
      if (state.sort === field) {
        state.direction = state.direction === "asc" ? "desc" : "asc";
      } else {
        state.sort = field;
        state.direction = "asc";
      }
      state.page = 1;
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
      loadFiles();
    }
  });
  nextBtn.addEventListener("click", function () {
    var totalPages = Math.ceil((state.listData?.total || 0) / state.pageSize);
    if (state.page < totalPages) {
      state.page++;
      loadFiles();
    }
  });

  // ---- Upload ----
  var uploadInput = $("#upload-input");
  $("#upload-btn").addEventListener("click", function () {
    uploadInput.click();
  });
  uploadInput.addEventListener("change", async function () {
    var files = uploadInput.files;
    if (!files.length) return;
    hideError();
    for (var i = 0; i < files.length; i++) {
      try {
        var fd = new FormData();
        fd.append("file", files[i]);
        var res = await fetch(
          "/api/files/upload?path=" + encodeURIComponent(state.currentPath),
          { method: "POST", body: fd },
        );
        var data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
      } catch (err) {
        showError("Upload: " + err.message);
        break;
      }
    }
    uploadInput.value = "";
    loadFiles();
  });

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
  var renameTargetPath = "";
  function openRenameModal(p, name) {
    renameTargetPath = p;
    renameInput.value = name;
    renameModal.classList.remove("hidden");
    renameInput.focus();
  }
  $("#rename-cancel").addEventListener("click", function () {
    renameModal.classList.add("hidden");
  });
  $("#rename-confirm").addEventListener("click", async function () {
    var newName = renameInput.value.trim();
    if (!newName) return;
    try {
      await api("PATCH", "/api/files/rename", {
        path: renameTargetPath,
        newName: newName,
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
  var deleteTargetPath = "";
  function openDeleteModal(p, name) {
    deleteTargetPath = p;
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
        "/api/files?path=" + encodeURIComponent(deleteTargetPath),
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
  async function publishPath(userPath) {
    try {
      await api("POST", "/api/files/publish", { path: userPath });
      await loadPublished();
      renderFiles();
      openPublishModal(userPath);
    } catch (err) {
      showError(err.message);
    }
  }

  // ---- Publish modal ----
  var publishModal = $("#publish-modal");
  var publishUrlInput = $("#publish-url-input");
  var publishPathEl = $("#publish-path");
  var publishRevokeBtn = $("#publish-revoke-btn");
  var currentPublishPath = "";

  function openPublishModal(userPath) {
    currentPublishPath = userPath;
    publishPathEl.textContent = userPath;
    var pub = isPublished(userPath);
    if (pub) {
      publishUrlInput.value = window.location.origin + "/pub" + userPath;
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
      await api("DELETE", "/api/files/publish", { path: currentPublishPath });
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
    $("#publish-copy-btn").textContent = "Copied!";
    setTimeout(function () {
      $("#publish-copy-btn").textContent = "Copy";
    }, 1500);
  });

  // ---- Refresh ----
  $("#refresh-btn").addEventListener("click", function () {
    loadFiles();
  });

  // ---- Error display ----
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
  }
  function hideError() {
    errorBanner.classList.add("hidden");
  }

  // ---- Utilities ----
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
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

  // ---- Modal backdrop ----
  document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
    bd.addEventListener("click", function () {
      folderModal.classList.add("hidden");
      renameModal.classList.add("hidden");
      deleteModal.classList.add("hidden");
      publishModal.classList.add("hidden");
    });
  });

  // ---- Screen switching ----
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
      var data = await api("GET", "/api/auth/me");
      state.user = data.user;
      showApp();
    } catch {
      showLogin();
    }
  })();
})();
