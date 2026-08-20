// 알림 메일을 보냅니다.
//   GET  /api/notify           → 예약 시간이 된 구독을 찾아 발송 (Vercel Cron 이 호출)
//   POST /api/notify {email,names,kinds} → 지금 바로 한 통 보내기 (미리보기)
//
// Vercel Cron 은 UTC 로 돕니다. 아래 계산은 모두 KST(UTC+9) 기준입니다.

import { loadAbsences, onDate } from '../lib/cube.js';
import { getJSON, setJSON, KEYS } from '../lib/store.js';
import { sendMail, buildDigest } from '../lib/mail.js';

const KST_OFFSET = 9 * 60;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function nowKST() {
  const now = new Date();
  return new Date(now.getTime() + (KST_OFFSET + now.getTimezoneOffset()) * 60000);
}

function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(date) {
  return `${isoOf(date).replace(/-/g, '.')} (${WEEKDAY[date.getDay()]})`;
}

function filterFor(items, sub) {
  const wanted = new Set(sub.names.map((n) => n.replace(/\s/g, '')));
  return items.filter((item) => {
    if (sub.kinds?.length && !sub.kinds.includes(item.kind)) return false;
    if (!wanted.size) return true;
    return wanted.has(item.name.replace(/\s/g, ''));
  });
}

async function digestFor(sub, today) {
  const { items } = await loadAbsences({ start: isoOf(today), end: isoOf(today) });
  const todays = filterFor(onDate(items, isoOf(today)), sub);
  return {
    count: todays.length,
    html: buildDigest({ dateLabel: dateLabel(today), items: todays, watchList: sub.names }),
  };
}

export default async function handler(req, res) {
  const today = nowKST();

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const sub = {
      email: String(body.email || '').trim(),
      names: Array.isArray(body.names) ? body.names : [],
      kinds: Array.isArray(body.kinds) && body.kinds.length ? body.kinds : ['annual', 'half'],
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sub.email)) {
      return res.status(400).json({ ok: false, error: '메일 주소 형식을 확인해 주세요.' });
    }
    try {
      const { count, html } = await digestFor(sub, today);
      await sendMail({
        to: sub.email,
        subject: `[부재자] ${dateLabel(today)} 오늘 부재 ${count}명`,
        html,
      });
      return res.status(200).json({ ok: true, sent: 1, count });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // --- Cron 경로 ---
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const sent = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (sent !== secret) return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const subs = (await getJSON(KEYS.subscriptions, [])) || [];
  const log = (await getJSON(KEYS.sentLog, {})) || {};
  const todayISO = isoOf(today);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  const results = [];
  for (const sub of subs) {
    const [hh, mm] = sub.time.split(':').map(Number);
    const target = hh * 60 + mm;
    // 예약 시각이 지났고 오늘 아직 안 보냈으면 발송합니다.
    // 창(window)을 두지 않으므로 하루 한 번만 도는 크론에서도 놓치지 않습니다.
    if (nowMinutes < target) continue;
    if (sub.weekdaysOnly && isWeekend) continue;
    if (log[sub.id] === todayISO) continue;

    try {
      const { count, html } = await digestFor(sub, today);
      await sendMail({
        to: sub.email,
        subject: `[부재자] ${dateLabel(today)} 오늘 부재 ${count}명`,
        html,
      });
      log[sub.id] = todayISO;
      results.push({ id: sub.id, ok: true, count });
    } catch (err) {
      results.push({ id: sub.id, ok: false, error: err.message });
    }
  }

  await setJSON(KEYS.sentLog, log);
  res.status(200).json({ ok: true, checkedAt: `${todayISO} ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')} KST`, subscriptions: subs.length, results });
}
