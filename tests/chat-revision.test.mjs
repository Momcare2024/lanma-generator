import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]+)<\/script>/)[1].replace(/\binit\(\);\s*$/, '');
const title = '高敏感孩子胆小不是坏事';
const draft = title + '\n\n这是原来的稿子。草稿里的独特句子甲乙丙。';
const endpoint = 'https://example.test/v1/messages';
const model = 'claude-opus-5-5';
const secret = 'mock-key';

function longText() {
  const para = '晚上家里一吵，他不是在闹，是耳朵里的声音一下子满了。你可以先把电视关上，蹲下来，用很轻的声音问他现在最吵的是哪一声。';
  return [title, ...Array.from({ length: 8 }, (_, i) => para + '这是第' + (i + 1) + '段，先陪他把这一声听完。')].join('\n\n');
}

function stream(text) {
  const events = [
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ];
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }));
}

function setup(responses = []) {
  const alerts = [];
  const elements = new Map();
  function element() {
    return {
      value: '', hidden: false, style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      remove() {},
      set textContent(value) { this._text = String(value); },
      get textContent() { return this._text || ''; },
    };
  }
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  getElementById('apiUrl').value = endpoint;
  getElementById('modelInput').value = model;
  getElementById('chatModel').value = model;
  getElementById('apiKey').value = secret;
  getElementById('promptTextarea').value = '课程提示词里有独特要求甲乙丙。';
  const requests = [];
  const task = { id: 1, title, material: '孩子捂耳朵', status: 'done', result: draft, truncated: false };
  const api = runInNewContext(script + `
    courses = [{ id: 1, name: '测试课程', prompt: '', tasks: [sample] }];
    currentCourseId = 1;
    activeViewId = sample.id;
    ({
      system: (session) => buildSessionSystem(session),
      draft: (text) => fullDraftText(text),
      pack: (session) => messagesForApi(session),
      write: (text) => writeDraftToTask(1, sample.id, text),
      undo: () => undoChatRevision(),
      request: (system, messages) => requestClaude(system, messages, () => {}),
      reminder: () => apiReminder(),
    });
  `, {
    sample: task,
    TextDecoder,
    document: { getElementById, createElement: element, querySelectorAll: () => [] },
    marked: { setOptions() {}, parse: text => '<p>' + text + '</p>' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    alert: (message) => alerts.push(String(message)),
    confirm: () => true,
    fetch: async (url, init) => {
      requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      if (!responses.length) throw new Error('发出了未预期的请求');
      const next = responses.shift();
      return typeof next === 'function' ? next() : next;
    },
  });
  return { task, requests, alerts, getElementById, ...api };
}

test('页面是独立的 Claude 对话，写文章页还在', () => {
  assert.match(html, /id="navChat"/);
  assert.match(html, /Claude 对话/);
  assert.match(html, /id="chatView"/);
  assert.match(html, /onclick="newClaudeChat\(\)"/);
  assert.match(html, /新建对话/);
  assert.match(html, /id="composerInput"/);
  assert.match(html, /id="stopBtn"/);
  assert.match(html, /停止生成/);
  assert.match(html, /id="chatModel"/);
  assert.match(html, /claude-opus-5-5/);
  assert.match(html, /claude-sonnet-5-5/);
  assert.match(html, /id="genBtn"/);
  assert.match(html, /开始生成文章/);
  assert.doesNotMatch(html, /id="chatBox"/);
  assert.doesNotMatch(html, /console\.(log|debug|info|warn|error)\s*\(/);
  assert.doesNotMatch(html, /sk-ant-/);
});

test('默认对话不带课程提示词，勾选后才带上', () => {
  const page = setup();
  const plain = page.system({});
  assert.equal(plain.includes('独特要求甲乙丙'), false);
  assert.match(plain, /自然对话/);
  const withCourse = page.system({ useCoursePrompt: true, systemNote: '句子短一点' });
  assert.match(withCourse, /独特要求甲乙丙/);
  assert.match(withCourse, /句子短一点/);
  assert.match(withCourse, /方向盘\/汽油/);
});

test('只有整篇稿子才算可以写回', () => {
  const page = setup();
  assert.equal(page.draft('可以只改结尾，先不要整篇重写。'), '');
  const article = longText();
  assert.equal(page.draft('说明一下。\n【修订全文】\n' + article + '\n【修订全文结束】'), article);
  assert.equal(page.draft(article), article);
});

test('写回文章前保留上一稿，撤销后回到原文', () => {
  const page = setup();
  const revised = longText();
  assert.equal(page.write(revised), true);
  assert.equal(page.task.result, revised);
  assert.equal(page.task.prevResult, draft);
  assert.equal(page.task.hasPrev, true);
  page.undo();
  assert.equal(page.task.result, draft);
  assert.equal(page.task.hasPrev, false);
});

test('对话请求复用已保存的地址、模型和密钥，并带上历史', async () => {
  const page = setup([stream('好的，我们先改结尾。')]);
  const messages = [
    { role: 'user', content: '结尾太像了' },
    { role: 'assistant', content: '可以换一种收法。' },
    { role: 'user', content: '那就只改最后一段' },
  ];
  const output = await page.request('你是 Claude。', messages);
  assert.equal(output.text, '好的，我们先改结尾。');
  assert.equal(page.requests[0].url, endpoint);
  assert.equal(page.requests[0].body.model, model);
  assert.equal(page.requests[0].body.stream, true);
  assert.equal(page.requests[0].body.max_tokens, 12000);
  assert.deepEqual(page.requests[0].body.messages, messages);
  assert.equal(page.requests[0].headers['x-api-key'], secret);
  assert.equal(JSON.stringify(page.requests[0].body).includes(secret), false);
});

test('接口不返回流时，改读普通 JSON', async () => {
  const page = setup([new Response(JSON.stringify({ content: [{ type: 'text', text: '普通回复' }] }), {
    headers: { 'content-type': 'application/json' },
  })]);
  const output = await page.request('你是 Claude。', [{ role: 'user', content: '你好' }]);
  assert.equal(output.text, '普通回复');
});

test('历史过长时丢掉更早的消息', () => {
  const page = setup();
  const messages = [];
  for (let i = 0; i < 6; i++) {
    messages.push({ role: 'user', text: '问' + i + '甲'.repeat(20000) });
    messages.push({ role: 'assistant', text: '答' + i + '乙'.repeat(20000) });
  }
  const packed = page.pack({ messages });
  assert.ok(packed.dropped > 0);
  assert.ok(packed.api.length < messages.length);
  assert.equal(packed.api.at(-1).content.includes('答5'), true);
});

test('没填密钥时提醒回到写文章页，不另要一把钥匙', () => {
  const page = setup();
  page.getElementById('apiKey').value = '';
  assert.match(page.reminder(), /写文章/);
  assert.match(page.reminder(), /不用再填第二把钥匙/);
});
