// Convite de Casamento — Cloudflare Worker (API + cron do Telegram)

const DEFAULT_SETTINGS = {
  bride: 'Ana',
  groom: 'Pedro',
  date: '2027-05-15',
  ceremony_time: '16:00',
  party_time: '18:30',
  headline: 'Com a bênção de Deus e de nossas famílias',
  message:
    'Temos a alegria de convidar você para celebrar conosco o início da nossa história como família.',
  verse: 'O cordão de três dobras não se quebra tão depressa.',
  verse_ref: 'Eclesiastes 4:12',
  ceremony_name: 'Paróquia Nossa Senhora do Carmo',
  ceremony_address: 'Praça da Matriz, 100 - Centro, Campinas - SP',
  party_name: 'Chácara Recanto das Flores',
  party_address: 'Estrada Municipal, km 5 - Zona Rural, Campinas - SP',
  ceremony_maps_url: '', // link opcional do Google Maps (pino exato)
  party_maps_url: '',
  dress_code: 'Esporte fino',
  rsvp_deadline: '2027-04-15',
  allow_changes: '1',
  cover_image: '',
  telegram_token: '',
  telegram_chat_id: '',
  telegram_notify_each: '1',
  telegram_daily: '1',
};

// Campos que nunca vão para páginas públicas
const PRIVATE_KEYS = ['telegram_token', 'telegram_chat_id', 'telegram_notify_each', 'telegram_daily'];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      // Página do convite: /c/<token>
      if (/^\/c\/[A-Za-z0-9]+\/?$/.test(path)) {
        return env.ASSETS.fetch(new Request(new URL('/convite', url), req));
      }
      if (path.startsWith('/api/')) return await api(req, env, ctx, url);
      return new Response('Não encontrado', { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ error: err.message || 'Erro interno' }, err.status || 500);
    }
  },

  async scheduled(_event, env, ctx) {
    const s = await getSettings(env);
    if (s.telegram_daily === '1') ctx.waitUntil(sendSummary(env, s));
  },
};

// ───────────────────────── Router ─────────────────────────
async function api(req, env, ctx, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  let match;

  // ── Público ──
  if (p === '/api/event' && m === 'GET') {
    return json({ event: publicSettings(await getSettings(env)) });
  }

  if ((match = p.match(/^\/api\/invite\/([A-Za-z0-9]+)$/)) && m === 'GET') {
    const invite = await getInviteByToken(env, match[1]);
    if (!invite) return json({ error: 'Convite não encontrado' }, 404);
    ctx.waitUntil(
      env.DB.prepare(
        "UPDATE invites SET open_count = open_count + 1, opened_at = COALESCE(opened_at, datetime('now')) WHERE id = ?"
      ).bind(invite.id).run()
    );
    const s = await getSettings(env);
    return json({ event: publicSettings(s), invite: publicInvite(invite), can_change: canChange(s, invite) });
  }

  if ((match = p.match(/^\/api\/invite\/([A-Za-z0-9]+)\/rsvp$/)) && m === 'POST') {
    return rsvp(req, env, ctx, match[1]);
  }

  // ── Admin ──
  if (p === '/api/admin/login' && m === 'POST') {
    const { password } = await req.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD não configurada no servidor' }, 500);
    if (!password || !(await safeEqual(password, env.ADMIN_PASSWORD))) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'Senha incorreta' }, 401);
    }
    return json({ token: await signSession(env) });
  }

  if (p.startsWith('/api/admin/')) {
    if (!(await verifySession(req, env))) return json({ error: 'Não autorizado' }, 401);
    return adminApi(req, env, p, m, url);
  }

  return json({ error: 'Rota não encontrada' }, 404);
}

