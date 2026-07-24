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
    viewMode: localStorage.getItem("simplecloud_view") || "grid",
  };

  var $ = function (sel) {
    return document.querySelector(sel);
  };
  var ls = $("#login-screen"),
    as = $("#app-screen"),
    ads = $("#admin-screen");
  var lf = $("#login-form"),
    le = $("#login-error");
  var eb = $("#error-banner"),
    ft = $("#file-list"),
    fg = $("#file-grid"),
    fth = $("#file-table-head"),
    bc = $("#breadcrumbs");
  var ld = $("#loading-state"),
    em = $("#empty-state"),
    pi = $("#page-info");
  var pb = $("#prev-page"),
    nb = $("#next-page"),
    cu = $("#current-user");
  var dd = $("#drop-overlay"),
    bb = $("#batch-bar"),
    bcn = $("#batch-count"),
    sa = $("#select-all");
  var ab = $("#admin-btn"),
    aul = $("#admin-user-list"),
    ace = $("#admin-create-error");

  async function api(method, url, body) {
    var o = { method: method, headers: {} };
    if (body && !(body instanceof FormData)) {
      o.headers["Content-Type"] = "application/json";
      o.body = JSON.stringify(body);
    } else if (body instanceof FormData) o.body = body;
    var r = await fetch(url, o),
      d = await r.json();
    if (!r.ok) throw new Error(d && d.error ? d.error.message : r.statusText);
    return d;
  }

  async function loadPublished() {
    try {
      state.published = await api("GET", "/api/files/published");
    } catch (e) {
      state.published = [];
    }
  }
  function isPublished(p) {
    return state.published.find(function (x) {
      return x.path === p;
    });
  }

  // Auth
  lf.addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(lf);
    le.classList.add("hidden");
    var b = $("#login-btn");
    b.disabled = true;
    b.textContent = "Signing in...";
    try {
      var d = await api("POST", "/api/auth/login", {
        username: fd.get("username"),
        password: fd.get("password"),
      });
      state.user = d.user;
      showApp();
    } catch (err) {
      le.textContent = err.message;
      le.classList.remove("hidden");
    } finally {
      b.disabled = false;
      b.textContent = "Sign in";
    }
  });
  $("#logout-btn").addEventListener("click", async function () {
    await api("POST", "/api/auth/logout");
    state.user = null;
    showLogin();
  });

  // Navigation
  function nav(p) {
    state.currentPath = p;
    state.page = 1;
    cs();
    loadFiles();
  }
  function buildBC() {
    var p = state.currentPath.split("/").filter(Boolean),
      h = '<a data-path="/">Home</a>',
      a = "";
    for (var i = 0; i < p.length; i++) {
      a += "/" + p[i];
      h +=
        ' <span class="sep">/</span> <a data-path="' +
        ea(a) +
        '">' +
        eh(p[i]) +
        "</a>";
    }
    bc.innerHTML = h;
    bc.querySelectorAll("a").forEach(function (x) {
      x.addEventListener("click", function (e) {
        e.preventDefault();
        nav(x.dataset.path);
      });
    });
  }

  // Selection
  function cs() {
    state.selected = {};
    sa.checked = false;
    ubb();
  }
  function ts(p) {
    if (state.selected[p]) delete state.selected[p];
    else state.selected[p] = true;
    ubb();
    usac();
    hr();
  }
  function usac() {
    if (!state.listData || !state.listData.items.length) {
      sa.checked = false;
      return;
    }
    sa.checked = state.listData.items.every(function (i) {
      return state.selected[i.path];
    });
  }
  function ubb() {
    var c = Object.keys(state.selected).length;
    if (c) {
      bb.classList.remove("hidden");
      bcn.textContent = c + " selected";
    } else bb.classList.add("hidden");
  }
  function hr() {
    var items =
      state.viewMode === "grid"
        ? fg.querySelectorAll(".grid-item")
        : ft.querySelectorAll("tr");
    items.forEach(function (el) {
      var cb = el.querySelector(".row-checkbox");
      if (cb && cb.checked) el.classList.add("selected");
      else el.classList.remove("selected");
    });
  }
  sa.addEventListener("change", function () {
    if (!state.listData) return;
    if (sa.checked)
      state.listData.items.forEach(function (i) {
        state.selected[i.path] = true;
      });
    else state.selected = {};
    var container = state.viewMode === "grid" ? fg : ft;
    container.querySelectorAll(".row-checkbox").forEach(function (c) {
      c.checked = sa.checked;
    });
    ubb();
    hr();
  });
  $("#batch-delete-btn").addEventListener("click", async function () {
    var p = Object.keys(state.selected);
    if (!p.length) return;
    if (!confirm("Delete " + p.length + " item(s)?")) return;
    try {
      await api("POST", "/api/files/delete-batch", { paths: p });
      cs();
      he();
      if (
        state.listData &&
        state.listData.items.length === p.length &&
        state.page > 1
      )
        state.page--;
      loadFiles();
    } catch (err) {
      se(err.message);
    }
  });
  $("#batch-clear-btn").addEventListener("click", function () {
    cs();
    hr();
  });

  // Files
  async function loadFiles() {
    state.loading = true;
    rl();
    he();
    try {
      var p = new URLSearchParams({
        path: state.currentPath,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort,
        direction: state.direction,
      });
      state.listData = await api("GET", "/api/files?" + p.toString());
      state.loading = false;
      await loadPublished();
      rf();
    } catch (err) {
      state.loading = false;
      state.listData = null;
      se(err.message);
      rf();
    }
  }
  function rl() {
    ft.innerHTML = "";
    fg.innerHTML = "";
    ld.classList.remove("hidden");
    em.classList.add("hidden");
  }
  function isImageFile(name) {
    var ext = name.split(".").pop().toLowerCase();
    return (
      [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "avif",
        "bmp",
        "svg",
        "tiff",
        "tif",
      ].indexOf(ext) !== -1
    );
  }
  function rf() {
    ld.classList.add("hidden");
    var isGrid = state.viewMode === "grid";
    fth.classList.toggle("hidden", isGrid);
    fg.classList.toggle("hidden", !isGrid);
    var d = state.listData;
    if (!d || !d.items.length) {
      ft.innerHTML = "";
      fg.innerHTML = "";
      em.classList.toggle("hidden", !!state.loading);
    } else {
      em.classList.add("hidden");
    }
    if (!d) return;
    if (isGrid) {
      ft.innerHTML = "";
      renderGrid(d);
    } else {
      fg.innerHTML = "";
      renderTable(d);
    }
    usac();
    rsa();
    rp();
  }

  function iconFor(item) {
    if (item.type === "folder") {
      return '<span class="folder-icon">&#128193;</span>';
    }
    if (isImageFile(item.name)) {
      return (
        '<img class="thumbnail" src="/api/files/thumbnail?path=' +
        encodeURIComponent(item.path) +
        '" alt="" loading="lazy">'
      );
    }
    return "<span>&#128196;</span>";
  }

  function itemActions(item, pub) {
    return (
      '<button class="btn btn-sm rename-btn" data-path="' +
      ea(item.path) +
      '" data-name="' +
      ea(item.name) +
      '">Rename</button>' +
      '<button class="btn btn-sm btn-danger delete-btn" data-path="' +
      ea(item.path) +
      '" data-name="' +
      ea(item.name) +
      '">Del</button>' +
      (pub
        ? '<button class="btn btn-sm btn-publish pub-link-btn" data-path="' +
          ea(item.path) +
          '">Link</button>'
        : '<button class="btn btn-sm publish-btn" data-path="' +
          ea(item.path) +
          '">Publish</button>')
    );
  }

  function bindItemEvents(container) {
    container.querySelectorAll(".row-checkbox").forEach(function (c) {
      c.addEventListener("change", function () {
        ts(c.dataset.path);
      });
    });
    container.querySelectorAll("a[data-path]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        nav(a.dataset.path);
      });
    });
    container.querySelectorAll(".rename-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        orm(b.dataset.path, b.dataset.name);
      });
    });
    container.querySelectorAll(".delete-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        odm(b.dataset.path, b.dataset.name);
      });
    });
    container.querySelectorAll(".publish-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        pp(b.dataset.path);
      });
    });
    container.querySelectorAll(".pub-link-btn").forEach(function (e) {
      e.addEventListener("click", function () {
        opm(e.dataset.path);
      });
    });
  }

  function renderTable(d) {
    ft.innerHTML = d.items
      .map(function (i) {
        var pub = isPublished(i.path),
          ch = state.selected[i.path] ? " checked" : "",
          ic = iconFor(i),
          nm =
            i.type === "folder"
              ? '<a class="file-link" data-path="' +
                ea(i.path) +
                '">' +
                ic +
                " " +
                eh(i.name) +
                "</a>"
              : '<a class="file-link" href="/api/files/download?path=' +
                encodeURIComponent(i.path) +
                '" download>' +
                ic +
                " " +
                eh(i.name) +
                "</a>";
        return (
          '<tr class="' +
          (ch ? "selected" : "") +
          '"><td class="col-check" data-label=""><input type="checkbox" class="row-checkbox" data-path="' +
          ea(i.path) +
          '"' +
          ch +
          "></td>" +
          '<td data-label="Name">' +
          nm +
          '</td><td data-label="Type">' +
          i.type +
          "</td>" +
          '<td class="file-size" data-label="Size">' +
          (i.type === "folder" ? "—" : fs(i.size)) +
          "</td>" +
          '<td class="file-date" data-label="Modified">' +
          fd(i.modifiedAt) +
          "</td>" +
          '<td data-label="Actions"><div class="row-actions">' +
          itemActions(i, pub) +
          "</div></td></tr>"
        );
      })
      .join("");
    bindItemEvents(ft);
  }

  function renderGrid(d) {
    fg.innerHTML = d.items
      .map(function (i) {
        var ch = state.selected[i.path] ? " checked" : "",
          ic = iconFor(i),
          isImg = i.type === "file" && isImageFile(i.name),
          nm =
            i.type === "folder"
              ? '<a class="file-link" data-path="' +
                ea(i.path) +
                '">' +
                eh(i.name) +
                "</a>"
              : '<a class="file-link" href="/api/files/download?path=' +
                encodeURIComponent(i.path) +
                '" download>' +
                eh(i.name) +
                "</a>";
        return (
          '<div class="grid-item' +
          (ch ? " selected" : "") +
          '" data-path="' +
          ea(i.path) +
          '" data-type="' +
          i.type +
          '">' +
          '<label class="grid-check"><input type="checkbox" class="row-checkbox" data-path="' +
          ea(i.path) +
          '"' +
          ch +
          "></label>" +
          '<div class="grid-preview">' +
          (isImg
            ? '<img class="grid-thumb" src="/api/files/thumbnail?path=' +
              encodeURIComponent(i.path) +
              '" alt="" loading="lazy">'
            : ic) +
          "</div>" +
          '<div class="grid-name">' +
          nm +
          "</div>" +
          '<div class="grid-meta">' +
          (i.type === "folder" ? "" : fs(i.size)) +
          "</div>" +
          '<div class="grid-actions">' +
          '<button class="btn btn-sm rename-btn" data-path="' +
          ea(i.path) +
          '" data-name="' +
          ea(i.name) +
          '">Rename</button>' +
          '<button class="btn btn-sm btn-danger delete-btn" data-path="' +
          ea(i.path) +
          '" data-name="' +
          ea(i.name) +
          '">Del</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    bindItemEvents(fg);
    fg.querySelectorAll(".grid-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        if (
          e.target.closest("button") ||
          e.target.closest("label") ||
          e.target.closest("input") ||
          e.target.closest("a")
        )
          return;
        var path = item.dataset.path;
        if (item.dataset.type === "folder") {
          nav(path);
        } else {
          window.location.href =
            "/api/files/download?path=" + encodeURIComponent(path);
        }
      });
    });
  }
  function rp() {
    var d = state.listData;
    if (!d || !d.total) {
      pb.disabled = true;
      nb.disabled = true;
      pi.textContent = "";
      return;
    }
    var t = Math.ceil(d.total / d.pageSize);
    pb.disabled = state.page <= 1;
    nb.disabled = state.page >= t;
    pi.textContent =
      "Page " + state.page + " of " + t + " (" + d.total + " items)";
  }
  document.querySelectorAll(".sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var f = th.dataset.sort;
      if (state.sort === f)
        state.direction = state.direction === "asc" ? "desc" : "asc";
      else {
        state.sort = f;
        state.direction = "asc";
      }
      state.page = 1;
      cs();
      loadFiles();
    });
  });
  function rsa() {
    document.querySelectorAll(".sort-arrow").forEach(function (e) {
      e.classList.remove("asc", "desc");
    });
    var a = document.querySelector(
      'th[data-sort="' + state.sort + '"] .sort-arrow',
    );
    if (a) a.classList.add(state.direction);
  }
  pb.addEventListener("click", function () {
    if (state.page > 1) {
      state.page--;
      cs();
      loadFiles();
    }
  });
  nb.addEventListener("click", function () {
    var t = Math.ceil(
      ((state.listData && state.listData.total) || 0) / state.pageSize,
    );
    if (state.page < t) {
      state.page++;
      cs();
      loadFiles();
    }
  });
  var ms = $("#mobile-sort");
  if (ms)
    ms.addEventListener("change", function () {
      var p = ms.value.split("-");
      state.sort = p[0];
      state.direction = p[1];
      state.page = 1;
      cs();
      loadFiles();
    });

  // Upload
  var ui = $("#upload-input");
  $("#upload-btn").addEventListener("click", function () {
    ui.click();
  });
  ui.addEventListener("change", function () {
    du(ui.files);
  });
  var dc = 0;
  function iv() {
    return !as.classList.contains("hidden");
  }
  function amo() {
    return (
      !$("#folder-modal").classList.contains("hidden") ||
      !$("#rename-modal").classList.contains("hidden") ||
      !$("#delete-modal").classList.contains("hidden") ||
      !$("#publish-modal").classList.contains("hidden")
    );
  }
  as.addEventListener("dragenter", function (e) {
    if (!iv() || amo()) return;
    e.preventDefault();
    dc++;
    if (dc === 1) dd.classList.remove("hidden");
  });
  as.addEventListener("dragleave", function (e) {
    if (!iv()) return;
    e.preventDefault();
    dc--;
    if (!dc) dd.classList.add("hidden");
  });
  as.addEventListener("dragover", function (e) {
    if (!iv() || amo()) return;
    e.preventDefault();
  });
  as.addEventListener("drop", function (e) {
    if (!iv() || amo()) return;
    e.preventDefault();
    dc = 0;
    dd.classList.add("hidden");
    if (e.dataTransfer.files.length) du(e.dataTransfer.files);
  });
  async function du(files) {
    if (!files || !files.length) return;
    he();
    var pr = sup(files.length);
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append("files", files[i]);
    try {
      var r = await fetch(
        "/api/files/upload?path=" + encodeURIComponent(state.currentPath),
        { method: "POST", body: fd },
      );
      var d = await r.json();
      if (!r.ok)
        throw new Error((d && d.error && d.error.message) || "Upload failed");
      if (d.files) uup(pr, d.files);
    } catch (e) {
      se("Upload: " + e.message);
      if (pr) pr.remove();
    }
    ui.value = "";
    loadFiles();
  }
  function sup(t) {
    var e = document.createElement("div");
    e.className = "upload-progress";
    e.innerHTML =
      "<h3>Uploading " +
      t +
      ' file(s)...</h3><div class="bar"><div class="bar-fill" style="width:0%"></div></div>';
    document.body.appendChild(e);
    setTimeout(function () {
      var b = e.querySelector(".bar-fill");
      if (b) {
        b.style.transition = "width 30s linear";
        b.style.width = "90%";
      }
    }, 100);
    return e;
  }
  function uup(e, files) {
    var t = files.length,
      ok = 0,
      err = 0;
    files.forEach(function (f) {
      if (f.status === "ok") ok++;
      else err++;
    });
    var p = Math.round(((ok + err) / t) * 100);
    var b = e.querySelector(".bar-fill");
    if (b) {
      b.style.transition = "width 0.3s ease";
      b.style.width = p + "%";
    }
    var h = "<h3>Uploaded " + (ok + err) + " of " + t + "</h3>";
    files.forEach(function (f) {
      var c = f.status === "ok" ? "ok" : "err";
      h +=
        '<div class="file-item"><span>' +
        (f.status === "ok" ? "✓" : "✗") +
        " " +
        eh(f.name) +
        '</span><span class="' +
        c +
        '">' +
        (f.status === "ok" ? fs(f.size || 0) : f.message || "error") +
        "</span></div>";
    });
    h +=
      '<div class="bar"><div class="bar-fill" style="width:' +
      p +
      '%"></div></div>';
    e.innerHTML = h;
    setTimeout(function () {
      e.remove();
    }, 4000);
  }

  // Modals
  var fm = $("#folder-modal"),
    fi = $("#folder-name-input");
  $("#create-folder-btn").addEventListener("click", function () {
    fm.classList.remove("hidden");
    fi.value = "";
    fi.focus();
  });
  $("#folder-cancel").addEventListener("click", function () {
    fm.classList.add("hidden");
  });
  $("#folder-confirm").addEventListener("click", async function () {
    var n = fi.value.trim();
    if (!n) return;
    try {
      await api("POST", "/api/files/folder", {
        path: state.currentPath,
        name: n,
      });
      fm.classList.add("hidden");
      he();
      loadFiles();
    } catch (e) {
      se(e.message);
    }
  });
  fi.addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#folder-confirm").click();
    if (e.key === "Escape") fm.classList.add("hidden");
  });

  var rm = $("#rename-modal"),
    ri = $("#rename-input"),
    rt = "";
  function orm(p, n) {
    rt = p;
    ri.value = n;
    rm.classList.remove("hidden");
    ri.focus();
  }
  $("#rename-cancel").addEventListener("click", function () {
    rm.classList.add("hidden");
  });
  $("#rename-confirm").addEventListener("click", async function () {
    var n = ri.value.trim();
    if (!n) return;
    try {
      await api("PATCH", "/api/files/rename", { path: rt, newName: n });
      rm.classList.add("hidden");
      he();
      loadFiles();
    } catch (e) {
      se(e.message);
    }
  });
  ri.addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#rename-confirm").click();
    if (e.key === "Escape") rm.classList.add("hidden");
  });

  var dm = $("#delete-modal"),
    dnm = $("#delete-name"),
    dt = "";
  function odm(p, n) {
    dt = p;
    dnm.textContent = n;
    dm.classList.remove("hidden");
  }
  $("#delete-cancel").addEventListener("click", function () {
    dm.classList.add("hidden");
  });
  $("#delete-confirm").addEventListener("click", async function () {
    try {
      await api("DELETE", "/api/files?path=" + encodeURIComponent(dt));
      dm.classList.add("hidden");
      he();
      if (state.listData && state.listData.items.length === 1 && state.page > 1)
        state.page--;
      loadFiles();
    } catch (e) {
      se(e.message);
    }
  });

  async function pp(p) {
    try {
      await api("POST", "/api/files/publish", { path: p });
      await loadPublished();
      rf();
      opm(p);
    } catch (e) {
      se(e.message);
    }
  }
  var pm = $("#publish-modal"),
    pui = $("#publish-url-input"),
    ppe = $("#publish-path"),
    prv = $("#publish-revoke-btn"),
    cp = "";
  function opm(p) {
    cp = p;
    ppe.textContent = p;
    var pub = isPublished(p);
    if (pub) {
      pui.value = location.origin + "/pub" + p;
      prv.classList.remove("hidden");
    } else {
      pui.value = "(not published)";
      prv.classList.add("hidden");
    }
    pm.classList.remove("hidden");
  }
  $("#publish-close").addEventListener("click", function () {
    pm.classList.add("hidden");
  });
  $("#publish-revoke-btn").addEventListener("click", async function () {
    try {
      await api("DELETE", "/api/files/publish", { path: cp });
      pm.classList.add("hidden");
      he();
      await loadPublished();
      rf();
    } catch (e) {
      se(e.message);
    }
  });
  $("#publish-copy-btn").addEventListener("click", async function () {
    var b = $("#publish-copy-btn");
    try {
      await navigator.clipboard.writeText(pui.value);
    } catch {
      pui.select();
      document.execCommand("copy");
    }
    b.textContent = "Copied!";
    setTimeout(function () {
      b.textContent = "Copy";
    }, 1500);
  });
  $("#view-toggle-btn").addEventListener("click", function () {
    state.viewMode = state.viewMode === "table" ? "grid" : "table";
    localStorage.setItem("simplecloud_view", state.viewMode);
    $(".view-icon-table").classList.toggle("hidden", state.viewMode === "grid");
    $(".view-icon-grid").classList.toggle("hidden", state.viewMode === "table");
    cs();
    hr();
    rf();
  });
  $("#refresh-btn").addEventListener("click", function () {
    loadFiles();
  });
  document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
    bd.addEventListener("click", function () {
      fm.classList.add("hidden");
      rm.classList.add("hidden");
      dm.classList.add("hidden");
      pm.classList.add("hidden");
    });
  });

  // Helpers
  function se(m) {
    eb.textContent = m;
    eb.classList.remove("hidden");
  }
  function he() {
    eb.classList.add("hidden");
  }
  function fs(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(1) + " GB";
  }
  function fd(iso) {
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
  function eh(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function ea(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Screens
  function showLogin() {
    ls.classList.remove("hidden");
    as.classList.add("hidden");
    ads.classList.add("hidden");
    ab.classList.add("hidden");
  }
  function showApp() {
    ls.classList.add("hidden");
    as.classList.remove("hidden");
    ads.classList.add("hidden");
    cu.textContent = state.user.username;
    if (state.user.role === "admin") ab.classList.remove("hidden");
    state.currentPath = "/";
    state.page = 1;
    buildBC();
    loadFiles();
  }
  function showAdmin() {
    as.classList.add("hidden");
    ads.classList.remove("hidden");
    loadAdminUsers();
  }

  // Admin button → navigate to admin screen
  ab.addEventListener("click", function () {
    showAdmin();
  });
  $("#admin-back-btn").addEventListener("click", function () {
    showApp();
  });

  // Admin self-service password change
  $("#admin-self-pw-btn").addEventListener("click", async function () {
    var op = $("#admin-self-oldpw").value;
    var np = $("#admin-self-newpw").value;
    if (!op || !np) return;
    var errEl = $("#admin-self-pw-error");
    errEl.classList.add("hidden");
    errEl.classList.remove("success");
    try {
      await api("PATCH", "/api/auth/password", {
        oldPassword: op,
        newPassword: np,
      });
      $("#admin-self-oldpw").value = "";
      $("#admin-self-newpw").value = "";
      errEl.textContent = "Password changed.";
      errEl.classList.add("success");
      errEl.classList.remove("hidden");
      setTimeout(function () {
        errEl.classList.add("hidden");
        errEl.classList.remove("success");
      }, 3000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });

  // Admin users
  async function loadAdminUsers() {
    try {
      var d = await api("GET", "/api/admin/users");
      aul.innerHTML = d.users
        .map(function (u) {
          var is = u.id === state.user.id;
          return (
            "<tr><td>" +
            eh(u.username) +
            (is ? " (you)" : "") +
            "</td>" +
            '<td><span class="admin-role-badge ' +
            u.role +
            '">' +
            u.role +
            "</span></td>" +
            '<td class="file-date">' +
            fd(u.createdAt) +
            "</td>" +
            '<td><div class="row-actions">' +
            (u.role === "admin"
              ? '<button class="btn btn-sm admin-demote-btn" data-user="' +
                ea(u.username) +
                '" ' +
                (is ? "disabled" : "") +
                ">Make User</button>"
              : '<button class="btn btn-sm admin-promote-btn" data-user="' +
                ea(u.username) +
                '">Make Admin</button>') +
            (is
              ? ""
              : ' <button class="btn btn-sm btn-danger admin-delete-btn" data-user="' +
                ea(u.username) +
                '">Del</button>') +
            ' <button class="btn btn-sm admin-resetpw-btn" data-user="' +
            ea(u.username) +
            '">Reset PW</button>' +
            "</div></td></tr>"
          );
        })
        .join("");
      aul.querySelectorAll(".admin-promote-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          adminSetRole(b.dataset.user, "admin");
        });
      });
      aul.querySelectorAll(".admin-demote-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          adminSetRole(b.dataset.user, "user");
        });
      });
      aul.querySelectorAll(".admin-delete-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          adminDeleteUser(b.dataset.user);
        });
      });
      aul.querySelectorAll(".admin-resetpw-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          adminResetPassword(b.dataset.user);
        });
      });
    } catch (err) {
      aul.innerHTML =
        '<tr><td colspan="4">Error: ' + eh(err.message) + "</td></tr>";
    }
  }
  async function adminSetRole(un, r) {
    try {
      await api("PATCH", "/api/admin/users/" + encodeURIComponent(un), {
        role: r,
      });
      loadAdminUsers();
    } catch (e) {
      se(e.message);
    }
  }
  async function adminDeleteUser(un) {
    if (!confirm('Delete user "' + un + '"?')) return;
    try {
      await api("DELETE", "/api/admin/users/" + encodeURIComponent(un));
      loadAdminUsers();
    } catch (e) {
      se(e.message);
    }
  }
  async function adminResetPassword(un) {
    var pw = prompt("New password for " + un + " (min 4 chars):");
    if (!pw) return;
    try {
      await api(
        "PATCH",
        "/api/admin/users/" + encodeURIComponent(un) + "/password",
        { password: pw },
      );
      alert("Password reset for " + un);
    } catch (e) {
      se(e.message);
    }
  }
  $("#admin-create-btn").addEventListener("click", async function () {
    var un = $("#admin-username").value.trim(),
      pw = $("#admin-password").value,
      r = $("#admin-role").value;
    if (!un || !pw) return;
    ace.classList.add("hidden");
    try {
      await api("POST", "/api/admin/users", {
        username: un,
        password: pw,
        role: r,
      });
      $("#admin-username").value = "";
      $("#admin-password").value = "";
      loadAdminUsers();
    } catch (e) {
      ace.textContent = e.message;
      ace.classList.remove("hidden");
    }
  });

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
