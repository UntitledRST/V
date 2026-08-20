// 메일 알림 구독을 만들고, 보고, 지웁니다.
//   GET    /api/subscribe?email=a@b.com   → 그 주소의 구독 목록
//   POST   /api/subscribe                 → { email, time, names[], kinds[] }
//   DELETE /api/subscribe?id=...          → 해당 구독 삭제

import { getJSON, setJSON, KEYS, hasKV } from '../lib/store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default async function handler(req, res) {
  const subs = (await getJSON(KEYS.subscriptions, [])) || [];

  if (req.method === 'GET') {
    const email = String(req.query.email || '').trim().toLowerCase();
    const list = email ? subs.filter((s) => s.email === email) : subs.map(({ email: _e, ...rest }) => rest);
    return res.status(200).json({ ok: true, persistent: hasKV, subscriptions: list });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const time = String(body.time || '').trim();
    const names = (Array.isArray(body.names) ? body.names : [])
      .map((n) => String(n).trim())
      .filter(Boolean)
      .slice(0, 200);
    const kinds = (Array.isArray(body.kinds) ? body.kinds : ['annual', 'half'])
      .map((k) => String(k))
      .filter((k) => ['annual', 'half', 'field', 'remote', 'etc'].includes(k));

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: '메일 주소 형식을 확인해 주세요.' });
    }
    if (!TIME_RE.test(time)) {
      return res.status(400).json({ ok: false, error: '시간은 HH:MM 형식으로 넣어 주세요.' });
    }

    const next = subs.filter((s) => !(s.email === email && s.time === time));
    const record = {
      id: `${email}|${time}`,
      email,
      time,
      names,
      kinds: kinds.length ? kinds : ['annual', 'half'],
      weekdaysOnly: body.weekdaysOnly !== false,
      createdAt: new Date().toISOString(),
    };
    next.push(record);
    await setJSON(KEYS.subscriptions, next);
    return res.status(200).json({ ok: true, persistent: hasKV, subscription: record });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    const next = subs.filter((s) => s.id !== id);
    await setJSON(KEYS.subscriptions, next);
    return res.status(200).json({ ok: true, removed: subs.length - next.length });
  }

  res.status(405).json({ ok: false, error: '지원하지 않는 방식입니다.' });
}