async function adminApi(req, env, p, m, url) {
  let match;

  if (p === '/api/admin/data' && m === 'GET') {
    const s = await getSettings(env);
    const invites = await listInvites(env);
    return json({
      settings: { ...s, telegram_token: s.telegram_token ? maskToken(s.telegram_token) : '' },
      has_telegram_token: !!s.telegram_token,
      invites,
      stats: computeStats(invites),
      origin: url.origin,
    });
  }

  if (p === '/api/admin/settings' && m === 'PUT') {
    const body = await req.json();
    const current = await getSettings(env);
    const stmts = [];
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in body)) continue;
      let val = String(body[key] ?? '').trim();
      // token mascarado = não alterar
      if (key === 'telegram_token' && val.includes('•')) continue;
      if (val === current[key]) continue;
      stmts.push(
        env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, val)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }

  if (p === '/api/admin/invites' && m === 'POST') {
    const body = await req.json();
    const { name, phone, notes, members } = validateInvite(body);
    const token = randomToken(10);
    const res = await env.DB.prepare('INSERT INTO invites (token, name, phone, notes) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(token, name, phone, notes)
      .first();
    await env.DB.batch(
      members.map((mb, i) => env.DB.prepare('INSERT INTO members (invite_id, name, position) VALUES (?, ?, ?)').bind(res.id, mb.name, i))
    );
    return json({ ok: true, id: res.id, token });
  }

  if ((match = p.match(/^\/api\/admin\/invites\/(\d+)$/))) {
    const id = Number(match[1]);
    const exists = await env.DB.prepare('SELECT id FROM invites WHERE id = ?').bind(id).first();
    if (!exists) return json({ error: 'Convite não encontrado' }, 404);

    if (m === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM members WHERE invite_id = ?').bind(id),
        env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }

    if (m === 'PUT') {
      const { name, phone, notes, members } = validateInvite(await req.json());
      const existing = (await env.DB.prepare('SELECT id FROM members WHERE invite_id = ?').bind(id).all()).results.map((r) => r.id);
      const keep = new Set(members.filter((mb) => mb.id).map((mb) => Number(mb.id)));
      const stmts = [env.DB.prepare('UPDATE invites SET name = ?, phone = ?, notes = ? WHERE id = ?').bind(name, phone, notes, id)];
      for (const oldId of existing) if (!keep.has(oldId)) stmts.push(env.DB.prepare('DELETE FROM members WHERE id = ?').bind(oldId));
      members.forEach((mb, i) => {
        if (mb.id && existing.includes(Number(mb.id))) {
          stmts.push(env.DB.prepare('UPDATE members SET name = ?, position = ? WHERE id = ?').bind(mb.name, i, Number(mb.id)));
        } else {
          stmts.push(env.DB.prepare('INSERT INTO members (invite_id, name, position) VALUES (?, ?, ?)').bind(id, mb.name, i));
        }
      });
      await env.DB.batch(stmts);
      await refreshStatus(env, id);
      return json({ ok: true });
    }
  }

  if ((match = p.match(/^\/api\/admin\/invites\/(\d+)\/reset$/)) && m === 'POST') {
    const id = Number(match[1]);
    await env.DB.batch([
      env.DB.prepare('UPDATE members SET attending = NULL WHERE invite_id = ?').bind(id),
      env.DB.prepare("UPDATE invites SET status = 'pending', responded_at = NULL, message = NULL WHERE id = ?").bind(id),
    ]);
    return json({ ok: true });
  }

  if ((match = p.match(/^\/api\/admin\/invites\/(\d+)\/token$/)) && m === 'POST') {
    // Gera um novo link (o antigo deixa de funcionar) — útil se o link vazou
    const token = randomToken(10);
    await env.DB.prepare('UPDATE invites SET token = ? WHERE id = ?').bind(token, Number(match[1])).run();
    return json({ ok: true, token });
  }

  if (p === '/api/admin/telegram/summary' && m === 'POST') {
    const s = await getSettings(env);
    if (!s.telegram_token || !s.telegram_chat_id) return json({ error: 'Configure o token do bot e o chat ID primeiro' }, 400);
    await sendSummary(env, s);
    return json({ ok: true });
  }

  if (p === '/api/admin/telegram/detect' && m === 'POST') {
    const s = await getSettings(env);
    const body = await req.json().catch(() => ({}));
    const token = body.token && !body.token.includes('•') ? body.token.trim() : s.telegram_token;
    if (!token) return json({ error: 'Informe o token do bot' }, 400);
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await r.json();
    if (!data.ok) return json({ error: 'Token inválido: ' + (data.description || '') }, 400);
    const last = [...data.result].reverse().find((u) => (u.message || u.my_chat_member || u.channel_post)?.chat);
    const chat = last && (last.message || last.my_chat_member || last.channel_post).chat;
    if (!chat) return json({ error: 'Nenhuma conversa encontrada. Envie "oi" para o bot no Telegram e tente de novo.' }, 404);
    return json({ chat_id: String(chat.id), chat_name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username });
  }

  if (p === '/api/admin/export.csv' && m === 'GET') {
    const invites = await listInvites(env);
    const rows = [['Convite', 'Telefone', 'Pessoa', 'Resposta', 'Status do convite', 'Recado', 'Link']];
    for (const inv of invites) {
      for (const mb of inv.members) {
        rows.push([
          inv.name,
          inv.phone || '',
          mb.name,
          mb.attending === 1 ? 'Vai' : mb.attending === 0 ? 'Não vai' : 'Sem resposta',
          { pending: 'Pendente', confirmed: 'Confirmado', declined: 'Recusado' }[inv.status],
          inv.message || '',
          `${url.origin}/c/${inv.token}`,
        ]);
      }
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    return new Response(csv, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="convidados.csv"' },
    });
  }

  return json({ error: 'Rota não encontrada' }, 404);
}

