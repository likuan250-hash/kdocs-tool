// coverdb.test.js — SteamGridDB 兜底封面源（无 key 时不阻塞）
const test = require("node:test");
const assert = require("node:assert");
const { searchCoverByGameName, SGDB_AVAILABLE } = require("../lib/coverdb");

test("无 API key 时 SGDB_AVAILABLE 为 false", () => {
  assert.strictEqual(SGDB_AVAILABLE, false);
});

test("无 key 时 searchCoverByGameName 返回 null 且不抛错", async () => {
  const r = await searchCoverByGameName("双影奇境");
  assert.strictEqual(r, null);
});

test("searchCoverByGameName 是异步函数", () => {
  assert.strictEqual(typeof searchCoverByGameName, "function");
  assert.ok(searchCoverByGameName("x") instanceof Promise);
});
