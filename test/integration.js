const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
let cookie = "";

function request(method, urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const headers = { ...opts.headers };
    if (cookie) headers.Cookie = cookie;
    if (
      opts.body &&
      typeof opts.body === "object" &&
      !Buffer.isBuffer(opts.body)
    ) {
      headers["Content-Type"] = "application/json";
    }

    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const setCookie = res.headers["set-cookie"];
        if (setCookie) {
          const match = setCookie[0]?.match(/simplecloud_sid=([^;]+)/);
          if (match) cookie = `simplecloud_sid=${match[1]}`;
        }
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
        resolve({ status: res.statusCode, body, raw });
      });
    });
    req.on("error", reject);

    if (opts.body) {
      if (typeof opts.body === "object" && !Buffer.isBuffer(opts.body)) {
        req.write(JSON.stringify(opts.body));
      } else {
        req.write(opts.body);
      }
    }
    req.end();
  });
}

async function run() {
  let passed = 0;
  let failed = 0;

  function check(name, condition, detail) {
    if (condition) {
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
      passed++;
    } else {
      console.log(`  \x1b[31m✗\x1b[0m ${name} — ${detail}`);
      failed++;
    }
  }

  console.log("=== Integration Tests ===\n");

  // 1. Health
  console.log("1. Health check");
  let res = await request("GET", "/api/health");
  check(
    'returns {status:"ok"}',
    res.body?.status === "ok",
    JSON.stringify(res.body),
  );

  // 2. Unauthorized
  console.log("\n2. Auth required");
  res = await request("GET", "/api/files?path=/");
  check("returns 401", res.status === 401, `got ${res.status}`);
  check(
    "error code UNAUTHORIZED",
    res.body?.error?.code === "UNAUTHORIZED",
    JSON.stringify(res.body),
  );

  // 3. Login
  console.log("\n3. Login");
  res = await request("POST", "/api/auth/login", {
    body: { username: "admin", password: "password" },
  });
  check("returns 200", res.status === 200, `got ${res.status}`);
  check(
    "returns user object",
    res.body?.user?.username === "admin",
    JSON.stringify(res.body),
  );
  check("sets session cookie", !!cookie, `cookie: ${cookie ? "yes" : "no"}`);

  // 4. Session check
  console.log("\n4. GET /api/auth/me");
  res = await request("GET", "/api/auth/me");
  check(
    "returns current user",
    res.body?.user?.id === "admin",
    JSON.stringify(res.body),
  );

  // 5. List root
  console.log("\n5. List files");
  res = await request("GET", "/api/files?path=/");
  check("returns 200", res.status === 200, `got ${res.status}`);
  check(
    "has pagination fields",
    res.body && "page" in res.body,
    JSON.stringify(res.body),
  );

  // 6. Create folder
  console.log("\n6. Create folder");
  res = await request("POST", "/api/files/folder", {
    body: { path: "/", name: "test-folder" },
  });
  check("returns 201", res.status === 201, `got ${res.status}`);
  check(
    "folder created",
    res.body?.type === "folder",
    JSON.stringify(res.body),
  );

  // 7. List root with folder
  res = await request("GET", "/api/files?path=/");
  check(
    "contains test-folder",
    res.body?.items?.some((i) => i.name === "test-folder"),
    `items: ${res.body?.items?.length}`,
  );

  // 8. Path traversal blocked
  console.log("\n7. Path traversal");
  res = await request("GET", "/api/files?path=../../../etc");
  check("returns 403", res.status === 403, `got ${res.status}`);
  check(
    "error FORBIDDEN_PATH",
    res.body?.error?.code === "FORBIDDEN_PATH",
    JSON.stringify(res.body),
  );

  // 9. Upload file
  console.log("\n8. Upload");
  const boundary = "----TestBoundary12345";
  const fileContent = "hello simplecloud";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="hello.txt"\r\n',
    ),
    Buffer.from("Content-Type: text/plain\r\n\r\n"),
    Buffer.from(fileContent),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  res = await request("POST", "/api/files/upload?path=/test-folder", {
    body,
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  });
  check(
    "returns 201",
    res.status === 201,
    `got ${res.status}: ${JSON.stringify(res.body)}`,
  );

  // 10. List folder
  console.log("\n9. List after upload");
  res = await request("GET", "/api/files?path=/test-folder");
  check(
    "contains hello.txt",
    res.body?.items?.some((i) => i.name === "hello.txt"),
    `items: ${res.body?.items?.length}`,
  );

  // 11. Download
  console.log("\n10. Download");
  res = await request("GET", "/api/files/download?path=/test-folder/hello.txt");
  check("returns 200", res.status === 200, `got ${res.status}`);
  check(
    "file content matches",
    res.raw === "hello simplecloud",
    `got: "${res.raw}"`,
  );

  // 12. Rename
  console.log("\n11. Rename");
  res = await request("PATCH", "/api/files/rename", {
    body: { path: "/test-folder/hello.txt", newName: "world.txt" },
  });
  check(
    "rename succeeds",
    res.status === 200,
    `got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  res = await request("GET", "/api/files?path=/test-folder");
  check(
    "file renamed",
    res.body?.items?.some((i) => i.name === "world.txt"),
    `items: ${JSON.stringify(res.body?.items)}`,
  );

  // 13. Delete file
  console.log("\n12. Delete");
  res = await request("DELETE", "/api/files?path=/test-folder/world.txt");
  check("delete returns 200", res.status === 200, `got ${res.status}`);
  res = await request("GET", "/api/files?path=/test-folder");
  check(
    "folder is now empty",
    res.body?.total === 0,
    `total: ${res.body?.total}`,
  );

  // 14. Delete folder
  res = await request("DELETE", "/api/files?path=/test-folder");
  check("delete folder returns 200", res.status === 200, `got ${res.status}`);

  // 15. Logout
  console.log("\n13. Logout");
  res = await request("POST", "/api/auth/logout");
  check(
    "logout returns success",
    res.body?.success === true,
    JSON.stringify(res.body),
  );

  // 16. Session invalidated
  console.log("\n14. Session invalidated");
  cookie = "";
  res = await request("GET", "/api/files?path=/");
  check("returns 401 after logout", res.status === 401, `got ${res.status}`);

  // 17. Invalid login
  console.log("\n15. Invalid credentials");
  res = await request("POST", "/api/auth/login", {
    body: { username: "nobody", password: "wrong" },
  });
  check("returns 401", res.status === 401, `got ${res.status}`);

  // 18. Re-login and test invalid folder name
  console.log("\n16. Invalid folder name");
  res = await request("POST", "/api/auth/login", {
    body: { username: "admin", password: "password" },
  });
  res = await request("POST", "/api/files/folder", {
    body: { path: "/", name: "../escape" },
  });
  check(
    "rejects ../ name",
    res.status === 400 || res.status === 403,
    `got ${res.status}: ${JSON.stringify(res.body)}`,
  );

  // 19. Cannot delete root
  console.log("\n17. Cannot delete root");
  res = await request("DELETE", "/api/files?path=/");
  check(
    "rejects root delete",
    res.status === 403,
    `got ${res.status}: ${JSON.stringify(res.body)}`,
  );

  // 20. Pagination (plan: pageSize min 10, max 200)
  console.log("\n18. Pagination");
  for (let i = 0; i < 25; i++) {
    await request("POST", "/api/files/folder", {
      body: { path: "/", name: `folder-${i}` },
    });
  }
  res = await request("GET", "/api/files?path=/&page=1&pageSize=10");
  check(
    "page 1 has 10 items",
    res.body?.items?.length === 10,
    `got ${res.body?.items?.length}`,
  );
  check("total >= 25", res.body?.total >= 25, `total: ${res.body?.total}`);
  check(
    "pageSize is 10",
    res.body?.pageSize === 10,
    `pageSize: ${res.body?.pageSize}`,
  );
  // pageSize below minimum gets clamped
  res = await request("GET", "/api/files?path=/&page=1&pageSize=5");
  check(
    "pageSize 5 clamped to 10",
    res.body?.pageSize === 10,
    `pageSize: ${res.body?.pageSize}`,
  );
  // pageSize above maximum gets clamped
  res = await request("GET", "/api/files?path=/&page=1&pageSize=999");
  check(
    "pageSize 999 clamped to 200",
    res.body?.pageSize === 200,
    `pageSize: ${res.body?.pageSize}`,
  );

  // Cleanup
  for (let i = 0; i < 25; i++) {
    await request("DELETE", `/api/files?path=/folder-${i}`);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${passed + failed} total`,
  );
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
