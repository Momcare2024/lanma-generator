import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]+)<\/script>/)[1].replace(/\binit\(\);\s*$/, '');
const title = '高敏感孩子胆小不是坏事';
const draft = title + '\n\n这是文章的开头。';
const endpoint = 'https://example.test/v1/messages';
const model = 'claude-opus-5-5';

function stream(text, reason = 'end_turn', chunkSize = Infinity) {
  const events = [
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 12 } },
    { type: 'message_stop' },
  ];
  const bytes = new TextEncoder().encode(events.map(event =>
    `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  }));
}

function setup(responses, initial = {}) {
  const element = () => ({
    value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, querySelector() { return null; }, remove() {},
  });
  const elements = new Map();
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  getElementById('apiUrl').value = endpoint;
  getElementById('modelInput').value = model;
  getElementById('apiKey').value = 'mock-key';
  getElementById('promptTextarea').value = '正文约 2500 字，自然收尾。';
  const requests = [];
  const storage = new Map();
  const task = { id: 1, title, material: '用于测试的素材', status: 'wait', result: '', ...initial };
  const { generate, continueManually } = runInNewContext(script + `
    courses = [{ id: 1, name: '测试课程', tasks: [sample] }];
    currentCourseId = 1;
    activeViewId = sample.id;
    ({ generate: () => generateOne(sample, 'mock-key', getLivePromptText()),
       continueManually: () => continueTask() });
  `, {
    sample: task, TextDecoder,
    document: { getElementById, createElement: element, querySelectorAll: () => [] },
    marked: { setOptions() {}, parse: text => text },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (url, { body }) => {
      requests.push({ url, body: JSON.parse(body) });
      if (!responses.length) throw new Error('发出了未预期的请求');
      return responses.shift();
    },
  });
  return { task, requests, storage, generate, continueManually, getElementById };
}

test('正常收尾只发一次请求，保留课程字数目标并提高接口上限', async () => {
  const page = setup([stream(draft)]);
  await page.generate();
  assert.equal(page.task.result, draft);
  assert.equal(page.task.truncated, false);
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, endpoint);
  assert.equal(page.requests[0].body.model, model);
  assert.equal(page.requests[0].body.max_tokens, 12000);
  assert.match(page.requests[0].body.system, /约 2500 字/);
});

test('网络分块不丢失跨块的 JSON 和中文', async () => {
  const page = setup([stream(draft, 'end_turn', 7)]);
  await page.generate();
  assert.equal(page.task.result, draft);
  assert.equal(page.requests.length, 1);
});

test('完整结尾被 Markdown 加粗时不额外续写', async () => {
  const result = title + '\n\n**好的文章应该自然收尾。**';
  const page = setup([stream(result)]);
  await page.generate();
  assert.equal(page.task.result, result);
  assert.equal(page.requests.length, 1);
});

test('达到 token 上限时即使结尾已有标点也自动续写', async () => {
  const page = setup([stream(draft, 'max_tokens', 11), stream('\n\n这是补上的结尾。')]);
  await page.generate();
  assert.equal(page.task.result, draft + '\n\n这是补上的结尾。');
  assert.equal(page.task.truncated, false);
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[1].url, endpoint);
  assert.equal(page.requests[1].body.model, model);
  assert.equal(page.requests[1].body.max_tokens, 12000);
  assert.equal(page.requests[1].body.messages[1].content, draft);
});

test('续写从半句话接上，仍未写完时不进行第三次请求', async () => {
  const partial = draft + '所以真';
  const page = setup([stream(partial), stream('正重要的是', 'max_tokens')]);
  await page.generate();
  assert.equal(page.task.result, partial + '正重要的是');
  assert.equal(page.task.truncated, true);
  assert.equal(page.requests.length, 2);
  assert.equal(page.getElementById('continueBtn').style.display, '');
});

test('自动续写失败时保留并保存已有正文，仍可手动续写', async () => {
  const partial = draft + '所以真';
  const page = setup([stream(partial), new Response('', { status: 429 })]);
  await page.generate();
  assert.equal(page.requests.length, 2);
  assert.equal(page.task.status, 'done');
  assert.equal(page.task.result, partial);
  assert.equal(page.task.truncated, true);
  assert.equal(page.getElementById('continueBtn').style.display, '');
  assert.equal(JSON.parse(page.storage.get('lanma_v3')).courses[0].tasks[0].result, partial);
});

test('手动续写已存的草稿，只发一次请求并接上正文', async () => {
  const partial = draft + '所以真';
  const page = setup([stream('正重要的是给孩子时间。')], {
    status: 'done', result: partial, truncated: true,
  });
  await page.continueManually();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, endpoint);
  assert.equal(page.requests[0].body.model, model);
  assert.equal(page.requests[0].body.max_tokens, 12000);
  assert.equal(page.task.result, partial + '正重要的是给孩子时间。');
  assert.equal(page.task.truncated, false);
});

test('流式连接中断时保留已收到的草稿，交给用户决定是否续写', async () => {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: draft } })}\n\n`);
  let sent = false;
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (sent) return controller.error(new Error('连接中断'));
      sent = true;
      controller.enqueue(bytes);
    },
  }));
  const page = setup([response]);
  await page.generate();
  assert.equal(page.requests.length, 1);
  assert.equal(page.task.result, draft);
  assert.equal(page.task.truncated, true);
  assert.equal(page.getElementById('continueBtn').style.display, '');
});

test('流结束但未收到结束信号时，不把句号误判为全文完成', async () => {
  const event = { type: 'content_block_delta', delta: { text: draft } };
  const page = setup([new Response(`data: ${JSON.stringify(event)}\n\n`)]);
  await page.generate();
  assert.equal(page.requests.length, 1);
  assert.equal(page.task.result, draft);
  assert.equal(page.task.truncated, true);
  assert.equal(page.getElementById('continueBtn').style.display, '');
});

test('自动续写等待期间，刷新仍能恢复已收到的草稿', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const page = setup([stream(draft, 'max_tokens'), pending]);
  const generation = page.generate();
  try {
    await new Promise(setImmediate);
    assert.equal(page.requests.length, 2);
    const saved = JSON.parse(page.storage.get('lanma_v3') ?? '{}').courses?.[0].tasks[0];
    assert.equal(saved?.result, draft);
    assert.equal(saved.status, 'done');
    assert.equal(saved.truncated, true);
  } finally {
    finish(stream('\n\n这是补上的结尾。'));
    await generation;
  }
});
