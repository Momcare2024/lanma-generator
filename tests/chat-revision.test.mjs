import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]+)<\/script>/)[1].replace(/\binit\(\);\s*$/, '');
const title = '高敏感孩子胆小不是坏事';
const material = '用于测试的素材';
const draft = title + '\n\n这是文章的开头。草稿里的独特句子甲乙丙。';
const endpoint = 'https://example.test/v1/messages';
const model = 'claude-opus-5-5';
const secret = 'mock-key';
const knowledge = 'UNIQUE_KB_SENTINEL_不要进聊天';

function hanParagraph() {
  return '孩子把细小的声音听得很响，这不是娇气，是他的神经系统还没学会把音量拧小。陪他的时候，先把家里的节奏放慢，话也说短一点。';
}

function longArticle(head = title) {
  const paras = Array.from({ length: 8 }, () => hanParagraph());
  return [head, ...paras, '所以今天先陪他待一会儿，不必急着讲道理。'].join('\n\n');
}

function stream(text) {
  const events = [
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null } },
    { type: 'message_stop' },
  ];
  const bytes = new TextEncoder().encode(events.map(event =>
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }));
}

function setup(responses = [], initial = {}) {
  const alerts = [];
  const elements = new Map();
  function element() {
    return {
      value: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      children: [],
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); return child; },
      querySelector() { return null; },
      remove() {},
    };
  }
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  getElementById('apiUrl').value = endpoint;
  getElementById('modelInput').value = model;
  getElementById('apiKey').value = secret;
  getElementById('promptTextarea').value = '正文约 2500 字，自然收尾。';
  const requests = [];
  const storage = new Map();
  const task = {
    id: 1, title, material, status: 'done', result: draft, truncated: false, ...initial,
  };
  const api = runInNewContext(script + `
    courses = [{ id: 1, name: '测试课程', prompt: '', tasks: [sample] }];
    currentCourseId = 1;
    activeViewId = sample.id;
    courseDocs[1] = [{ name: '课程资料.docx', size: 12, content: knowledge }];
    ({
      send: () => sendChat(),
      extract: (text, current) => extractRevision(text, current || sample),
      apply: () => applyChatRevision(),
      undo: () => undoChatRevision(),
      setMode: (mode) => setChatMode(mode),
      systemFor: (current) => buildChatSystem(current),
      threads: () => chatThreads,
      mode: () => chatMode,
      key: () => currentChatKey(),
      show: () => renderChat(),
      setGenerating: (value) => { isGenerating = value; },
    });
  `, {
    sample: task,
    knowledge,
    TextDecoder,
    document: { getElementById, createElement: element, querySelectorAll: () => [] },
    marked: { setOptions() {}, parse: text => text },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    alert: (message) => alerts.push(String(message)),
    confirm: () => true,
    fetch: async (url, init) => {
      requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      if (!responses.length) throw new Error('发出了未预期的请求');
      const next = responses.shift();
      return typeof next === 'function' ? next() : next;
    },
  });
  return { task, requests, storage, alerts, getElementById, ...api };
}

