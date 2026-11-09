import * as D from '../domain.js';
import {ApiError, requireThat, business} from './errors.js';
import {fields, cleanProfile, applyCommand} from './rules.js';

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export class D1Repository {
  constructor(db) { this.db = db; }
  async create(profile) {
    const state = D.emptyState();
    business(() => { state.profile = cleanProfile(profile); D.validate(state); });
    const edit = randomToken(), view = randomToken();
    const [editHash, viewHash] = await Promise.all([hashToken(edit), hashToken(view)]);
    await this.db.prepare('INSERT INTO rooms (id,state,edit_hash,view_hash) VALUES (?,?,?,?)')
      .bind(D.id(), JSON.stringify(state), editHash, viewHash).run();
    return {state, role: 'edit', tokens: {edit, view}};
  }
  async access(raw) {
    requireThat(typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw), 401, 'リンクが無効です。');
    const hash = await hashToken(raw);
    const row = await this.db.prepare('SELECT id,state,edit_hash,view_hash FROM rooms WHERE edit_hash=? OR view_hash=?')
      .bind(hash, hash).first();
    requireThat(row, 401, 'リンクが無効または再発行済みです。');
    return {row, hash, role: row.edit_hash === hash ? 'edit' : 'view'};
  }
  async read(raw) {
    const {row, role} = await this.access(raw);
    return {state: JSON.parse(row.state), role};
  }
  async update(raw, body, action) {
    const {row, role} = await this.access(raw);
    requireThat(role === 'edit', 403, '閲覧用リンクでは変更できません。');
    fields(body, action === 'save' ? ['expectedRevision','profile','commands'] : action === 'record' ? ['expectedRevision','overwrite'] : action === 'remove' ? ['expectedRevision','gid'] : ['expectedRevision','kind']);
    const state = D.clone(JSON.parse(row.state));
    requireThat(Number.isInteger(body.expectedRevision) && state.revision === body.expectedRevision, 409, '別の画面で更新されています。入力を控えてから最新情報を読み込んでください。');
    let tokens;
    business(() => {
      if (action === 'save') {
        state.profile = cleanProfile(body.profile);
        requireThat(Array.isArray(body.commands) && body.commands.length <= 200, 400, '操作数が上限を超えています。一度保存してください。');
        for (const command of body.commands) applyCommand(state, command);
      } else if (action === 'record') {
        requireThat(typeof body.overwrite === 'boolean', 400, '上書き指定が不正です。');
        D.recordMeeting(state, body.overwrite);
      } else if (action === 'remove') D.removeAchieved(state, body.gid);
      else if (action === 'rotate') {
        requireThat(['edit','view','both'].includes(body.kind), 400, '再発行対象が不正です。');
        tokens = {};
        if (body.kind !== 'view') tokens.edit = randomToken();
        if (body.kind !== 'edit') tokens.view = randomToken();
      } else throw new ApiError(400, '未対応の操作です。');
      state.revision++;
      D.validate(state);
    });
    const editHash = tokens?.edit ? await hashToken(tokens.edit) : row.edit_hash;
    const viewHash = tokens?.view ? await hashToken(tokens.view) : row.view_hash;
    // One atomic CAS: current JSON, retained snapshots, and both token hashes change together.
    const result = await this.db.prepare('UPDATE rooms SET state=?,edit_hash=?,view_hash=? WHERE id=? AND state=? AND edit_hash=? AND view_hash=?')
      .bind(JSON.stringify(state), editHash, viewHash, row.id, row.state, row.edit_hash, row.view_hash).run();
    if (result.meta.changes !== 1) {
      const access = await this.access(raw); // Rotated edit links must fail with 401, not just 409.
      requireThat(access.role === 'edit', 403, '閲覧用リンクでは変更できません。');
      throw new ApiError(409, '別の画面で更新されています。入力を控えてから最新情報を読み込んでください。');
    }
    return {state, role, tokens};
  }
}
