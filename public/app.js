(function () {
  'use strict';

  // ---- State ----
  const state = {
    user: null,
    currentPath: '/',
    page: 1,
    pageSize: 50,
    sort: 'name',
    direction: 'asc',
    listData: null,
    loading: false,
  };

  // ---- Elements ----
  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#login-screen');
  const appScreen = $('#app-screen');
  const loginForm = $('#login-form');
  const loginError = $('#login-error');
  const errorBanner = $('#error-banner');
  const fileList = $('#file-list');
  const breadcrumbs = $('#breadcrumbs');
  const loadingState = $('#loading-state');
  const emptyState = $('#empty-state');
  const pageInfo = $('#page-info');
  const prevBtn = $('#prev-page');
  const nextBtn = $('#next-page');
  const currentUser = $('#current-user');

  // ---- API helpers ----
  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body && !(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      throw new Error(msg);
    }
    return data;
  }

  // ---- Auth ----
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    loginError.classList.add('hidden');
    const btn = $('#login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const data = await api('POST', '/api/auth/login', {
        username: fd.get('username'),
        password: fd.get('password'),
      });
      state.user = data.user;
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('POST', '/api/auth/logout');
    state.user = null;
    showLogin();
  });

  // ---- Navigation ----
  function navigateTo(path) {
    state.currentPath = path;
    state.page = 1;
    loadFiles();
  }

  function buildBreadcrumbs() {
    const parts = state.currentPath.split('/').filter(Boolean);
    let html = '<a data-path="/">Home</a>';
    let acc = '';
    for (const part of parts) {
      acc += '/' + part;
      html += ` <span class="sep">/</span> `;
      html += `<a data-path="${acc}">${escapeHtml(part)}</a>`;
    }
    breadcrumbs.innerHTML = html;

    breadcrumbs.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', (e) => {
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
      const params = new URLSearchParams({
        path: state.currentPath,
        page: state.page,
        pageSize: state.pageSize,
        sort: state.sort,
        direction: state.direction,
      });
      const data = await api('GET', '/api/files?' + params.toString());
      state.listData = data;
      state.loading = false;
      renderFiles();
    } catch (err) {
      state.loading = false;
      state.listData = null;
      showError(err.message);
      renderFiles();
    }
  }

  function renderLoading() {
    fileList.innerHTML = '';
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
  }

  function renderFiles() {
    loadingState.classList.add('hidden');
    const data = state.listData;

    if (!data || data.items.length === 0) {
      fileList.innerHTML = '';
      emptyState.classList.toggle('hidden', !!state.loading);
    } else {
      emptyState.classList.add('hidden');
    }

    if (!data) return;

    fileList.innerHTML = data.items.map((item) => {
      const typeIcon = item.type === 'folder' ? '<span class="folder-icon">&#128193;</span>' : '<span>&#128196;</span>';
      const nameCell = item.type === 'folder'
        ? `<a class="file-link" data-path="${escapeAttr(item.path)}">${typeIcon} ${escapeHtml(item.name)}</a>`
        : `<a class="file-link" href="/api/files/download?path=${encodeURIComponent(item.path)}" download>${typeIcon} ${escapeHtml(item.name)}</a>`;

      return `
        <tr>
          <td>${nameCell}</td>
          <td>${item.type}</td>
          <td class="file-size">${item.type === 'folder' ? '—' : formatSize(item.size)}</td>
          <td class="file-date">${formatDate(item.modifiedAt)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm rename-btn" data-path="${escapeAttr(item.path)}" data-name="${escapeAttr(item.name)}">Rename</button>
              <button class="btn btn-sm btn-danger delete-btn" data-path="${escapeAttr(item.path)}" data-name="${escapeAttr(item.name)}">Del</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Attach folder click handlers
    fileList.querySelectorAll('a[data-path]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(a.dataset.path);
      });
    });

    // Attach action button handlers
    fileList.querySelectorAll('.rename-btn').forEach((btn) => {
      btn.addEventListener('click', () => openRenameModal(btn.dataset.path, btn.dataset.name));
    });
    fileList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.path, btn.dataset.name));
    });

    renderSortArrows();
    renderPagination();
  }

  function renderPagination() {
    const data = state.listData;
    if (!data || data.total === 0) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageInfo.textContent = '';
      return;
    }

    const totalPages = Math.ceil(data.total / data.pageSize);
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pageInfo.textContent = `Page ${state.page} of ${totalPages} (${data.total} items)`;
  }

  // ---- Sort ----
  document.querySelectorAll('.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (state.sort === field) {
        state.direction = state.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = field;
        state.direction = 'asc';
      }
      state.page = 1;
      loadFiles();
    });
  });

  function renderSortArrows() {
    document.querySelectorAll('.sort-arrow').forEach((el) => {
      el.classList.remove('asc', 'desc');
    });
    const active = document.querySelector(`th[data-sort="${state.sort}"] .sort-arrow`);
    if (active) active.classList.add(state.direction);
  }

  // ---- Pagination buttons ----
  prevBtn.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadFiles();
    }
  });
  nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil((state.listData?.total || 0) / state.pageSize);
    if (state.page < totalPages) {
      state.page++;
      loadFiles();
    }
  });

  // ---- Upload ----
  const uploadInput = $('#upload-input');
  $('#upload-btn').addEventListener('click', () => uploadInput.click());

  uploadInput.addEventListener('change', async () => {
    const files = uploadInput.files;
    if (!files.length) return;

    hideError();
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const params = new URLSearchParams({ path: state.currentPath });
        const res = await fetch('/api/files/upload?' + params.toString(), {
          method: 'POST',
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Upload failed');
      } catch (err) {
        showError('Upload: ' + err.message);
        break;
      }
    }
    uploadInput.value = '';
    loadFiles();
  });

  // ---- Create folder modal ----
  const folderModal = $('#folder-modal');
  const folderInput = $('#folder-name-input');
  $('#create-folder-btn').addEventListener('click', () => {
    folderModal.classList.remove('hidden');
    folderInput.value = '';
    folderInput.focus();
  });
  $('#folder-cancel').addEventListener('click', () => folderModal.classList.add('hidden'));
  $('#folder-confirm').addEventListener('click', async () => {
    const name = folderInput.value.trim();
    if (!name) return;
    try {
      await api('POST', '/api/files/folder', { path: state.currentPath, name });
      folderModal.classList.add('hidden');
      hideError();
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });
  folderInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#folder-confirm').click();
    if (e.key === 'Escape') folderModal.classList.add('hidden');
  });

  // ---- Rename modal ----
  const renameModal = $('#rename-modal');
  const renameInput = $('#rename-input');
  let renameTargetPath = '';

  function openRenameModal(path, name) {
    renameTargetPath = path;
    renameInput.value = name;
    renameModal.classList.remove('hidden');
    renameInput.focus();
  }

  $('#rename-cancel').addEventListener('click', () => renameModal.classList.add('hidden'));
  $('#rename-confirm').addEventListener('click', async () => {
    const newName = renameInput.value.trim();
    if (!newName) return;
    try {
      await api('PATCH', '/api/files/rename', { path: renameTargetPath, newName });
      renameModal.classList.add('hidden');
      hideError();
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#rename-confirm').click();
    if (e.key === 'Escape') renameModal.classList.add('hidden');
  });

  // ---- Delete modal ----
  const deleteModal = $('#delete-modal');
  const deleteNameEl = $('#delete-name');
  let deleteTargetPath = '';

  function openDeleteModal(path, name) {
    deleteTargetPath = path;
    deleteNameEl.textContent = name;
    deleteModal.classList.remove('hidden');
  }

  $('#delete-cancel').addEventListener('click', () => deleteModal.classList.add('hidden'));
  $('#delete-confirm').addEventListener('click', async () => {
    try {
      await api('DELETE', '/api/files?path=' + encodeURIComponent(deleteTargetPath));
      deleteModal.classList.add('hidden');
      hideError();
      // If page becomes empty, go back one page
      if (state.listData && state.listData.items.length === 1 && state.page > 1) {
        state.page--;
      }
      loadFiles();
    } catch (err) {
      showError(err.message);
    }
  });

  // ---- Refresh ----
  $('#refresh-btn').addEventListener('click', () => loadFiles());

  // ---- Error display ----
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }
  function hideError() {
    errorBanner.classList.add('hidden');
  }

  // ---- Utilities ----
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Modal backdrop click to close ----
  document.querySelectorAll('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', () => {
      folderModal.classList.add('hidden');
      renameModal.classList.add('hidden');
      deleteModal.classList.add('hidden');
    });
  });

  // ---- Screen switching ----
  function showLogin() {
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }

  async function showApp() {
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    currentUser.textContent = state.user.username;
    state.currentPath = '/';
    state.page = 1;
    buildBreadcrumbs();
    await loadFiles();
  }

  // ---- Init: check existing session ----
  (async function init() {
    try {
      const data = await api('GET', '/api/auth/me');
      state.user = data.user;
      showApp();
    } catch {
      showLogin();
    }
  })();
})();
