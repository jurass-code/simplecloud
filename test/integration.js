const http = require("http");
const crypto = require("crypto");

const BASE = "http://localhost:" + (process.env.PORT || "3001");
var cookie = "";

function request(method, urlPath, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var url = new URL(urlPath, BASE);
    var headers = {};
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    if (cookie) headers["Cookie"] = cookie;
    if (
      opts.body &&
      typeof opts.body === "object" &&
      !Buffer.isBuffer(opts.body)
    )
      headers["Content-Type"] = "application/json";

    var req = http.request(
      url,
      { method: method, headers: headers },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString();
          var sc = res.headers["set-cookie"];
          if (sc && sc[0]) {
            var m = sc[0].match(/simplecloud_sid=([^;]+)/);
            if (m) cookie = "simplecloud_sid=" + m[1];
          }
          var body;
          try {
            body = JSON.parse(raw);
          } catch (e) {
            body = raw;
          }
          resolve({
            status: res.statusCode,
            body: body,
            raw: raw,
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) {
      var data =
        typeof opts.body === "object" && !Buffer.isBuffer(opts.body)
          ? JSON.stringify(opts.body)
          : opts.body;
      req.setHeader("Content-Length", Buffer.byteLength(data));
      req.write(data);
    }
    req.end();
  });
}

