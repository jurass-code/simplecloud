const http = require("http");

const BASE = "http://localhost:3000";
var cookie = "";

function request(method, urlPath, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var url = new URL(urlPath, BASE);
    var headers = {};
    if (opts.headers) {
      for (var k in opts.headers) headers[k] = opts.headers[k];
    }
    if (cookie) headers["Cookie"] = cookie;
    if (
      opts.body &&
      typeof opts.body === "object" &&
      !Buffer.isBuffer(opts.body)
    ) {
      headers["Content-Type"] = "application/json";
    }

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
          resolve({ status: res.statusCode, body: body, raw: raw });
        });
      },
    );
    req.on("error", reject);

    if (opts.body) {
      var data;
      if (typeof opts.body === "object" && !Buffer.isBuffer(opts.body)) {
        data = JSON.stringify(opts.body);
      } else {
        data = opts.body;
      }
      req.setHeader("Content-Length", Buffer.byteLength(data));
      req.write(data);
    }
    req.end();
  });
}

async function run() {
  var passed = 0;
  var failed = 0;

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

  // 1. Health
  console.log("1. Health");
  var res = await request("GET", "/api/health");
  check(
    "returns ok",
    res.body && res.body.status === "ok",
    JSON.stringify(res.body),
  );

  // 2. Auth required
  console.log("\n2. Auth required");
  res = await request("GET", "/api/files?path=/");
  check("returns 401", res.status === 401, "got " + res.status);
  check(
    "UNAUTHORIZED",
    res.body && res.body.error && res.body.error.code === "UNAUTHORIZED",
    JSON.stringify(res.body),
  );

  // 3. Login
  console.log("\n3. Login");
  res = await request("POST", "/api/auth/login", {
    body: { username: "admin", password: "password" },
  });
  check("returns 200", res.status === 200, "got " + res.status);
  check(
    "user object",
    res.body && res.body.user && res.body.user.username === "admin",
    JSON.stringify(res.body),
  );
  check("sets cookie", !!cookie, "cookie: " + cookie);

  // 4. Me
  console.log("\n4. Me");
  res = await request("GET", "/api/auth/me");
  check(
    "returns user",
    res.body && res.body.user && res.body.user.id === "admin",
    JSON.stringify(res.body),
  );

  // 5. List
  console.log("\n5. List files");
  res = await request("GET", "/api/files?path=/");
  check("returns 200", res.status === 200);
  check("has pagination", res.body && "page" in res.body);

  // 6. Create folder
  console.log("\n6. Create folder");
  res = await request("POST", "/api/files/folder", {
    body: { path: "/", name: "test-folder" },
  });
  check("returns 201", res.status === 201);
  res = await request("GET", "/api/files?path=/");
  check(
    "folder in listing",
    res.body &&
      res.body.items &&
      res.body.items.some(function (i) {
        return i.name === "test-folder";
      }),
  );

  // 7. Path traversal
  console.log("\n7. Path traversal");
  res = await request("GET", "/api/files?path=../../../etc");
  check("returns 403", res.status === 403);
  check(
    "FORBIDDEN_PATH",
    res.body && res.body.error && res.body.error.code === "FORBIDDEN_PATH",
  );

  // 8. Upload
  console.log("\n8. Upload");
  var boundary = "----TestBoundary12345";
  var body = Buffer.concat([
    Buffer.from("--" + boundary + "\r\n"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="hello.txt"\r\n',
    ),
    Buffer.from("Content-Type: text/plain\r\n\r\n"),
    Buffer.from("hello simplecloud"),
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  res = await request("POST", "/api/files/upload?path=/test-folder", {
    body: body,
    headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
  });
  check("returns 201", res.status === 201, JSON.stringify(res.body));

  // 9. Download
  console.log("\n9. Download");
  res = await request("GET", "/api/files/download?path=/test-folder/hello.txt");
  check("returns 200", res.status === 200);
  check("content matches", res.raw === "hello simplecloud");

  // 10. Rename
  console.log("\n10. Rename");
  res = await request("PATCH", "/api/files/rename", {
    body: { path: "/test-folder/hello.txt", newName: "world.txt" },
  });
  check("rename ok", res.status === 200, JSON.stringify(res.body));

  // 11. Delete
  console.log("\n11. Delete");
  res = await request("DELETE", "/api/files?path=/test-folder/world.txt");
  check("delete ok", res.status === 200);
  res = await request("DELETE", "/api/files?path=/test-folder");
  check("delete folder ok", res.status === 200);

  // 12. Logout
  console.log("\n12. Logout");
  res = await request("POST", "/api/auth/logout");
  check("logout success", res.body && res.body.success === true);

  // 13. Session invalid
  console.log("\n13. Session invalid");
  cookie = "";
  res = await request("GET", "/api/files?path=/");
  check("401 after logout", res.status === 401);

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
  check(
    "rejects ../",
    res.status === 400 || res.status === 403,
    JSON.stringify(res.body),
  );

  // 16. Cannot delete root
  console.log("\n16. Cannot delete root");
  res = await request("DELETE", "/api/files?path=/");
  check("403", res.status === 403);

  // 17. Pagination
  console.log("\n17. Pagination");
  for (var i = 0; i < 25; i++) {
    await request("POST", "/api/files/folder", {
      body: { path: "/", name: "f" + i },
    });
  }
  res = await request("GET", "/api/files?path=/&page=1&pageSize=10");
  check(
    "page has 10 items",
    res.body && res.body.items && res.body.items.length === 10,
    "got " + (res.body && res.body.items && res.body.items.length),
  );
  check("total >= 25", res.body && res.body.total >= 25);
  res = await request("GET", "/api/files?path=/&page=1&pageSize=5");
  check(
    "pageSize 5 clamped",
    res.body && res.body.pageSize === 10,
    "got " + (res.body && res.body.pageSize),
  );
  res = await request("GET", "/api/files?path=/&page=1&pageSize=999");
  check(
    "pageSize 999 clamped",
    res.body && res.body.pageSize === 200,
    "got " + (res.body && res.body.pageSize),
  );
  for (var j = 0; j < 25; j++) {
    await request("DELETE", "/api/files?path=/f" + j);
  }

  // 18. Publish file
  console.log("\n18. Publish file");
  var pb = "----Pb";
  var pbBody = Buffer.concat([
    Buffer.from("--" + pb + "\r\n"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="pub.txt"\r\n',
    ),
    Buffer.from("Content-Type: text/plain\r\n\r\n"),
    Buffer.from("pub content"),
    Buffer.from("\r\n--" + pb + "--\r\n"),
  ]);
  res = await request("POST", "/api/files/upload?path=/", {
    body: pbBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + pb },
  });
  check("upload for publish", res.status === 201, JSON.stringify(res.body));

  res = await request("POST", "/api/files/publish", {
    body: { path: "/pub.txt" },
  });
  check("publish 201", res.status === 201, JSON.stringify(res.body));
  check(
    "publicUrl is /pub/pub.txt",
    res.body && res.body.publicUrl === "/pub/pub.txt",
    JSON.stringify(res.body),
  );

  var savedCookie = cookie;
  cookie = "";
  res = await request("GET", "/pub/pub.txt");
  check(
    "public access ok",
    res.raw === "pub content",
    "got: " + JSON.stringify(res.raw),
  );

  res = await request("GET", "/pub/nope");
  check("non-published 404", res.status === 404);
  cookie = savedCookie;

  res = await request("POST", "/api/files/publish", { body: { path: "/" } });
  check("publish root 403", res.status === 403, JSON.stringify(res.body));

  res = await request("DELETE", "/api/files/publish", {
    body: { path: "/pub.txt" },
  });
  check(
    "unpublish success",
    res.body && res.body.success === true,
    "status=" + res.status + " body=" + JSON.stringify(res.body),
  );

  cookie = "";
  res = await request("GET", "/pub/pub.txt");
  check("after unpublish 404", res.status === 404, "got " + res.status);
  cookie = savedCookie;

  // 19. Publish folder with nested file
  console.log("\n19. Publish folder");
  await request("POST", "/api/files/folder", {
    body: { path: "/", name: "pubdir" },
  });
  var nb = "----Nb";
  var nbBody = Buffer.concat([
    Buffer.from("--" + nb + "\r\n"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="nested.txt"\r\n',
    ),
    Buffer.from("Content-Type: text/plain\r\n\r\n"),
    Buffer.from("nested"),
    Buffer.from("\r\n--" + nb + "--\r\n"),
  ]);
  await request("POST", "/api/files/upload?path=/pubdir", {
    body: nbBody,
    headers: { "Content-Type": "multipart/form-data; boundary=" + nb },
  });
  res = await request("POST", "/api/files/publish", {
    body: { path: "/pubdir" },
  });
  check("publish folder 201", res.status === 201, JSON.stringify(res.body));

  cookie = "";
  res = await request("GET", "/pub/pubdir/nested.txt");
  check("nested file accessible", res.raw === "nested", "got: " + res.raw);
  cookie = savedCookie;

  // Cleanup
  await request("DELETE", "/api/files/publish", { body: { path: "/pubdir" } });
  await request("DELETE", "/api/files?path=/pubdir");
  await request("DELETE", "/api/files?path=/pub.txt");

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
