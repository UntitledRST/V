// Resend(https://resend.com) 로 메일을 보냅니다.
// 환경변수: RESEND_API_KEY, MAIL_FROM (예: "부재자 알림 <notice@yourdomain.com>")

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'Absence Board <onboarding@resend.dev>';

export async function sendMail({ to, subject, html }) {
  if (!KEY) throw new Error('RESEND_API_KEY 가 없습니다. Vercel 환경변수에 넣어 주세요.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const COLORS = {
  annual: '#2F6F5F',
  half: '#B4762A',
  field: '#3B5BA5',
  remote: '#5D6BA8',
  etc: '#7A8794',
};

export function buildDigest({ dateLabel, items, watchList }) {
  const scope = watchList.length ? `지정한 ${watchList.length}명 중` : '전사';

  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E4E8ED;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${COLORS[item.kind] || COLORS.etc};margin-right:8px;vertical-align:middle;"></span>
          <strong style="color:#14212E;">${escapeHtml(item.name)}</strong>
          <span style="color:#7A8794;font-size:12px;margin-left:6px;">${escapeHtml(item.dept || '')}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #E4E8ED;color:#40505F;font-size:13px;">
          ${escapeHtml(item.label)}${item.part && item.part !== '종일' ? ` · ${escapeHtml(item.part)}` : ''}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #E4E8ED;color:#7A8794;font-size:12px;font-family:ui-monospace,monospace;">
          ${item.start === item.end ? item.start : `${item.start} ~ ${item.end}`}
        </td>
      </tr>`
    )
    .join('');

  const body = items.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>`
    : `<p style="margin:20px 0;padding:18px;background:#F1F4F7;border-radius:8px;color:#40505F;font-size:14px;">${scope} 오늘 부재인 사람은 없습니다.</p>`;

  return `
  <div style="font-family:-apple-system,'Segoe UI','Apple SD Gothic Neo',sans-serif;max-width:560px;margin:0 auto;padding:28px 20px;">
    <p style="margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7A8794;">Absence board</p>
    <h1 style="margin:6px 0 2px;font-size:22px;color:#14212E;">오늘의 부재자 ${items.length}명</h1>
    <p style="margin:0;color:#7A8794;font-size:13px;">${dateLabel} · ${scope}</p>
    ${body}
    ${
      watchList.length
        ? `<p style="margin-top:18px;color:#7A8794;font-size:12px;">확인 대상: ${escapeHtml(watchList.join(', '))}</p>`
        : ''
    }
  </div>`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
