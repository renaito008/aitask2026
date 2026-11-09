import {D1Repository} from './d1-repository.js';
import {ApiError, requireThat} from './errors.js';
import {renderRoomHTML} from './room-html.js';

export const MAX_BODY_BYTES = 262144;
export const STATIC_FILES = new Set(['/index.html','/style.css','/app.js','/shared-app.js','/http-repository.js','/domain.js','/repository.js','/landing.html','/landing.js']);
const SECURITY = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function json(status, value) {
  return new Response(JSON.stringify(value), {status, headers: {...SECURITY, 'Content-Type':'application/json; charset=utf-8'}});
}
export async function readBody(request) {
  requireThat(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json', 415, 'JSON形式が必要です。');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new ApiError(413, '入力が大きすぎます。');
  requireThat(request.body, 400, 'JSON形式が不正です。');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, '入力が大きすぎます。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw new ApiError(400, 'JSON形式が不正です。'); }
}
// Environment notices only. Business copy, fields, styles, and interactions stay unchanged.
function environmentNotice(text, file) {
  const notice = 'D1対応版・リンク共有方式 ｜ 保存先はD1です。編集リンクは本人だけで保管してください。';
  if (file === '/shared-app.js') return text.replace(
    'ローカルサーバー検証版・架空データ専用 ｜ このPCのSQLiteへ保存。公開・別PC接続は行っていません。', notice);
  if (file === '/landing.html') return text
    .replace('ローカルサーバー検証版・架空データ専用 ｜ 公開していません。保存先はこのPCのSQLiteです。', notice)
    .replace('無料公開先・本番DBは未決定です。別PC接続は未公開・未検証です。', 'D1対応版です。公開先の設定・デプロイ・別PC接続の検証は別途行います。');
  if (file === '/room') return text.replace(
    'ローカルサーバー検証版・架空データ専用 ｜ このPCのSQLiteへ保存。公開・別PC接続は行っていません。', notice);
  return text;
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url), path = url.pathname;
      if (path.startsWith('/api/')) {
        const origin = request.headers.get('origin');
        requireThat(!origin || origin === url.origin, 403, '異なるサイトからは操作できません。');
        requireThat(request.headers.get('sec-fetch-site') !== 'cross-site', 403, '異なるサイトからは操作できません。');
        requireThat(env.DB?.prepare, 503, '保存先の設定を確認してください。');
        const repo = new D1Repository(env.DB);
        const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
        const body = request.method === 'POST' ? await readBody(request) : undefined;
        if (path === '/api/rooms' && request.method === 'POST') {
          requireThat(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => key === 'profile'), 400, '基本情報だけを指定してください。');
          return json(201, await repo.create(body.profile));
        }
        if (path === '/api/state' && request.method === 'GET') return json(200, await repo.read(token));
        const action = {'/api/save':'save','/api/record':'record','/api/remove':'remove','/api/links':'rotate'}[path];
        if (action && request.method === 'POST') return json(200, await repo.update(token, body, action));
        throw new ApiError(404, 'APIが見つかりません。');
      }
      requireThat(['GET','HEAD'].includes(request.method), 405, '許可されていない操作です。');
      const file = path === '/' ? '/landing.html' : path === '/room' || path === '/demo' ? '/index.html' : path;
      requireThat(STATIC_FILES.has(file), 404, 'ページが見つかりません。');
      requireThat(env.ASSETS?.fetch, 503, '静的ファイルの設定を確認してください。');
      const assetURL = new URL(file, url.origin);
      // Do not forward Authorization, cookies, query strings, or request bodies to assets.
      const asset = await env.ASSETS.fetch(new Request(assetURL, {method:'GET'}));
      requireThat(asset.status === 200, 404, 'ページが見つかりません。');
      let text = await asset.text();
      if (path === '/room') text = environmentNotice(renderRoomHTML(text), '/room');
      else text = environmentNotice(text, file);
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
      return new Response(request.method === 'HEAD' ? null : text, {headers: {...SECURITY, 'Content-Type':type+'; charset=utf-8'}});
    } catch (error) {
      if (error instanceof ApiError) return json(error.status, {error:error.message});
      // No SQL, state, hashes, tokens, request headers, or infrastructure traces are returned or logged.
      return json(503, {error:'一時的に処理できません。入力を保持して、時間をおいて再試行してください。'});
    }
  }
};
