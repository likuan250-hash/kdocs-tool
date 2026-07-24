// executor.test.js — 编排流程单元测试（注入 fake deps，不依赖外部 CLI）
const test = require("node:test");
const assert = require("node:assert");
const { autoExecute } = require("../lib/executor");

function baseParsed(over = {}) {
  return {
    gameName: "双影奇境", englishName: "Split Fiction",
    baiduUrl: "", quarkUrl: "", xunleiUrl: "",
    tags: ["PC游戏"], raw: "双影奇境（Split Fiction）",
    size: "", coverUrl: "",
    ...over,
  };
}

function baseDeps(over = {}) {
  let lastCreate = null;
  let downloadCoverCount = 0;
  let downloadFromUrlCount = 0;
  const deps = {
    checkKdocsReady: () => true,
    searchSteamAppId: async () => null,
    aiDescribe: () => ({ intro: "Hazelight 开发的双人合作冒险游戏。", size: "30.7G", coverUrl: "https://cdn.x.com/a.jpg" }),
    downloadCover: async () => { downloadCoverCount++; return "/fake/steam.jpg"; },
    downloadCoverFromUrl: async () => { downloadFromUrlCount++; return "/fake/cover.jpg"; },
    searchCoverByGameName: async () => null,
    fileBase64: () => "base64data",
    callMcporter: (fn, args) => {
      if (fn === "dbsheet.create_records") lastCreate = args.records[0].fields;
      return { data: { records: [{ id: "r1" }] } };
    },
    fs: { statSync: () => ({ size: 1234 }) },
    _state: () => ({ lastCreate, downloadCoverCount, downloadFromUrlCount }),
    ...over,
  };
  return deps;
}

test("kdocs 未就绪 → 提前失败", async () => {
  const deps = baseDeps({ checkKdocsReady: () => false });
  const res = await autoExecute(baseParsed(), null, "/tmp/cover", { deps });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.steps[0].status, "失败");
  assert.strictEqual(res.recordId, null);
});

test("正常流程字段映射正确", async () => {
  const deps = baseDeps();
  const res = await autoExecute(baseParsed({ quarkUrl: "https://pan.quark.cn/s/x" }), null, "/tmp/cover", { deps });
  const { lastCreate } = deps._state();
  assert.strictEqual(res.recordId, "r1");
  assert.strictEqual(lastCreate["游戏名称"], "双影奇境（Split Fiction）");
  assert.strictEqual(lastCreate["游戏介绍"], "Hazelight 开发的双人合作冒险游戏。");
  assert.strictEqual(lastCreate["游戏大小"], "30.7G");
  assert.strictEqual(lastCreate["夸克网盘"][0].address, "https://pan.quark.cn/s/x");
});

test("游戏大小优先级：ai.size > parsed.size > manualSize", async () => {
  // ai 优先
  let deps = baseDeps({ aiDescribe: () => ({ intro: "x".repeat(20), size: "10G", coverUrl: "" }) });
  let r = await autoExecute(baseParsed({ size: "5G" }), null, "/tmp", { deps, manualSize: "1G" });
  assert.strictEqual(deps._state().lastCreate["游戏大小"], "10G");

  // ai 空 → parsed 优先
  deps = baseDeps({ aiDescribe: () => ({ intro: "x".repeat(20), size: "", coverUrl: "" }) });
  r = await autoExecute(baseParsed({ size: "5G" }), null, "/tmp", { deps, manualSize: "1G" });
  assert.strictEqual(deps._state().lastCreate["游戏大小"], "5G");

  // 都空 → manual 兜底
  deps = baseDeps({ aiDescribe: () => ({ intro: "x".repeat(20), size: "", coverUrl: "" }) });
  r = await autoExecute(baseParsed({ size: "" }), null, "/tmp", { deps, manualSize: "1G" });
  assert.strictEqual(deps._state().lastCreate["游戏大小"], "1G");
});

test("含免责声明的介绍被丢弃，用原始名兜底", async () => {
  const deps = baseDeps({ aiDescribe: () => ({ intro: "该游戏经核实无真实公开资料，疑似虚构，请勿轻信。", size: "", coverUrl: "" }) });
  const res = await autoExecute(baseParsed(), null, "/tmp", { deps });
  const { lastCreate } = deps._state();
  assert.strictEqual(lastCreate["游戏介绍"], "双影奇境（Split Fiction）");
});

test("大小缺失且有网盘链接 → 步骤提示手动填写", async () => {
  const deps = baseDeps({ aiDescribe: () => ({ intro: "x".repeat(20), size: "", coverUrl: "" }) });
  const res = await autoExecute(baseParsed({ quarkUrl: "https://pan.quark.cn/s/x" }), null, "/tmp", { deps });
  const sizeStep = res.steps.find(s => s.name === "游戏大小抓取");
  assert.ok(sizeStep, "应有游戏大小抓取步骤");
  assert.strictEqual(sizeStep.status, "跳过");
  assert.ok(sizeStep.reason.includes("请手动填写"));
  assert.ok(!("游戏大小" in deps._state().lastCreate));
});

test("封面优先级：bl 推荐优先，Steam 兜底不被调用", async () => {
  const deps = baseDeps({ searchSteamAppId: async () => "12345" });
  await autoExecute(baseParsed(), "12345", "/tmp", { deps });
  const { downloadCoverCount, downloadFromUrlCount } = deps._state();
  assert.strictEqual(downloadFromUrlCount, 1, "bl 推荐封面应被下载");
  assert.strictEqual(downloadCoverCount, 0, "已有 bl 封面时不应再走 Steam 兜底");
});