// ───────────────────────── RSVP ─────────────────────────
async function rsvp(req, env, ctx, token) {
  const invite = await getInviteByToken(env, token);
  if (!invite) return json({ error: 'Convite não encontrado' }, 404);
  const s = await getSettings(env);
  if (!canChange(s, invite)) {
    return json({ error: 'As confirmações para este convite estão encerradas. Fale diretamente com os noivos.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  // Somente pessoas nomeadas no convite podem ser confirmadas — nada de acompanhantes extras
  const validIds = new Set(invite.members.map((mb) => mb.id));
  const attending = new Set((Array.isArray(body.attending) ? body.attending : []).map(Number).filter((id) => validIds.has(id)));
  const message = String(body.message || '').trim().slice(0, 600) || null;
  const status = attending.size > 0 ? 'confirmed' : 'declined';

  const stmts = invite.members.map((mb) =>
    env.DB.prepare('UPDATE members SET attending = ? WHERE id = ?').bind(attending.has(mb.id) ? 1 : 0, mb.id)
  );
  stmts.push(
    env.DB.prepare("UPDATE invites SET status = ?, message = ?, responded_at = datetime('now') WHERE id = ?").bind(status, message, invite.id)
  );
  await env.DB.batch(stmts);

  if (s.telegram_notify_each === '1' && s.telegram_token && s.telegram_chat_id) {
    const going = invite.members.filter((mb) => attending.has(mb.id)).map((mb) => mb.name);
    const notGoing = invite.members.filter((mb) => !attending.has(mb.id)).map((mb) => mb.name);
    const wasUpdate = invite.status !== 'pending';
    let text =
      (status === 'confirmed' ? '✅ <b>Presença confirmada</b>' : '❌ <b>Não poderá comparecer</b>') +
      (wasUpdate ? ' <i>(resposta alterada)</i>' : '') +
      `\n\n💌 <b>${esc(invite.name)}</b>`;
    if (going.length) text += `\n🥂 Vão (${going.length}/${invite.members.length}): ${esc(going.join(', '))}`;
    if (status === 'confirmed' && notGoing.length) text += `\n🚫 Não vão: ${esc(notGoing.join(', '))}`;
    if (message) text += `\n\n💬 “${esc(message)}”`;
    const stats = computeStats(await listInvites(env));
    text += `\n\n📊 Total confirmado: <b>${stats.people_confirmed}</b> de ${stats.people_total} pessoas`;
    ctx.waitUntil(sendTelegram(s, text).catch((e) => console.error('telegram', e)));
  }

  const updated = await getInviteByToken(env, token);
  return json({ ok: true, invite: publicInvite(updated), can_change: canChange(s, updated) });
}

function canChange(s, invite) {
  if (s.rsvp_deadline) {
    // prazo vale até o fim do dia (horário de Brasília, UTC-3)
    const end = new Date(`${s.rsvp_deadline}T23:59:59-03:00`);
    if (!isNaN(end) && Date.now() > end.getTime()) return false;
  }
  if (invite.status !== 'pending' && s.allow_changes !== '1') return false;
  return true;
}

// ───────────────────────── Telegram ─────────────────────────
async function sendTelegram(s, text) {
  const chunks = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if ((buf + '\n' + line).length > 3900) {
      chunks.push(buf);
      buf = line;
    } else buf = buf ? buf + '\n' + line : line;
  }
  if (buf) chunks.push(buf);
  for (const chunk of chunks) {
    const r = await fetch(`https://api.telegram.org/bot${s.telegram_token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text: chunk, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await r.json();
    if (!data.ok) {
      const e = new Error('Telegram: ' + (data.description || 'erro ao enviar'));
      e.status = 400;
      throw e;
    }
  }
}

async function sendSummary(env, s) {
  if (!s.telegram_token || !s.telegram_chat_id) return;
  const invites = await listInvites(env);
  const st = computeStats(invites);
  const pct = st.people_total ? Math.round((st.people_confirmed / st.people_total) * 100) : 0;

  let text = `💍 <b>Resumo — ${esc(s.bride)} &amp; ${esc(s.groom)}</b>\n`;
  const days = daysUntil(s.date);
  if (days !== null && days >= 0) text += `🗓 Faltam <b>${days}</b> dias\n`;
  text +=
    `\n✅ Confirmados: <b>${st.people_confirmed}</b> pessoas (${st.invites_confirmed} convites)` +
    `\n❌ Não vão: <b>${st.people_declined}</b> pessoas` +
    `\n⏳ Sem resposta: <b>${st.people_pending}</b> pessoas (${st.invites_pending} convites)` +
    `\n👥 Total convidado: ${st.people_total} pessoas em ${st.invites_total} convites` +
    `\n📈 Confirmação: ${pct}%\n`;

  const confirmed = invites.filter((i) => i.status === 'confirmed');
  if (confirmed.length) {
    text += `\n<b>🥂 Lista de confirmados</b>`;
    for (const inv of confirmed) {
      const going = inv.members.filter((mb) => mb.attending === 1).map((mb) => mb.name);
      text += `\n• <b>${esc(inv.name)}</b> (${going.length}/${inv.members.length}): ${esc(going.join(', '))}`;
    }
  }
  const pending = invites.filter((i) => i.status === 'pending');
  if (pending.length) {
    text += `\n\n<b>⏳ Ainda não responderam</b>\n` + pending.map((i) => `• ${esc(i.name)}${i.open_count ? ' 👀' : ''}`).join('\n');
    text += `\n<i>👀 = já abriu o convite</i>`;
  }
  await sendTelegram(s, text);
}

// ───────────────────────── Data helpers ─────────────────────────
async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of results) s[r.key] = r.value;
  return s;
}

function publicSettings(s) {
  const out = { ...s };
  for (const k of PRIVATE_KEYS) delete out[k];
  return out;
}

async function getInviteByToken(env, token) {
  const invite = await env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first();
  if (!invite) return null;
  const { results } = await env.DB.prepare('SELECT id, name, attending FROM members WHERE invite_id = ? ORDER BY position, id').bind(invite.id).all();
  invite.members = results;
  return invite;
}

function publicInvite(inv) {
  return { name: inv.name, status: inv.status, message: inv.message, responded_at: inv.responded_at, members: inv.members };
}

async function listInvites(env) {
  const [inv, mem] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM invites ORDER BY name COLLATE NOCASE'),
    env.DB.prepare('SELECT id, invite_id, name, attending FROM members ORDER BY position, id'),
  ]);
  const byInvite = new Map();
  for (const mb of mem.results) {
    if (!byInvite.has(mb.invite_id)) byInvite.set(mb.invite_id, []);
    byInvite.get(mb.invite_id).push(mb);
  }
  return inv.results.map((i) => ({ ...i, members: byInvite.get(i.id) || [] }));
}

async function refreshStatus(env, id) {
  // após editar membros, mantém o status coerente
  const inv = await env.DB.prepare('SELECT status FROM invites WHERE id = ?').bind(id).first();
  if (inv.status === 'pending') return;
  const c = await env.DB.prepare('SELECT SUM(attending = 1) AS going FROM members WHERE invite_id = ?').bind(id).first();
  await env.DB.prepare('UPDATE invites SET status = ? WHERE id = ?').bind(c.going > 0 ? 'confirmed' : 'declined', id).run();
}

function computeStats(invites) {
  const st = {
    invites_total: invites.length, invites_confirmed: 0, invites_declined: 0, invites_pending: 0,
    people_total: 0, people_confirmed: 0, people_declined: 0, people_pending: 0, invites_opened: 0,
  };
  for (const inv of invites) {
    st[`invites_${inv.status}`]++;
    if (inv.open_count > 0) st.invites_opened++;
    for (const mb of inv.members) {
      st.people_total++;
      if (inv.status === 'pending') st.people_pending++;
      else if (mb.attending === 1) st.people_confirmed++;
      else st.people_declined++;
    }
  }
  return st;
}

function validateInvite(body) {
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) throw httpError('Informe o nome do convite', 400);
  const members = (Array.isArray(body.members) ? body.members : [])
    .map((mb) => (typeof mb === 'string' ? { name: mb } : mb))
    .map((mb) => ({ id: mb.id ? Number(mb.id) : null, name: String(mb.name || '').trim().slice(0, 120) }))
    .filter((mb) => mb.name);
  if (!members.length) throw httpError('Adicione pelo menos uma pessoa ao convite', 400);
  if (members.length > 30) throw httpError('Máximo de 30 pessoas por convite', 400);
  return {
    name,
    phone: String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20) || null,
    notes: String(body.notes || '').trim().slice(0, 500) || null,
    members,
  };
}

// ───────────────────────── Auth ─────────────────────────
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]);
}

async function signSession(env) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 dias
  return `${exp}.${await hmac(env.ADMIN_PASSWORD, 'admin:' + exp)}`;
}

async function verifySession(req, env) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() || !env.ADMIN_PASSWORD) return false;
  return safeEqual(sig, await hmac(env.ADMIN_PASSWORD, 'admin:' + exp));
}

async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([hmac('cmp', a), hmac('cmp', b)]);
  let diff = ha.length ^ hb.length;
  for (let i = 0; i < Math.min(ha.length, hb.length); i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// ───────────────────────── Utils ─────────────────────────
function randomToken(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function maskToken(t) {
  return t.slice(0, 6) + '••••••••' + t.slice(-4);
}

function daysUntil(date) {
  const d = new Date(`${date}T00:00:00-03:00`);
  if (isNaN(d)) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
