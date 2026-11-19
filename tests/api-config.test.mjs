import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('页面提供可编辑并持久化的 API 地址', () => {
  assert.match(html, /id="apiUrl"/);
  assert.match(html, /oninput="onApiUrlInput\(\)"/);
  assert.match(html, /const LS_API_URL\s*=\s*'lanma_api_url'/);
});

test('模型使用真正的下拉框并始终展示全部可用选项', () => {
  assert.match(html, /<select[^>]*id="modelInput"[^>]*onchange="onModelChange\(\)"[^>]*>/);
  assert.doesNotMatch(html, /list="modelOptions"/);
  assert.doesNotMatch(html, /<datalist id="modelOptions">/);
  assert.match(html, /<\/select>/);
});

test('默认使用 EvoLink 和 Sonnet 5.5，并提供推荐模型选项', () => {
  assert.match(html, /value="https:\/\/direct\.evolink\.ai\/v1\/messages"/);
  assert.match(html, /value="claude-sonnet-5-5"/);
  assert.match(html, /<option value="claude-sonnet-5-5" selected>Sonnet 5\.5 · 日常写作（推荐）<\/option>/);
  assert.match(html, /<option value="claude-opus-5-5">Opus 5\.5 · 精品文章<\/option>/);
  assert.match(html, /<option value="claude-sonnet-4-6">Sonnet 4\.6 · 旧版对照<\/option>/);
});

test('手动模型名称为空时会在请求前提示', () => {
  const modelChecks = html.match(/if \(!getModel\(\)\) \{ alert\('请先填写模型名称'\); return; \}/g) || [];
  assert.equal(modelChecks.length, 3);
});

test('首次升级时将已知旧供应商配置切换到 EvoLink', () => {
  assert.match(html, /const LEGACY_VECTOR_URL\s*=\s*'https:\/\/vectorengine\.ai\/v1\/messages'/);
  assert.match(html, /const LEGACY_CLAUDECN_URL\s*=\s*'https:\/\/claudecn\.ai\/v1\/messages'/);
  assert.match(html, /const LS_API_MIGRATION\s*=\s*'lanma_api_evolink_v1'/);
  assert.match(html, /savedUrl === LEGACY_VECTOR_URL/);
  assert.match(html, /savedUrl === LEGACY_CLAUDECN_URL/);
  assert.match(html, /localStorage\.removeItem\(LEGACY_APIKEY\)/);
  assert.match(html, /localStorage\.removeItem\(LS_APIKEY\)/);
});

test('首次使用新下拉框时将旧 Sonnet 4.6 自动升级为 Sonnet 5.5', () => {
  assert.match(html, /const DEFAULT_MODEL\s*=\s*'claude-sonnet-5-5'/);
  assert.match(html, /const LEGACY_MODEL\s*=\s*'claude-sonnet-4-6'/);
  assert.match(html, /const LS_MODEL_MIGRATION\s*=\s*'lanma_model_select_v1'/);
  assert.match(html, /savedModel === LEGACY_MODEL/);
  assert.match(html, /localStorage\.setItem\(LS_MODEL, DEFAULT_MODEL\)/);
  assert.match(html, /localStorage\.setItem\(LS_MODEL_MIGRATION, '1'\)/);
});
