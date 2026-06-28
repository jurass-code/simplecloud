const http = require('http');

const BASE = 'http://localhost:3000';
var cookie = '';

function request(method, urlPath, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var url = new URL(urlPath, BASE);
    var headers = {};
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    if (cookie) headers['Cookie'] = cookie;
    if (opts.body && typeof opts.body === 'object' && !Buffer.isBuffer(opts.body))
      headers['Content-Type'] = 'application/json';

    var req = http.request(url, { method: method, headers: headers }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        var sc = res.headers['set-cookie'];
        if (sc && sc[0]) { var m = sc[0].match(/simplecloud_sid=([^;]+)/); if (m) cookie = 'simplecloud_sid=' + m[1]; }
        var body;
        try { body = JSON.parse(raw); } catch (e) { body = raw; }
        resolve({ status: res.statusCode, body: body, raw: raw });
      });
    });
    req.on('error', reject);
    if (opts.body) {
      var data = (typeof opts.body === 'object' && !Buffer.isBuffer(opts.body)) ? JSON.stringify(opts.body) : opts.body;
      req.setHeader('Content-Length', Buffer.byteLength(data));
      req.write(data);
    }
    req.end();
  });
}

async function run() {
  var passed = 0, failed = 0;
  function check(name, condition, detail) {
    if (condition) { console.log('  \x1b[32m✓\x1b[0m ' + name); passed++; }
    else { console.log('  \x1b[31m✗\x1b[0m ' + name + ' — ' + (detail !== undefined ? detail : '')); failed++; }
  }

  console.log('=== Integration Tests ===\n');
  var res;

  // 1. Health
  console.log('1. Health');
  res = await request('GET', '/api/health');
  check('ok', res.body && res.body.status === 'ok', JSON.stringify(res.body));

  // 2. Auth required
  console.log('\n2. Auth required');
  res = await request('GET', '/api/files?path=/');
  check('401', res.status === 401);
  check('UNAUTHORIZED', res.body && res.body.error && res.body.error.code === 'UNAUTHORIZED');

  // 3. Login
  console.log('\n3. Login');
  res = await request('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } });
  check('200', res.status === 200);
  check('user object', res.body && res.body.user && res.body.user.username === 'admin');
  check('sets cookie', !!cookie);

  // 4. Me
  console.log('\n4. Me');
  res = await request('GET', '/api/auth/me');
  check('returns user', res.body && res.body.user && res.body.user.id === 'admin');

  // 5. List files
  console.log('\n5. List files');
  res = await request('GET', '/api/files?path=/');
  check('200', res.status === 200);
  check('has pagination', res.body && 'page' in res.body);

  // 6. Create folder
  console.log('\n6. Create folder');
  res = await request('POST', '/api/files/folder', { body: { path: '/', name: 'tf' } });
  check('201', res.status === 201);
  res = await request('GET', '/api/files?path=/');
  check('in listing', res.body && res.body.items && res.body.items.some(function (i) { return i.name === 'tf'; }));

  // 7. Path traversal
  console.log('\n7. Path traversal');
  res = await request('GET', '/api/files?path=../../../etc');
  check('403', res.status === 403);
  check('FORBIDDEN_PATH', res.body && res.body.error && res.body.error.code === 'FORBIDDEN_PATH');

  // 8. Upload
  console.log('\n8. Upload');
  var boundary = '----T1';
  var body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="files"; filename="h.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--' + boundary + '--\r\n'),
  ]);
  res = await request('POST', '/api/files/upload?path=/tf', { body: body, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  check('201', res.status === 201, JSON.stringify(res.body));

  // 9. Download
  console.log('\n9. Download');
  res = await request('GET', '/api/files/download?path=/tf/h.txt');
  check('200', res.status === 200);
  check('content', res.raw === 'hello');

  // 10. Rename
  console.log('\n10. Rename');
  res = await request('PATCH', '/api/files/rename', { body: { path: '/tf/h.txt', newName: 'w.txt' } });
  check('200', res.status === 200);

  // 11. Delete
  console.log('\n11. Delete');
  res = await request('DELETE', '/api/files?path=/tf/w.txt');
  check('ok', res.status === 200);
  res = await request('DELETE', '/api/files?path=/tf');
  check('folder ok', res.status === 200);

  // 12. Logout
  console.log('\n12. Logout');
  res = await request('POST', '/api/auth/logout');
  check('success', res.body && res.body.success === true);

  // 13. Session invalid
  console.log('\n13. Session invalid');
  cookie = '';
  res = await request('GET', '/api/files?path=/');
  check('401', res.status === 401);

  // 14. Invalid credentials
  console.log('\n14. Invalid credentials');
  res = await request('POST', '/api/auth/login', { body: { username: 'bad', password: 'wrong' } });
  check('401', res.status === 401);

  // 15. Invalid folder name
  console.log('\n15. Invalid folder name');
  res = await request('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } });
  res = await request('POST', '/api/files/folder', { body: { path: '/', name: '../bad' } });
  check('rejects ../', res.status === 400 || res.status === 403);

  // 16. Cannot delete root
  console.log('\n16. Cannot delete root');
  res = await request('DELETE', '/api/files?path=/');
  check('403', res.status === 403);

  // 17. Pagination
  console.log('\n17. Pagination');
  for (var i = 0; i < 25; i++) await request('POST', '/api/files/folder', { body: { path: '/', name: 'f' + i } });
  res = await request('GET', '/api/files?path=/&page=1&pageSize=10');
  check('page has 10', res.body && res.body.items && res.body.items.length === 10, 'got ' + (res.body && res.body.items && res.body.items.length));
  check('total>=25', res.body && res.body.total >= 25);
  res = await request('GET', '/api/files?path=/&page=1&pageSize=5');
  check('ps 5→10', res.body && res.body.pageSize === 10);
  res = await request('GET', '/api/files?path=/&page=1&pageSize=999');
  check('ps 999→200', res.body && res.body.pageSize === 200);
  for (var j = 0; j < 25; j++) await request('DELETE', '/api/files?path=/f' + j);

  // 18. Publish file
  console.log('\n18. Publish file');
  var pb = '----Pb', pbBody = Buffer.concat([
    Buffer.from('--' + pb + '\r\nContent-Disposition: form-data; name="files"; filename="pub.txt"\r\nContent-Type: text/plain\r\n\r\npub content\r\n--' + pb + '--\r\n'),
  ]);
  res = await request('POST', '/api/files/upload?path=/', { body: pbBody, headers: { 'Content-Type': 'multipart/form-data; boundary=' + pb } });
  check('up', res.status === 201);
  res = await request('POST', '/api/files/publish', { body: { path: '/pub.txt' } });
  check('pub 201', res.status === 201);
  check('url /pub/pub.txt', res.body && res.body.publicUrl === '/pub/pub.txt');
  var saved = cookie; cookie = '';
  res = await request('GET', '/pub/pub.txt');
  check('public access', res.raw === 'pub content');
  res = await request('GET', '/pub/nope');
  check('non-pub 404', res.status === 404);
  cookie = saved;
  res = await request('POST', '/api/files/publish', { body: { path: '/' } });
  check('root 403', res.status === 403);
  res = await request('DELETE', '/api/files/publish', { body: { path: '/pub.txt' } });
  check('unpub', res.body && res.body.success === true, JSON.stringify(res.body));
  cookie = ''; res = await request('GET', '/pub/pub.txt');
  check('after unpub 404', res.status === 404);
  cookie = saved;

  // 19. Publish folder
  console.log('\n19. Publish folder');
  await request('POST', '/api/files/folder', { body: { path: '/', name: 'pd' } });
  var nb = '----Nb', nbBody = Buffer.concat([
    Buffer.from('--' + nb + '\r\nContent-Disposition: form-data; name="files"; filename="n.txt"\r\nContent-Type: text/plain\r\n\r\nnested\r\n--' + nb + '--\r\n'),
  ]);
  await request('POST', '/api/files/upload?path=/pd', { body: nbBody, headers: { 'Content-Type': 'multipart/form-data; boundary=' + nb } });
  res = await request('POST', '/api/files/publish', { body: { path: '/pd' } });
  check('pub folder 201', res.status === 201);
  cookie = ''; res = await request('GET', '/pub/pd/n.txt');
  check('nested', res.raw === 'nested');
  cookie = saved;
  await request('DELETE', '/api/files/publish', { body: { path: '/pd' } });
  await request('DELETE', '/api/files?path=/pd');
  await request('DELETE', '/api/files?path=/pub.txt');

  // === ADMIN TESTS ===

  // 20. Admin — list users
  console.log('\n20. Admin — list users');
  res = await request('GET', '/api/admin/users');
  check('users array', res.body && Array.isArray(res.body.users), JSON.stringify(res.body));
  check('admin present', res.body && res.body.users && res.body.users.some(function (u) { return u.username === 'admin'; }));

  // 21. Admin — create user
  console.log('\n21. Admin — create user');
  res = await request('POST', '/api/admin/users', { body: { username: 'john', password: 'pass1234', role: 'user' } });
  check('201', res.status === 201, JSON.stringify(res.body));
  check('role user', res.body && res.body.user && res.body.user.role === 'user');

  // 22. Admin — promote/demote
  console.log('\n22. Admin — promote/demote');
  res = await request('PATCH', '/api/admin/users/john', { body: { role: 'admin' } });
  check('promote', res.body && res.body.role === 'admin', JSON.stringify(res.body));
  res = await request('PATCH', '/api/admin/users/john', { body: { role: 'user' } });
  check('demote', res.body && res.body.role === 'user', JSON.stringify(res.body));

  // 23. Admin — reset password
  console.log('\n23. Admin — reset password');
  res = await request('PATCH', '/api/admin/users/john/password', { body: { password: 'newpass99' } });
  check('reset ok', res.body && res.body.success === true, JSON.stringify(res.body));
  var adminCookie = cookie;
  res = await request('POST', '/api/auth/login', { body: { username: 'john', password: 'newpass99' } });
  check('login new pw', res.body && res.body.user && res.body.user.username === 'john', JSON.stringify(res.body));
  cookie = adminCookie;

  // 24. Self-service password change
  console.log('\n24. Self-service password change');
  // Login as john
  res = await request('POST', '/api/auth/login', { body: { username: 'john', password: 'newpass99' } });
  var johnCookie = cookie;
  res = await request('PATCH', '/api/auth/password', { body: { oldPassword: 'newpass99', newPassword: 'johnpass' } });
  check('self change ok', res.body && res.body.success === true, JSON.stringify(res.body));
  res = await request('POST', '/api/auth/login', { body: { username: 'john', password: 'johnpass' } });
  check('login after self', res.body && res.body.user && res.body.user.username === 'john', JSON.stringify(res.body));
  cookie = adminCookie;

  // 25. Cannot delete self
  console.log('\n25. Cannot delete self');
  res = await request('DELETE', '/api/admin/users/admin');
  check('delete self 400', res.status === 400, 'got ' + res.status + ': ' + JSON.stringify(res.body));

  // 26. Cannot demote self
  console.log('\n26. Cannot demote self');
  res = await request('PATCH', '/api/admin/users/admin', { body: { role: 'user' } });
  check('demote self 400', res.status === 400, 'got ' + res.status + ': ' + JSON.stringify(res.body));

  // 27. Non-admin blocked
  console.log('\n27. Non-admin blocked');
  cookie = johnCookie;
  res = await request('GET', '/api/admin/users');
  check('non-admin 403', res.status === 403, 'got ' + res.status + ': ' + JSON.stringify(res.body));
  cookie = adminCookie;

  // 28. Delete user
  console.log('\n28. Delete user');
  res = await request('DELETE', '/api/admin/users/john');
  check('delete ok', res.body && res.body.success === true, JSON.stringify(res.body));
  res = await request('GET', '/api/admin/users');
  check('user gone', res.body && res.body.users && !res.body.users.some(function (u) { return u.username === 'john'; }));

  // === USER SANDBOX TESTS ===
  // ponytail: one runnable check per non-trivial security path — confinement + cross-user isolation.

  // 29. Create two non-admin users
  console.log('\n29. Create sandbox users');
  res = await request('POST', '/api/admin/users', { body: { username: 'alice', password: 'pass1234', role: 'user' } });
  check('alice 201', res.status === 201, JSON.stringify(res.body));
  res = await request('POST', '/api/admin/users', { body: { username: 'bob', password: 'pass1234', role: 'user' } });
  check('bob 201', res.status === 201, JSON.stringify(res.body));

  // 30. Alice uploads to her own root; bob cannot see it
  console.log('\n30. Per-user isolation');
  res = await request('POST', '/api/auth/login', { body: { username: 'alice', password: 'pass1234' } });
  check('alice login', res.body && res.body.user && res.body.user.username === 'alice', JSON.stringify(res.body));
  var aliceCookie = cookie;
  var ab = '----Ab', abBody = Buffer.concat([
    Buffer.from('--' + ab + '\r\nContent-Disposition: form-data; name="files"; filename="secret.txt"\r\nContent-Type: text/plain\r\n\r\nalice secret\r\n--' + ab + '--\r\n'),
  ]);
  res = await request('POST', '/api/files/upload?path=/', { body: abBody, headers: { 'Content-Type': 'multipart/form-data; boundary=' + ab } });
  check('alice upload 201', res.status === 201, JSON.stringify(res.body));
  res = await request('GET', '/api/files?path=/');
  check('alice sees own file', res.body && res.body.items && res.body.items.some(function (i) { return i.name === 'secret.txt'; }), JSON.stringify(res.body));

  // bob logs in, must NOT see alice's file
  res = await request('POST', '/api/auth/login', { body: { username: 'bob', password: 'pass1234' } });
  check('bob login', res.body && res.body.user && res.body.user.username === 'bob', JSON.stringify(res.body));
  var bobCookie = cookie;
  res = await request('GET', '/api/files?path=/');
  check('bob root empty of alice files', !res.body.items.some(function (i) { return i.name === 'secret.txt'; }), JSON.stringify(res.body));

  // 31. Path traversal blocked — alice cannot escape to homes/bob
  console.log('\n31. Sandbox traversal blocked');
  res = await request('GET', '/api/files?path=../../../etc');
  check('traversal 403', res.status === 403);
  res = await request('GET', '/api/files/download?path=/../bob/secret.txt');
  check('cross-user download blocked', res.status === 403 || res.status === 404, 'got ' + res.status);
  res = await request('GET', '/api/files?path=/homes/bob');
  check('homes path not leaking', res.status === 404 || res.status === 403, 'got ' + res.status);

  // 32. Alice can download her own file
  console.log('\n32. Own file access works');
  cookie = aliceCookie;
  res = await request('GET', '/api/files/download?path=/secret.txt');
  check('alice downloads own', res.status === 200 && res.raw === 'alice secret', 'got ' + res.status + ': ' + res.raw);

  // 33. Admin still sees everything (homes folder visible)
  console.log('\n33. Admin sees all');
  cookie = adminCookie;
  res = await request('GET', '/api/files?path=/homes/alice');
  check('admin sees alice home', res.status === 200 && res.body.items.some(function (i) { return i.name === 'secret.txt'; }), JSON.stringify(res.body));

  // cleanup sandbox users + their homes
  cookie = adminCookie;
  await request('DELETE', '/api/files?path=/homes/alice');
  await request('DELETE', '/api/files?path=/homes/bob');
  await request('DELETE', '/api/admin/users/alice');
  await request('DELETE', '/api/admin/users/bob');

  console.log('\n' + '='.repeat(40));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
  if (failed > 0) process.exit(1);
}

run().catch(function (err) { console.error(err); process.exit(1); });