test('页面有改稿入口，并且源码里没有密钥', () => {
  assert.match(html, /id="chatBox"/);
  assert.match(html, /用这篇替换原稿/);
  assert.match(html, /恢复上一稿/);
  assert.match(html, /不带文章/);
  assert.match(html, /改当前文章/);
  assert.doesNotMatch(html, /console\.(log|debug|info|warn|error)\s*\(/);
  assert.doesNotMatch(html, /sk-ant-/);
});

test('建议不提供替换，完整修订稿才提取正文', () => {
  const page = setup();
  const advice = '可以改这两处：\n\n1. 别再用方向盘和汽油。\n\n2. 小标题不要写最熟悉的陌生人。\n\n先只改结尾就好。';
  assert.equal(page.extract(advice), '');
  assert.equal(page.extract('【修订全文】\n只改一句。\n【修订全文结束】'), '');
  const revised = longArticle();
  assert.equal(page.extract('我按你的意思重写了全文。\n【修订全文】\n' + revised + '\n【修订全文结束】'), revised);
  assert.equal(page.extract(revised), revised);
  const critique = revised + '\n\n不过我建议再看看结尾。';
  assert.equal(page.extract('先说结论。\n\n' + critique), '');
});

test('聊天复用现有地址、模型和密钥，多轮保留上下文，且不塞进资料库', async () => {
  const reply = '结尾可以换成一个具体的晚上，先别重写全文。';
  const follow = '那你按这个方向，只改最后一段。';
  const page = setup([stream(reply), stream('最后一段可以这样收。')]);
  page.getElementById('chatInput').value = '结尾和前面几篇太像了';
  await page.send();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, endpoint);
  assert.equal(page.requests[0].headers['x-api-key'], secret);
  assert.equal(page.requests[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(page.requests[0].body.model, model);
  assert.equal(page.requests[0].body.max_tokens, 12000);
  assert.equal(page.requests[0].body.stream, true);
  assert.deepEqual(page.requests[0].body.messages.map(m => m.role), ['user']);
  assert.equal(page.requests[0].body.messages[0].content, '结尾和前面几篇太像了');
  assert.equal(JSON.stringify(page.requests[0].body).includes(secret), false);
  for (const phrase of ['方向盘/汽油', '情绪镜子/阳光灿烂', '生理死机', '孩子是来渡我们的', '最熟悉的陌生人', '主动拿书', '眼神变了', '想摔东西', '不吼不叫', '约 2500 字', title, material, '草稿里的独特句子甲乙丙']) {
    assert.match(page.requests[0].body.system, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(page.requests[0].body.system.includes(knowledge), false);
  assert.equal(page.threads()[page.key()].messages[1].content, reply);
  assert.match(page.getElementById('chatStreamBody').textContent, /结尾可以换成一个具体的晚上/);
  assert.equal(page.storage.get('lanma_chat_v1').includes(secret), false);

  page.getElementById('chatInput').value = follow;
  await page.send();
  assert.equal(page.requests.length, 2);
  assert.deepEqual(page.requests[1].body.messages.map(m => m.content), ['结尾和前面几篇太像了', reply, follow]);
  assert.equal(page.requests[1].body.system.includes(knowledge), false);
});

test('不带文章时不附带正文，也不会出现替换按钮', async () => {
  const page = setup([stream('提示词里可以把比喻换成这一篇自己的场景。')]);
  page.setMode('general');
  assert.equal(page.mode(), 'general');
  const system = page.systemFor(null);
  assert.equal(system.includes('草稿里的独特句子甲乙丙'), false);
  assert.match(system, /没有附带具体文章/);
  assert.match(system, /方向盘\/汽油/);
  page.getElementById('chatInput').value = '提示词怎样写才不容易重复';
  await page.send();
  assert.equal(page.requests[0].body.system.includes('草稿里的独特句子甲乙丙'), false);
  assert.equal(page.getElementById('replaceBtn').style.display, 'none');
});

test('替换原稿前保留上一稿，撤销后可以回到原文', () => {
  const page = setup();
  const revised = longArticle('高敏感孩子胆小不是坏事');
  page.threads()[page.key()] = {
    updated: 1,
    messages: [{ role: 'assistant', content: '换好了。\n【修订全文】\n' + revised + '\n【修订全文结束】' }],
  };
  page.task.truncated = true;
  page.apply();
  assert.equal(page.task.result, revised);
  assert.equal(page.task.prevResult, draft);
  assert.equal(page.task.truncated, false);
  assert.equal(page.task.hasPrev, true);
  assert.equal(page.task.status, 'done');
  const saved = JSON.parse(page.storage.get('lanma_v3')).courses[0].tasks[0];
  assert.equal(saved.result, revised);
  assert.equal(saved.prevResult, draft);
  assert.equal(saved.hasPrev, true);
  assert.equal(page.getElementById('replaceBtn').style.display, 'none');
  assert.equal(page.getElementById('undoReplaceBtn').style.display, '');
  assert.equal(page.getElementById('undoInlineBtn').style.display, '');

  page.undo();
  assert.equal(page.task.result, draft);
  assert.equal(page.task.truncated, true);
  assert.equal(page.task.hasPrev, false);
  assert.equal(page.getElementById('undoReplaceBtn').style.display, 'none');
});

test('只有建议时不会改动原稿', () => {
  const page = setup();
  page.threads()[page.key()] = {
    updated: 1,
    messages: [{ role: 'assistant', content: '可以只改结尾，先不要整篇重写。' }],
  };
  page.show();
  page.apply();
  assert.equal(page.task.result, draft);
  assert.equal(!!page.task.hasPrev, false);
  assert.equal(page.getElementById('replaceBtn').style.display, 'none');
});

test('没填地址、密钥或模型时只提醒去现有设置，不发请求', async () => {
  const page = setup([]);
  page.getElementById('apiKey').value = '';
  page.getElementById('chatInput').value = '帮我看看结尾';
  await page.send();
  assert.equal(page.requests.length, 0);
  assert.match(page.alerts[0], /页面最上方/);
  assert.match(page.alerts[0], /不用再填第二把钥匙/);
  assert.equal(page.task.result, draft);
});

test('接口失败时保留原稿，并让原话留在输入框', async () => {
  const page = setup([new Response(JSON.stringify({ error: { message: '余额不足' } }), { status: 402 })]);
  page.getElementById('chatInput').value = '帮我换结尾';
  await page.send();
  assert.equal(page.requests.length, 1);
  assert.equal(page.task.result, draft);
  assert.equal(page.getElementById('chatInput').value, '帮我换结尾');
  assert.match(page.threads()[page.key()].messages.at(-1).content, /余额不足/);
  assert.equal(page.getElementById('replaceBtn').style.display, 'none');
});

test('文章生成过程中不能插话', async () => {
  const page = setup([]);
  page.setGenerating(true);
  page.getElementById('chatInput').value = '现在能改吗';
  await page.send();
  assert.equal(page.requests.length, 0);
  assert.match(page.alerts[0], /正在生成/);
  assert.equal(page.task.result, draft);
});
