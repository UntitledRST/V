// 사내 세션이 필요한 Cube 를 Vercel 에서 직접 호출하기 어려울 때,
// 사내 PC 에서 돌린 collector 스크립트가 이 엔드포인트로 결과를 올립니다.
//   POST /api/ingest   { items: [...] }  또는  { raw: <Cube 원본 응답> }
//   Authorization: Bearer $INGEST_TOKEN

import { normalize } from '../lib/cube.js';
import { setJSON, KEYS, hasKV } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST 만 받습니다.' });
  }

  const token = process.env.INGEST_TOKEN;
  const sent = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || sent !== token) {
    return res.status(401).json({ ok: false, error: '토큰이 맞지 않습니다.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const items = Array.isArray(body.items) && body.items.length
    ? normalize({ list: body.items })
    : normalize(body.raw ?? body);

  if (!items.length) {
    return res.status(400).json({
      ok: false,
      error: '해석할 수 있는 행이 없습니다. lib/cube.js 의 FIELD 후보 키를 실제 응답에 맞게 보완하세요.',
    });
  }

  const snapshot = { items, fetchedAt: new Date().toISOString() };
  await setJSON(KEYS.snapshot, snapshot);

  res.status(200).json({
    ok: true,
    stored: items.length,
    fetchedAt: snapshot.fetchedAt,
    persistent: hasKV,
  });
}
