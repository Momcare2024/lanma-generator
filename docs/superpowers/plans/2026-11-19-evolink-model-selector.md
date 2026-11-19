# EvoLink Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文案网站默认连接 EvoLink，并让用户粘贴一个 API Key 后即可准确选择 Claude Sonnet 5.5、Opus 5.5 或 Sonnet 4.6。

**Architecture:** 保留现有可编辑 API 地址与可输入 `datalist` 模型框，只更新默认值和建议项。增加一次性的 EvoLink 配置迁移：只替换已知的 ClaudeCN/VectorEngine 地址并清除旧 Key，其他自定义地址不受影响；请求继续通过现有 `getApiUrl()` 和 `getModel()` 读取当前选择。

**Tech Stack:** 单文件 HTML/CSS/原生 JavaScript、浏览器 `localStorage`、Node.js `node:test`

---

## File Map

- Modify: `index.html` — API 配置界面、EvoLink 默认值、模型建议、旧供应商配置迁移。
- Modify: `tests/api-config.test.mjs` — 默认地址、模型选项、迁移行为和请求模型字段的回归测试。

### Task 1: 为 EvoLink 默认配置和模型选择补充失败测试

**Files:**
- Modify: `tests/api-config.test.mjs`
- Test: `tests/api-config.test.mjs`

- [ ] **Step 1: 替换旧迁移测试并增加模型请求测试**

在 `tests/api-config.test.mjs` 中保留现有通用配置测试，并加入以下断言：

```js
test('默认使用 EvoLink 和 Sonnet 5.5，并提供推荐模型选项', () => {
  assert.match(html, /value="https:\/\/direct\.evolink\.ai\/v1\/messages"/);
  assert.match(html, /value="claude-sonnet-5-5"/);
  assert.match(html, /<option value="claude-sonnet-5-5">Sonnet 5\.5 · 日常写作（推荐）<\/option>/);
  assert.match(html, /<option value="claude-opus-5-5">Opus 5\.5 · 精品文章<\/option>/);
  assert.match(html, /<option value="claude-sonnet-4-6">Sonnet 4\.6 · 旧版对照<\/option>/);
});

test('生成与续写都使用当前选择的模型', () => {
  const modelUsages = html.match(/model:\s*getModel\(\)/g) || [];
  assert.equal(modelUsages.length, 2);
});

test('首次升级时将已知旧供应商配置切换到 EvoLink', () => {
  assert.match(html, /const LEGACY_VECTOR_URL\s*=\s*'https:\/\/vectorengine\.ai\/v1\/messages'/);
  assert.match(html, /const LEGACY_CLAUDECN_URL\s*=\s*'https:\/\/claudecn\.ai\/v1\/messages'/);
  assert.match(html, /const LS_API_MIGRATION\s*=\s*'lanma_api_evolink_v1'/);
  assert.match(html, /savedUrl === LEGACY_VECTOR_URL/);
  assert.match(html, /savedUrl === LEGACY_CLAUDECN_URL/);
  assert.match(html, /localStorage\.removeItem\(LS_APIKEY\)/);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `node --test tests/api-config.test.mjs`

Expected: FAIL，原因应是页面仍使用 ClaudeCN、默认模型仍为 Sonnet 4.6，且缺少 EvoLink 迁移常量。

### Task 2: 实现 EvoLink 默认地址、推荐模型和安全迁移

**Files:**
- Modify: `index.html:644-661`
- Modify: `index.html:2012-2076`
- Test: `tests/api-config.test.mjs`

- [ ] **Step 1: 更新页面默认地址和模型建议**

将 API 配置区域更新为：

```html
<input type="url" class="api-url-input" id="apiUrl"
       value="https://direct.evolink.ai/v1/messages"
       placeholder="例如 https://direct.evolink.ai/v1/messages"
       oninput="onApiUrlInput()">
<label>API KEY</label>
<input type="password" class="api-key-input" id="apiKey"
       placeholder="粘贴 EvoLink 的 API Key"
       oninput="onApiKeyInput()">
<label>模型</label>
<input type="text" class="model-input" id="modelInput"
       list="modelOptions" value="claude-sonnet-5-5"
       placeholder="选择或输入模型名称" oninput="onModelChange()">
<datalist id="modelOptions">
  <option value="claude-sonnet-5-5">Sonnet 5.5 · 日常写作（推荐）</option>
  <option value="claude-opus-5-5">Opus 5.5 · 精品文章</option>
  <option value="claude-sonnet-4-6">Sonnet 4.6 · 旧版对照</option>
</datalist>
```

- [ ] **Step 2: 更新配置常量和一次性迁移**

使用以下常量：

```js
const DEFAULT_API_URL = 'https://direct.evolink.ai/v1/messages';
const LEGACY_VECTOR_URL = 'https://vectorengine.ai/v1/messages';
const LEGACY_CLAUDECN_URL = 'https://claudecn.ai/v1/messages';
const LEGACY_APIKEY = 'lanma_apikey_vectorengine';
const LS_API_URL = 'lanma_api_url';
const LS_APIKEY  = 'lanma_apikey';
const LS_MODEL   = 'lanma_model';
const LS_API_MIGRATION = 'lanma_api_evolink_v1';
```

在 `loadApiKey()` 的迁移分支中，仅当地址为空或属于两个已知旧供应商时切换：

```js
if (!localStorage.getItem(LS_API_MIGRATION)) {
  localStorage.removeItem(LEGACY_APIKEY);
  if (!savedUrl || savedUrl === LEGACY_VECTOR_URL || savedUrl === LEGACY_CLAUDECN_URL) {
    savedUrl = DEFAULT_API_URL;
    savedKey = '';
    localStorage.setItem(LS_API_URL, savedUrl);
    localStorage.removeItem(LS_APIKEY);
  }
  localStorage.setItem(LS_API_MIGRATION, '1');
}
```

其余自定义地址、Key 持久化和已保存模型逻辑保持不变。

- [ ] **Step 3: 运行配置测试并确认全部通过**

Run: `node --test tests/api-config.test.mjs`

Expected: 所有配置测试 PASS，0 failures。

- [ ] **Step 4: 运行完整测试套件**

Run: `node --test tests/*.test.mjs`

Expected: 全部测试 PASS，0 failures。

- [ ] **Step 5: 检查改动范围并提交**

Run:

```bash
git diff --check
git diff -- index.html tests/api-config.test.mjs
git status --short
```

Expected: 没有空白错误，只修改 `index.html` 和 `tests/api-config.test.mjs`；用户现有的 `.DS_Store` 不纳入提交。

Commit:

```bash
git add index.html tests/api-config.test.mjs
git commit -m "Add EvoLink Claude model selector"
```

### Task 3: 浏览器烟雾验证

**Files:**
- Verify: `index.html`

- [ ] **Step 1: 启动本地静态服务器**

Run: `python3 -m http.server 8765`

Expected: `http://localhost:8765/` 可访问。

- [ ] **Step 2: 检查页面配置体验**

在无旧本地配置的浏览器环境中确认：

1. API 地址为 `https://direct.evolink.ai/v1/messages`。
2. API Key 初始为空，可粘贴并显示“已记住”。
3. 模型默认是 `claude-sonnet-5-5`。
4. 模型建议中可选择 Sonnet 5.5、Opus 5.5 和 Sonnet 4.6。
5. API 地址仍可手动编辑。

- [ ] **Step 3: 最终验证**

Run:

```bash
node --test tests/*.test.mjs
git status --short
```

Expected: 所有测试 PASS；工作区只保留用户原有的未跟踪 `.DS_Store`。
