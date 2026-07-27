import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('页面提供可编辑并持久化的 API 地址', () => {
  assert.match(html, /id="apiUrl"/);
  assert.match(html, /oninput="onApiUrlInput\(\)"/);
  assert.match(html, /const LS_API_URL\s*=\s*'lanma_api_url'/);
});

test('模型名称可手动输入并保留常用模型建议', () => {
  assert.match(html, /id="modelInput"/);
  assert.match(html, /list="modelOptions"/);
  assert.match(html, /<datalist id="modelOptions">/);
});

test('生成与续写都使用当前 API 地址', () => {
  const configurableFetches = html.match(/fetch\(getApiUrl\(\),/g) || [];
  assert.equal(configurableFetches.length, 2);
  assert.doesNotMatch(html, /fetch\('https:\/\/vectorengine\.ai\/v1\/messages'/);
});

test('手动模型名称为空时会在请求前提示', () => {
  const modelChecks = html.match(/if \(!getModel\(\)\) \{ alert\('请先填写模型名称'\); return; \}/g) || [];
  assert.equal(modelChecks.length, 3);
});

test('首次升级时清除旧 VectorEngine 配置并切换到 ClaudeCN', () => {
  assert.match(html, /const LEGACY_VECTOR_URL\s*=\s*'https:\/\/vectorengine\.ai\/v1\/messages'/);
  assert.match(html, /const LS_API_MIGRATION\s*=\s*'lanma_api_claudecn_v1'/);
  assert.match(html, /localStorage\.removeItem\(LEGACY_APIKEY\)/);
  assert.match(html, /savedUrl\s*=\s*DEFAULT_API_URL/);
  assert.doesNotMatch(html, /apiKey\.value\s*=\s*savedKey\s*\|\|\s*legacyKey/);
});