// Random bytes restricted to printable ASCII. request() decodes response
// bodies as UTF-8, so binary payloads would come back lossy; ASCII survives the
// round trip and the slice upload still carries non-trivial random content.
function asciiRandomBytes(n) {
  var b = crypto.randomBytes(n);
  for (var i = 0; i < n; i++) b[i] = 32 + (b[i] % 95);
  return b;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function putChunk(id, offset, buf) {
  return request(
    "PUT",
    "/api/files/upload/chunk?id=" + encodeURIComponent(id) + "&offset=" + offset,
    { body: buf, headers: { "Content-Type": "application/octet-stream" } },
  );
}

async function run() {
  var passed = 0,
    failed = 0;
  function check(name, condition, detail) {
    if (condition) {
      console.log("  \x1b[32m✓\x1b[0m " + name);
      passed++;
    } else {
      console.log(
        "  \x1b[31m✗\x1b[0m " +
          name +
          " — " +
          (detail !== undefined ? detail : ""),
      );
      failed++;
    }
  }

  console.log("=== Integration Tests ===\n");
  var res;

  // 1. Health
  console.log("1. Health");
  res = await request("GET", "/api/health");
  check("ok", res.body && res.body.status === "ok", JSON.stringify(res.body));

  // 2. Auth required
  console.log("\n2. Auth required");
  res = await request("GET", "/api/files?path=/");
  check("401", res.status === 401);
  check(
    "UNAUTHORIZED",
    res.body && res.body.error && res.body.error.code === "UNAUTHORIZED",
  );

  // 3. Login
  console.log("\n3. Login");
  res = await request("POST", "/api/auth/login", {
    body: { username: "admin", password: "password" },
  });
  check("200", res.status === 200);
  check(
    "user object",
    res.body && res.body.user && res.body.user.username === "admin",
  );
  check("sets cookie", !!cookie);

  // 4. Me
  console.log("\n4. Me");
  res = await request("GET", "/api/auth/me");
  check(
    "returns user",
    res.body && res.body.user && res.body.user.id === "admin",
  );

  // 5. List files
  console.log("\n5. List files");
  res = await request("GET", "/api/files?path=/");
  check("200", res.status === 200);
  check("has pagination", res.body && "page" in res.body);

  // 6. Create folder
  console.log("\n6. Create folder");
  res = await request("POST", "/api/files/folder", {
    body: { path: "/", name: "tf" },
  });
  check("201", res.status === 201);
  res = await request("GET", "/api/files?path=/");
  check(
    "in listing",
    res.body &&
      res.body.items &&
      res.body.items.some(function (i) {
        return i.name === "tf";
      }),
  );

  // 7. Path traversal
  console.log("\n7. Path traversal");
  res = await request("GET", "/api/files?path=../../../etc");
  check("403", res.status === 403);
  check(
    "FORBIDDEN_PATH",
    res.body && res.body.error && res.body.error.code === "FORBIDDEN_PATH",
  );

  // 8. Upload
  console.log("\n8. Upload");
  var boundary = "----T1";
  var body = Buffer.concat([
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="files"; filename="h.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--' +
        boundary +
        "--\r\n",
    ),
  ]);
  res = await request("POST", "/api/files/upload?path=/tf", {
    body: body,
    headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
  });
  check("201", res.status === 201, JSON.stringify(res.body));

  // 9. Download
  console.log("\n9. Download");
  res = await request("GET", "/api/files/download?path=/tf/h.txt");
  check("200", res.status === 200);
  check("content", res.raw === "hello");

  // 10. Rename
  console.log("\n10. Rename");
  res = await request("PATCH", "/api/files/rename", {
    body: { path: "/tf/h.txt", newName: "w.txt" },
  });
  check("200", res.status === 200);

  // 11. Delete
  console.log("\n11. Delete");
  res = await request("DELETE", "/api/files?path=/tf/w.txt");
  check("ok", res.status === 200);
  res = await request("DELETE", "/api/files?path=/tf");
  check("folder ok", res.status === 200);

  // 12. Logout
  console.log("\n12. Logout");
  res = await request("POST", "/api/auth/logout");
  check("success", res.body && res.body.success === true);

  // 13. Session invalid
  console.log("\n13. Session invalid");
  cookie = "";
  res = await request("GET", "/api/files?path=/");
  check("401", res.status === 401);

  // 14. Invalid credentials
  console.log("\n14. Invalid credentials");
  res = await request("POST", "/api/auth/login", {
    body: { username: "bad", password: "wrong" },
  });
  check("401", res.status === 401);

  // 15. Invalid folder name
  console.log("\n15. Invalid folder name");
  res = await request("POST", "/api/auth/login", {
    body: { username: "admin", password: "password" },
  });
  res = await request("POST", "/api/files/folder", {
    body: { path: "/", name: "../bad" },
  });
  check("rejects ../", res.status === 400 || res.status === 403);

  // 16. Cannot delete root
  console.log("\n16. Cannot delete root");
  res = await request("DELETE", "/api/files?path=/");
  check("403", res.status === 403);

  // 17. Pagination
  console.log("\n17. Pagination");
  for (var i = 0; i < 25; i++)
    await request("POST", "/api/files/folder", {
      body: { path: "/", name: "f" + i },
    });
  res = await request("GET", "/api/files?path=/&page=1&pageSize=10");
  check(
    "page has 10",
    res.body && res.body.items && res.body.items.length === 10,
    "got " + (res.body && res.body.items && res.body.items.length),
  );
  check("total>=25", res.body && res.body.total >= 25);
  res = await request("GET", "/api/files?path=/&page=1&pageSize=5");
  check("ps 5→10", res.body && res.body.pageSize === 10);
  res = await request("GET", "/api/files?path=/&page=1&pageSize=999");
  check("ps 999→200", res.body && res.body.pageSize === 200);
  for (var j = 0; j < 25; j++)
    await request("DELETE", "/api/files?path=/f" + j);

  // 18. Publish file
  console.log("\n18. Publish file");
  var pb = "----Pb",
    pbBody = Buffer.concat([
      Buffer.from(
        "--" +
          pb +
          '\r\nContent-Disposition: form-data; name="files"; filename="pub.txt"\r\nContent-Type: text/plain\r\n\r\npub content\r\n--' +
          pb +
          "--\r\n",
      ),
    ]);
  res = await request("POST", "/api/files/upload?path=/", {
    body: pbBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + pb },
  });
  check("up", res.status === 201);
  res = await request("POST", "/api/files/publish", {
    body: { path: "/pub.txt" },
  });
  check("pub 201", res.status === 201);
  check("url /pub/pub.txt", res.body && res.body.publicUrl === "/pub/pub.txt");
  var saved = cookie;
  cookie = "";
  res = await request("GET", "/pub/pub.txt");
  check("public access", res.raw === "pub content");
  res = await request("GET", "/pub/nope");
  check("non-pub 404", res.status === 404);
  cookie = saved;
  res = await request("POST", "/api/files/publish", { body: { path: "/" } });
  check("root 403", res.status === 403);
  res = await request("DELETE", "/api/files/publish", {
    body: { path: "/pub.txt" },
  });
  check(
    "unpub",
    res.body && res.body.success === true,
    JSON.stringify(res.body),
  );
  cookie = "";
  res = await request("GET", "/pub/pub.txt");
  check("after unpub 404", res.status === 404);
  cookie = saved;

  // 19. Publish folder
  console.log("\n19. Publish folder");
  await request("POST", "/api/files/folder", {
    body: { path: "/", name: "pd" },
  });
  var nb = "----Nb",
    nbBody = Buffer.concat([
      Buffer.from(
        "--" +
          nb +
          '\r\nContent-Disposition: form-data; name="files"; filename="n.txt"\r\nContent-Type: text/plain\r\n\r\nnested\r\n--' +
          nb +
          "--\r\n",
      ),
    ]);
  await request("POST", "/api/files/upload?path=/pd", {
    body: nbBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + nb },
  });
  res = await request("POST", "/api/files/publish", { body: { path: "/pd" } });
  check("pub folder 201", res.status === 201);
  cookie = "";
  res = await request("GET", "/pub/pd/n.txt");
  check("nested", res.raw === "nested");
  cookie = saved;
  await request("DELETE", "/api/files/publish", { body: { path: "/pd" } });
  await request("DELETE", "/api/files?path=/pd");
  await request("DELETE", "/api/files?path=/pub.txt");

  // === ADMIN TESTS ===

  // 20. Admin — list users
  console.log("\n20. Admin — list users");
  res = await request("GET", "/api/admin/users");
  check(
    "users array",
    res.body && Array.isArray(res.body.users),
    JSON.stringify(res.body),
  );
  check(
    "admin present",
    res.body &&
      res.body.users &&
      res.body.users.some(function (u) {
        return u.username === "admin";
      }),
  );

  // 21. Admin — create user
  console.log("\n21. Admin — create user");
  res = await request("POST", "/api/admin/users", {
    body: { username: "john", password: "pass1234", role: "user" },
  });
  check("201", res.status === 201, JSON.stringify(res.body));
  check(
    "role user",
    res.body && res.body.user && res.body.user.role === "user",
  );

  // 22. Admin — promote/demote
  console.log("\n22. Admin — promote/demote");
  res = await request("PATCH", "/api/admin/users/john", {
    body: { role: "admin" },
  });
  check(
    "promote",
    res.body && res.body.role === "admin",
    JSON.stringify(res.body),
  );
  res = await request("PATCH", "/api/admin/users/john", {
    body: { role: "user" },
  });
  check(
    "demote",
    res.body && res.body.role === "user",
    JSON.stringify(res.body),
  );

  // 23. Admin — reset password
  console.log("\n23. Admin — reset password");
  res = await request("PATCH", "/api/admin/users/john/password", {
    body: { password: "newpass99" },
  });
  check(
    "reset ok",
    res.body && res.body.success === true,
    JSON.stringify(res.body),
  );
  var adminCookie = cookie;
  res = await request("POST", "/api/auth/login", {
    body: { username: "john", password: "newpass99" },
  });
  check(
    "login new pw",
    res.body && res.body.user && res.body.user.username === "john",
    JSON.stringify(res.body),
  );
  cookie = adminCookie;

  // 24. Self-service password change
  console.log("\n24. Self-service password change");
  // Login as john
  res = await request("POST", "/api/auth/login", {
    body: { username: "john", password: "newpass99" },
  });
  var johnCookie = cookie;
  res = await request("PATCH", "/api/auth/password", {
    body: { oldPassword: "newpass99", newPassword: "johnpass" },
  });
  check(
    "self change ok",
    res.body && res.body.success === true,
    JSON.stringify(res.body),
  );
  res = await request("POST", "/api/auth/login", {
    body: { username: "john", password: "johnpass" },
  });
  check(
    "login after self",
    res.body && res.body.user && res.body.user.username === "john",
    JSON.stringify(res.body),
  );
  cookie = adminCookie;

  // 25. Cannot delete self
  console.log("\n25. Cannot delete self");
  res = await request("DELETE", "/api/admin/users/admin");
  check(
    "delete self 400",
    res.status === 400,
    "got " + res.status + ": " + JSON.stringify(res.body),
  );

  // 26. Cannot demote self
  console.log("\n26. Cannot demote self");
  res = await request("PATCH", "/api/admin/users/admin", {
    body: { role: "user" },
  });
  check(
    "demote self 400",
    res.status === 400,
    "got " + res.status + ": " + JSON.stringify(res.body),
  );

  // 27. Non-admin blocked
  console.log("\n27. Non-admin blocked");
  cookie = johnCookie;
  res = await request("GET", "/api/admin/users");
  check(
    "non-admin 403",
    res.status === 403,
    "got " + res.status + ": " + JSON.stringify(res.body),
  );
  cookie = adminCookie;

  // 28. Delete user
  console.log("\n28. Delete user");
  res = await request("DELETE", "/api/admin/users/john");
  check(
    "delete ok",
    res.body && res.body.success === true,
    JSON.stringify(res.body),
  );
  res = await request("GET", "/api/admin/users");
  check(
    "user gone",
    res.body &&
      res.body.users &&
      !res.body.users.some(function (u) {
        return u.username === "john";
      }),
  );

  // === USER SANDBOX TESTS ===
  // ponytail: one runnable check per non-trivial security path — confinement + cross-user isolation.

  // 29. Create two non-admin users
  console.log("\n29. Create sandbox users");
  res = await request("POST", "/api/admin/users", {
    body: { username: "alice", password: "pass1234", role: "user" },
  });
  check("alice 201", res.status === 201, JSON.stringify(res.body));
  res = await request("POST", "/api/admin/users", {
    body: { username: "bob", password: "pass1234", role: "user" },
  });
  check("bob 201", res.status === 201, JSON.stringify(res.body));

  // 30. Alice uploads to her own root; bob cannot see it
  console.log("\n30. Per-user isolation");
  res = await request("POST", "/api/auth/login", {
    body: { username: "alice", password: "pass1234" },
  });
  check(
    "alice login",
    res.body && res.body.user && res.body.user.username === "alice",
    JSON.stringify(res.body),
  );
  var aliceCookie = cookie;
  var ab = "----Ab",
    abBody = Buffer.concat([
      Buffer.from(
        "--" +
          ab +
          '\r\nContent-Disposition: form-data; name="files"; filename="secret.txt"\r\nContent-Type: text/plain\r\n\r\nalice secret\r\n--' +
          ab +
          "--\r\n",
      ),
    ]);
  res = await request("POST", "/api/files/upload?path=/", {
    body: abBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + ab },
  });
  check("alice upload 201", res.status === 201, JSON.stringify(res.body));
  res = await request("GET", "/api/files?path=/");
  check(
    "alice sees own file",
    res.body &&
      res.body.items &&
      res.body.items.some(function (i) {
        return i.name === "secret.txt";
      }),
    JSON.stringify(res.body),
  );

  // bob logs in, must NOT see alice's file
  res = await request("POST", "/api/auth/login", {
    body: { username: "bob", password: "pass1234" },
  });
  check(
    "bob login",
    res.body && res.body.user && res.body.user.username === "bob",
    JSON.stringify(res.body),
  );
  var bobCookie = cookie;
  res = await request("GET", "/api/files?path=/");
  check(
    "bob root empty of alice files",
    !res.body.items.some(function (i) {
      return i.name === "secret.txt";
    }),
    JSON.stringify(res.body),
  );

  // 31. Path traversal blocked — alice cannot escape to homes/bob
  console.log("\n31. Sandbox traversal blocked");
  res = await request("GET", "/api/files?path=../../../etc");
  check("traversal 403", res.status === 403);
  res = await request("GET", "/api/files/download?path=/../bob/secret.txt");
  check(
    "cross-user download blocked",
    res.status === 403 || res.status === 404,
    "got " + res.status,
  );
  res = await request("GET", "/api/files?path=/homes/bob");
  check(
    "homes path not leaking",
    res.status === 404 || res.status === 403,
    "got " + res.status,
  );

  // 32. Alice can download her own file
  console.log("\n32. Own file access works");
  cookie = aliceCookie;
  res = await request("GET", "/api/files/download?path=/secret.txt");
  check(
    "alice downloads own",
    res.status === 200 && res.raw === "alice secret",
    "got " + res.status + ": " + res.raw,
  );

  // 33. Admin still sees everything (homes folder visible)
  console.log("\n33. Admin sees all");
  cookie = adminCookie;
  res = await request("GET", "/api/files?path=/homes/alice");
  check(
    "admin sees alice home",
    res.status === 200 &&
      res.body.items.some(function (i) {
        return i.name === "secret.txt";
      }),
    JSON.stringify(res.body),
  );

  // 34. Client-facing upload limits
  console.log("\n34. Upload limits endpoint");
  res = await request("GET", "/api/config");
  check(
    "maxUploadBytes exposed",
    res.body && res.body.maxUploadBytes > 0,
    JSON.stringify(res.body),
  );
  check(
    "maxFilesPerUpload exposed",
    res.body && res.body.maxFilesPerUpload === 50,
    JSON.stringify(res.body),
  );

  // 35. Inline media endpoint (preview) with byte ranges for video scrubbing
  console.log("\n35. Inline media endpoint");
  var pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  await request("DELETE", "/api/files?path=/media"); // keep the suite re-runnable
  await request("POST", "/api/files/folder", { body: { path: "/", name: "media" } });
  var mediaBoundary = "----T35";
  var mediaBody = Buffer.concat([
    Buffer.from(
      "--" + mediaBoundary +
        '\r\nContent-Disposition: form-data; name="files"; filename="pic.png"\r\nContent-Type: image/png\r\n\r\n',
    ),
    pngBytes,
    Buffer.from(
      "\r\n--" + mediaBoundary +
        '\r\nContent-Disposition: form-data; name="files"; filename="page.html"\r\nContent-Type: text/html\r\n\r\n' +
        "<script>alert(1)</script>\r\n--" + mediaBoundary + "--\r\n",
    ),
  ]);
  res = await request("POST", "/api/files/upload?path=/media", {
    body: mediaBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + mediaBoundary },
  });
  check("uploaded", res.status === 201, JSON.stringify(res.body));

  res = await request("GET", "/api/files/raw?path=/media/pic.png");
  check(
    "png served inline",
    res.status === 200 && res.headers["content-type"] === "image/png",
    res.status + " " + res.headers["content-type"],
  );
  check("accept-ranges", res.headers["accept-ranges"] === "bytes");
  check("nosniff", res.headers["x-content-type-options"] === "nosniff");

  res = await request("GET", "/api/files/raw?path=/media/pic.png", {
    headers: { Range: "bytes=0-9" },
  });
  check(
    "206 partial content",
    res.status === 206 && /^bytes 0-9\//.test(res.headers["content-range"] || ""),
    res.status + " " + res.headers["content-range"],
  );
  check(
    "partial length",
    res.headers["content-length"] === "10",
    res.headers["content-length"],
  );

  res = await request("GET", "/api/files/raw?path=/media/pic.png", {
    headers: { Range: "bytes=99999-" },
  });
  check("416 unsatisfiable", res.status === 416, "got " + res.status);

  res = await request("GET", "/api/files/raw?path=/media/page.html");
  check(
    "html never served inline",
    res.headers["content-type"] === "application/octet-stream" &&
      /attachment/.test(res.headers["content-disposition"] || ""),
    res.headers["content-type"] + " " + res.headers["content-disposition"],
  );

  // 36. UTF-8 file names survive the multipart round trip (busboy decodes the
  //     filename as latin1; the server re-encodes it back to UTF-8)
  console.log("\n36. UTF-8 file names");
  var utf8Name = "\u0421\u043d\u0438\u043c\u043e\u043a \u044d\u043a\u0440\u0430\u043d\u0430 2026-01-02.png";
  var utf8Boundary = "----T36";
  var utf8Body = Buffer.concat([
    Buffer.from(
      "--" + utf8Boundary +
        '\r\nContent-Disposition: form-data; name="files"; filename="' + utf8Name +
        '"\r\nContent-Type: image/png\r\n\r\n',
      "utf8",
    ),
    pngBytes,
    Buffer.from("\r\n--" + utf8Boundary + "--\r\n"),
  ]);
  res = await request("POST", "/api/files/upload?path=/media", {
    body: utf8Body,
    headers: { "Content-Type": "multipart/form-data; boundary=" + utf8Boundary },
  });
  check(
    "name round trip",
    res.status === 201 && res.body.files[0] && res.body.files[0].name === utf8Name,
    JSON.stringify(res.body),
  );
  res = await request("GET", "/api/files?path=/media");
  check(
    "listed with clean name",
    res.body.items.some(function (i) { return i.name === utf8Name; }),
    JSON.stringify(res.body.items.map(function (i) { return i.name; })),
  );

  // 37. More files than the per-request limit is an actionable 400, not a 500
  console.log("\n37. Upload file-count limit");
  var manyBoundary = "----T37";
  var manyParts = [];
  for (var fi = 0; fi < 51; fi++) {
    manyParts.push(
      Buffer.from(
        "--" + manyBoundary +
          '\r\nContent-Disposition: form-data; name="files"; filename="f' + fi +
          '.txt"\r\nContent-Type: text/plain\r\n\r\nx\r\n',
      ),
    );
  }
  manyParts.push(Buffer.from("--" + manyBoundary + "--\r\n"));
  res = await request("POST", "/api/files/upload?path=/media", {
    body: Buffer.concat(manyParts),
    headers: { "Content-Type": "multipart/form-data; boundary=" + manyBoundary },
  });
  check(
    "400 with limit message",
    res.status === 400 &&
      res.body.error &&
      /max 50/.test(res.body.error.message),
    res.status + " " + JSON.stringify(res.body),
  );

  await request("DELETE", "/api/files?path=/media");

  // 38. Chunked (slice) upload — the client-facing slice size
  console.log("\n38. Chunked upload config");
  res = await request("GET", "/api/config");
  check(
    "uploadChunkBytes exposed",
    res.body && res.body.uploadChunkBytes > 0,
    JSON.stringify(res.body),
  );
  check(
    "uploadChunkMb exposed",
    res.body && res.body.uploadChunkMb > 0,
    JSON.stringify(res.body),
  );
  var chunkBytes = res.body.uploadChunkBytes;
  var maxUploadBytes = res.body.maxUploadBytes;
  // Keep the suite re-runnable: drop stale sessions, start from a clean folder.
  res = await request("GET", "/api/files/upload/status");
  if (res.body && res.body.sessions)
    for (var s38 = 0; s38 < res.body.sessions.length; s38++)
      await request(
        "DELETE",
        "/api/files/upload/session?id=" + res.body.sessions[s38].uploadId,
      );
  await request("DELETE", "/api/files?path=/chunky");
  await request("POST", "/api/files/folder", { body: { path: "/", name: "chunky" } });

  // 39. Chunked upload — start, and every way it must refuse
  console.log("\n39. Chunked upload — start");
  var sliceSize = chunkBytes * 3;
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "clip.mp4", size: sliceSize },
  });
  check("200", res.status === 200, JSON.stringify(res.body));
  check("uploadId", !!(res.body && res.body.uploadId), JSON.stringify(res.body));
  check("received 0", res.body && res.body.received === 0);
  check("chunkBytes echoed", res.body && res.body.chunkBytes === chunkBytes);
  check(
    "name/size echoed",
    res.body && res.body.name === "clip.mp4" && res.body.size === sliceSize,
    JSON.stringify(res.body),
  );
  var clipId = res.body.uploadId;

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "../evil.sh", size: 1024 },
  });
  check(
    "invalid name 400 INVALID_REQUEST",
    res.status === 400 && res.body.error && res.body.error.code === "INVALID_REQUEST",
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "empty.mp4", size: 0 },
  });
  check(
    "size 0 → 400 INVALID_REQUEST",
    res.status === 400 && res.body.error && res.body.error.code === "INVALID_REQUEST",
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/no-such-dir-xyz", name: "clip.mp4", size: 1024 },
  });
  check(
    "missing folder 404 FILE_NOT_FOUND",
    res.status === 404 && res.body.error && res.body.error.code === "FILE_NOT_FOUND",
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "huge.mp4", size: maxUploadBytes + 1 },
  });
  check(
    "over server limit 413 UPLOAD_TOO_LARGE",
    res.status === 413 && res.body.error && res.body.error.code === "UPLOAD_TOO_LARGE",
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "clip.mp4", size: sliceSize },
  });
  check(
    "start again returns the same id/received",
    res.status === 200 && res.body.uploadId === clipId && res.body.received === 0,
    JSON.stringify(res.body),
  );

  // 40. Chunked upload — slice writes, offsets, and their error shapes
  console.log("\n40. Chunked upload — slice offsets");
  res = await putChunk("not-a-real-id", 0, Buffer.from("x"));
  check(
    "garbage id 404 UPLOAD_SESSION_NOT_FOUND",
    res.status === 404 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_SESSION_NOT_FOUND",
    res.status + " " + JSON.stringify(res.body),
  );
  res = await putChunk("00000000000000000000000000000000", 0, Buffer.from("x"));
  check(
    "unknown id 404 UPLOAD_SESSION_NOT_FOUND",
    res.status === 404 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_SESSION_NOT_FOUND",
    res.status + " " + JSON.stringify(res.body),
  );

  var firstSlice = asciiRandomBytes(4096);
  res = await putChunk(clipId, 0, firstSlice);
  check(
    "slice accepted, received reports the truth",
    res.status === 200 && res.body.received === 4096 && res.body.size === sliceSize,
    res.status + " " + JSON.stringify(res.body),
  );

  res = await putChunk(clipId, 0, firstSlice);
  check(
    "stale offset 409 with truthful received",
    res.status === 409 &&
      res.body.received === 4096 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_OFFSET_MISMATCH",
    res.status + " " + JSON.stringify(res.body),
  );

  res = await putChunk(clipId, 4096, asciiRandomBytes(4096));
  check(
    "retry from the server offset works",
    res.status === 200 && res.body.received === 8192,
    res.status + " " + JSON.stringify(res.body),
  );

  // A slice wider than the accepted window is refused before any bytes land.
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "oversize.mp4", size: sliceSize },
  });
  var oversizeId = res.body.uploadId;
  res = await putChunk(oversizeId, 0, Buffer.alloc(chunkBytes * 2 + 1, 65));
  check(
    "oversized slice 413 UPLOAD_TOO_LARGE",
    res.status === 413 && res.body.error && res.body.error.code === "UPLOAD_TOO_LARGE",
    res.status + " " + JSON.stringify(res.body),
  );
  await request("DELETE", "/api/files/upload/session?id=" + oversizeId);
  await request("DELETE", "/api/files/upload/session?id=" + clipId);

  // 41. Chunked upload — full transfer, finish, byte-identical download
  console.log("\n41. Chunked upload — happy path");
  var payload = asciiRandomBytes(chunkBytes * 3 + 4096);
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "video.mp4", size: payload.length },
  });
  check(
    "start",
    res.status === 200 && res.body.received === 0,
    JSON.stringify(res.body),
  );
  var videoId = res.body.uploadId;
  var offset = 0;
  while (offset < payload.length) {
    var n = Math.min(chunkBytes, payload.length - offset);
    res = await putChunk(videoId, offset, payload.slice(offset, offset + n));
    if (res.status !== 200) break;
    offset += n;
  }
  check(
    "all slices accepted",
    res.status === 200 && res.body.received === payload.length,
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/finish?id=" + videoId);
  check("finish 200", res.status === 200, res.status + " " + JSON.stringify(res.body));
  check(
    "file entry ok",
    res.body &&
      res.body.files &&
      res.body.files[0] &&
      res.body.files[0].status === "ok" &&
      res.body.files[0].name === "video.mp4" &&
      res.body.files[0].path === "/chunky/video.mp4" &&
      res.body.files[0].size === payload.length,
    JSON.stringify(res.body),
  );

  res = await request("GET", "/api/files/download?path=/chunky/video.mp4");
  check("download 200", res.status === 200, res.status + " " + res.raw.slice(0, 80));
  check(
    "download length matches",
    Number(res.headers["content-length"]) === payload.length,
    res.headers["content-length"] + " vs " + payload.length,
  );
  check(
    "downloaded bytes identical",
    sha256(Buffer.from(res.raw, "utf8")) === sha256(payload),
    "sha256 mismatch",
  );

  res = await request("GET", "/api/files/upload/status");
  check(
    "finished session gone from status",
    res.body &&
      res.body.sessions &&
      !res.body.sessions.some(function (s) {
        return s.uploadId === videoId;
      }),
    JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "partial.mp4", size: sliceSize },
  });
  var partialId = res.body.uploadId;
  await putChunk(partialId, 0, payload.slice(0, 2048));
  res = await request("POST", "/api/files/upload/finish?id=" + partialId);
  check(
    "incomplete finish 409 UPLOAD_INCOMPLETE",
    res.status === 409 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_INCOMPLETE" &&
      res.body.received === 2048 &&
      res.body.size === sliceSize,
    res.status + " " + JSON.stringify(res.body),
  );
  await request("DELETE", "/api/files/upload/session?id=" + partialId);

  // 42. Chunked upload — resume instead of restarting
  console.log("\n42. Chunked upload — resume");
  var resumePayload = asciiRandomBytes(chunkBytes * 3 + 1234);
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "resume.mp4", size: resumePayload.length },
  });
  var resumeId = res.body.uploadId;
  await putChunk(resumeId, 0, resumePayload.slice(0, chunkBytes));

  res = await request("GET", "/api/files/upload/status");
  var resumeSession = null;
  if (res.body && res.body.sessions)
    resumeSession = res.body.sessions.filter(function (s) {
      return s.uploadId === resumeId;
    })[0];
  check(
    "status lists the partial session with received",
    !!resumeSession &&
      resumeSession.received === chunkBytes &&
      resumeSession.received < resumeSession.size &&
      resumeSession.name === "resume.mp4",
    JSON.stringify(res.body),
  );

  // "Pick the same file again" must continue from the last confirmed offset.
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "resume.mp4", size: resumePayload.length },
  });
  check(
    "restart returns the same id and offset",
    res.status === 200 &&
      res.body.uploadId === resumeId &&
      res.body.received === chunkBytes,
    JSON.stringify(res.body),
  );

  offset = res.body.received;
  while (offset < resumePayload.length) {
    var rn = Math.min(chunkBytes, resumePayload.length - offset);
    res = await putChunk(resumeId, offset, resumePayload.slice(offset, offset + rn));
    if (res.status !== 200) break;
    offset += rn;
  }
  check(
    "remaining slices accepted",
    res.status === 200 && offset === resumePayload.length,
    res.status + " " + JSON.stringify(res.body),
  );

  res = await request("POST", "/api/files/upload/finish?id=" + resumeId);
  check("finish 200", res.status === 200, res.status + " " + JSON.stringify(res.body));
  res = await request("GET", "/api/files/download?path=/chunky/resume.mp4");
  check(
    "resumed content identical",
    res.status === 200 &&
      Number(res.headers["content-length"]) === resumePayload.length &&
      sha256(Buffer.from(res.raw, "utf8")) === sha256(resumePayload),
    res.status + " " + res.headers["content-length"],
  );

  // 43. Chunked upload — a name collision gets a numeric suffix
  console.log("\n43. Chunked upload — name collision");
  var clipBytes = Buffer.from("collision payload");
  var storedNames = [];
  for (var round = 0; round < 3; round++) {
    res = await request("POST", "/api/files/upload/start", {
      body: { path: "/chunky", name: "clip.txt", size: clipBytes.length },
    });
    var collisionId = res.body.uploadId;
    await putChunk(collisionId, 0, clipBytes);
    res = await request("POST", "/api/files/upload/finish?id=" + collisionId);
    storedNames.push(
      res.body && res.body.files && res.body.files[0] && res.body.files[0].name,
    );
  }
  check("first keeps the name", storedNames[0] === "clip.txt", String(storedNames[0]));
  check("second becomes (1)", storedNames[1] === "clip (1).txt", String(storedNames[1]));
  check("third becomes (2)", storedNames[2] === "clip (2).txt", String(storedNames[2]));

  // 44. Chunked upload — cancel drops the partial bytes
  console.log("\n44. Chunked upload — cancel");
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "cancel.mp4", size: sliceSize },
  });
  var cancelId = res.body.uploadId;
  await putChunk(cancelId, 0, asciiRandomBytes(2048));
  res = await request("GET", "/api/files/upload/status");
  check(
    "partial session listed before cancel",
    res.body.sessions &&
      res.body.sessions.some(function (s) {
        return s.uploadId === cancelId && s.received === 2048;
      }),
    JSON.stringify(res.body),
  );
  res = await request("DELETE", "/api/files/upload/session?id=" + cancelId);
  check(
    "cancel returns deleted:true",
    res.status === 200 && res.body && res.body.deleted === true,
    res.status + " " + JSON.stringify(res.body),
  );
  res = await request("GET", "/api/files/upload/status");
  check(
    "cancelled session no longer reported",
    res.body.sessions &&
      !res.body.sessions.some(function (s) {
        return s.uploadId === cancelId;
      }),
    JSON.stringify(res.body),
  );

  // 45. Chunked upload — a session belongs to exactly one user
  console.log("\n45. Chunked upload — cross-user isolation");
  res = await request("POST", "/api/files/upload/start", {
    body: { path: "/chunky", name: "private.mp4", size: sliceSize },
  });
  var privateId = res.body.uploadId;
  cookie = bobCookie;
  res = await putChunk(privateId, 0, Buffer.from("stolen"));
  check(
    "other user cannot write to the session",
    res.status === 404 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_SESSION_NOT_FOUND",
    res.status + " " + JSON.stringify(res.body),
  );
  res = await request("POST", "/api/files/upload/finish?id=" + privateId);
  check(
    "other user cannot finish the session",
    res.status === 404 &&
      res.body.error &&
      res.body.error.code === "UPLOAD_SESSION_NOT_FOUND",
    res.status + " " + JSON.stringify(res.body),
  );
  res = await request("GET", "/api/files/upload/status");
  check(
    "other user's status hides the session",
    res.body.sessions &&
      !res.body.sessions.some(function (s) {
        return s.uploadId === privateId;
      }),
    JSON.stringify(res.body),
  );
  cookie = adminCookie;
  res = await putChunk(privateId, 0, Buffer.from("mine"));
  check(
    "owner can still use it",
    res.status === 200 && res.body.received === 4,
    res.status + " " + JSON.stringify(res.body),
  );
  await request("DELETE", "/api/files/upload/session?id=" + privateId);
  await request("DELETE", "/api/files?path=/chunky");

  // cleanup sandbox users + their homes
  cookie = adminCookie;
  await request("DELETE", "/api/files?path=/homes/alice");
  await request("DELETE", "/api/files?path=/homes/bob");
  await request("DELETE", "/api/admin/users/alice");
  await request("DELETE", "/api/admin/users/bob");

  console.log("\n" + "=".repeat(40));
  console.log(
    "Results: " +
      passed +
      " passed, " +
      failed +
      " failed, " +
      (passed + failed) +
      " total",
  );
  if (failed > 0) process.exit(1);
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
