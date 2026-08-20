// Cube 부재자 현황(https://cube.rsup.io/hr/notin/list) 데이터를 가져와
// 화면이 쓰는 공통 형태로 바꿉니다.
//
// 데이터는 아래 순서로 찾습니다.
//   1) CUBE_ABSENCE_API + CUBE_COOKIE 가 설정돼 있으면 Cube 를 직접 호출
//   2) collector 스크립트가 /api/ingest 로 올려둔 스냅샷
//   3) 둘 다 없으면 화면 확인용 예시 데이터
//
// Cube 는 사내 SSO 로 보호돼 있어 실제 응답 필드명을 확인하기 전까지는
// 아래 normalize() 의 후보 키 목록으로 최대한 넓게 대응합니다.
// /api/absences?debug=1 을 호출하면 원본 응답을 그대로 볼 수 있습니다.

import { getJSON, KEYS } from './store.js';

const API = process.env.CUBE_ABSENCE_API || '';
const COOKIE = process.env.CUBE_COOKIE || '';

const FIELD = {
  name: ['userNm', 'userName', 'empNm', 'name', 'memberNm', 'userNameKo'],
  dept: ['deptNm', 'deptName', 'dept2Nm', 'departmentNm', 'orgNm', 'teamNm'],
  start: ['startYmd', 'startDate', 'fromYmd', 'useYmd', 'ymd', 'startDt', 'sDate'],
  end: ['endYmd', 'endDate', 'toYmd', 'useYmd', 'ymd', 'endDt', 'eDate'],
  label: ['dayoffNm', 'notInNm', 'appTypeNm', 'title', 'kindNm', 'gbnNm', 'typeNm', 'contents'],
  code: ['dayoffCd', 'notInCd', 'tmplCd', 'kindCd', 'gbnCd', 'typeCd'],
  part: ['timeTypeCd', 'timeCd', 'halfCd', 'partCd'],
  id: ['appSeq', 'seq', 'notInSeq', 'id'],
  userSeq: ['userSeq', 'empSeq', 'memberSeq'],
};

function pick(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function toISO(value) {
  if (!value) return '';
  const digits = String(value).replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length !== 8) return '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// 부재 종류 분류 — 화면 색과 필터, 메일 대상 판정에 함께 쓰입니다.
export const KINDS = {
  annual: { key: 'annual', label: '연차' },
  half: { key: 'half', label: '반차·반반차' },
  field: { key: 'field', label: '외근·출장' },
  remote: { key: 'remote', label: '재택' },
  etc: { key: 'etc', label: '기타 부재' },
};

function classify(text, part) {
  const t = `${text} ${part}`.toUpperCase();
  if (/외근|출장|BIZTRIP|BUSINESS|FIELD/.test(t)) return 'field';
  if (/재택|REMOTE|WFH/.test(t)) return 'remote';
  if (/반차|반반|HALF|\bAM\b|\bPM\b|TIME/.test(t)) return 'half';
  if (/연차|휴가|ANNUAL|DAYOFF|VACATION|경조|공가|병가|출산/.test(t)) return 'annual';
  return 'etc';
}

function partLabel(part, label) {
  const p = String(part).toUpperCase();
  if (p.includes('AM')) return '오전';
  if (p.includes('PM')) return '오후';
  if (p.includes('TIME')) return '시간';
  if (p.includes('DAY') || p.includes('ALL')) return '종일';
  return /반차/.test(label) ? '반차' : '종일';
}

function findRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = ['list', 'dataList', 'resultList', 'rows', 'items', 'content', 'data', 'result'];
  for (const key of candidates) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = findRows(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function normalize(payload) {
  return findRows(payload)
    .map((row, index) => {
      const name = String(pick(row, FIELD.name)).trim();
      if (!name) return null;
      const label = String(pick(row, FIELD.label)).trim();
      const code = String(pick(row, FIELD.code)).trim();
      const part = String(pick(row, FIELD.part)).trim();
      const start = toISO(pick(row, FIELD.start));
      const end = toISO(pick(row, FIELD.end)) || start;
      if (!start) return null;
      const kind = classify(`${label} ${code}`, part);
      return {
        id: String(pick(row, FIELD.id) || `${name}-${start}-${index}`),
        name,
        dept: String(pick(row, FIELD.dept)).trim(),
        kind,
        label: label || KINDS[kind].label,
        part: partLabel(part, label),
        start,
        end: end < start ? start : end,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'ko'));
}

async function fetchLive(start, end) {
  const url = API.replace('{start}', start.replace(/-/g, '')).replace('{end}', end.replace(/-/g, ''));
  const res = await fetch(url, {
    headers: {
      cookie: COOKIE,
      accept: 'application/json, text/plain, */*',
      referer: 'https://cube.rsup.io/hr/notin/list',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cube ${res.status}: ${text.slice(0, 200)}`);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    // 세션이 끊기면 로그인 HTML 이 돌아옵니다.
    throw new Error('Cube 가 JSON 대신 HTML 을 돌려줬습니다. CUBE_COOKIE 를 갱신하세요.');
  }
  return payload;
}

function demoData(start) {
  const base = new Date(`${start}T00:00:00Z`);
  const shift = (days) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return [
    { name: '이명찬', dept: '프로젝트개발팀', kind: 'annual', label: '연차휴가', part: '종일', start: shift(2), end: shift(2) },
    { name: '박지호', dept: '프로젝트개발팀', kind: 'half', label: '연차휴가(오전)', part: '오전', start: shift(2), end: shift(2) },
    { name: '박승진', dept: '프로젝트개발팀', kind: 'field', label: '고객사 외근', part: '종일', start: shift(3), end: shift(4) },
    { name: '윤성호', dept: '인사팀', kind: 'annual', label: '연차휴가', part: '종일', start: shift(8), end: shift(10) },
    { name: '석재원', dept: '인사팀', kind: 'remote', label: '재택근무', part: '종일', start: shift(9), end: shift(9) },
    { name: '정세희', dept: '인사팀', kind: 'annual', label: '연차휴가', part: '종일', start: shift(15), end: shift(15) },
    { name: '김택중', dept: '연구개발본부', kind: 'field', label: '출장', part: '종일', start: shift(16), end: shift(17) },
    { name: '석효진', dept: '인사팀', kind: 'half', label: '연차휴가(오후)', part: '오후', start: shift(16), end: shift(16) },
  ].map((row, index) => ({ id: `demo-${index}`, ...row }));
}

export async function loadAbsences({ start, end, debug = false }) {
  if (API && COOKIE) {
    try {
      const payload = await fetchLive(start, end);
      return {
        source: 'cube',
        items: normalize(payload),
        raw: debug ? payload : undefined,
      };
    } catch (err) {
      console.error('cube fetch failed:', err.message);
      const snapshot = await getJSON(KEYS.snapshot);
      if (snapshot?.items?.length) {
        return { source: 'snapshot', items: snapshot.items, fetchedAt: snapshot.fetchedAt, warning: err.message };
      }
      return { source: 'demo', items: demoData(start), warning: err.message };
    }
  }

  const snapshot = await getJSON(KEYS.snapshot);
  if (snapshot?.items?.length) {
    return { source: 'snapshot', items: snapshot.items, fetchedAt: snapshot.fetchedAt };
  }
  return { source: 'demo', items: demoData(start) };
}

// 특정 날짜에 부재인 사람만 추립니다.
export function onDate(items, iso) {
  return items.filter((item) => item.start <= iso && iso <= item.end);
}
