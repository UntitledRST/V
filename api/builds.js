// /api/builds.js
// 서버리스 함수: 각 버전 소스에서 서버 사이드로 직접 데이터를 가져와 정규화한 뒤
// 브라우저로 내려줍니다. 서버 -> 원본 서버 요청이므로 브라우저 CORS 제한을 받지 않습니다.
// Vercel Node.js 서버리스 함수 형식 (Node 18+ 전역 fetch 사용)

const SOURCES = [
  // ---------------- ALPHA / APP ----------------
  { key: 'alpha-app-windows', channel: 'alpha', group: 'app', platform: 'windows', label: 'Windows',
    url: 'https://stapn.113366.com/pub/windows/version.json', type: 'app-json' },
  { key: 'alpha-app-macos', channel: 'alpha', group: 'app', platform: 'macos', label: 'macOS',
    url: 'https://stapn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'alpha-app-android', channel: 'alpha', group: 'app', platform: 'android', label: 'Android',
    url: 'https://stapn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'alpha-app-ios', channel: 'alpha', group: 'app', platform: 'ios', label: 'iOS',
    url: 'https://stapn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- ALPHA / WEB ----------------
  { key: 'alpha-web-viewer', channel: 'alpha', group: 'web', platform: 'viewer', label: 'Viewer',
    url: 'https://stapn.startsupport.com/version.json',
    pageUrl: 'https://stapn.startsupport.com', type: 'web-viewer' },
  { key: 'alpha-web-relay', channel: 'alpha', group: 'web', platform: 'relay', label: 'Relay',
    url: 'https://stapn.113366.com/version.json',
    pageUrl: 'https://stapn.113366.com', type: 'web-relay' },
  { key: 'alpha-web-partneradmin', channel: 'alpha', group: 'web', platform: 'admin', label: 'PartnerAdmin',
    url: 'https://stapnpartners.startsupport.com/version.txt',
    siteUrl: 'https://stapnpartners.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },
  { key: 'alpha-web-useradmin', channel: 'alpha', group: 'web', platform: 'admin', label: 'UserAdmin',
    url: 'https://stapnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stapnadmin.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },

  // ---------------- BETA / APP ----------------
  { key: 'beta-app-windows', channel: 'beta', group: 'app', platform: 'windows', label: 'Windows',
    url: 'https://stbtn.113366.com/pub/windows/version.json', type: 'app-json' },
  { key: 'beta-app-macos', channel: 'beta', group: 'app', platform: 'macos', label: 'macOS',
    url: 'https://stbtn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'beta-app-android', channel: 'beta', group: 'app', platform: 'android', label: 'Android',
    url: 'https://stbtn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'beta-app-ios', channel: 'beta', group: 'app', platform: 'ios', label: 'iOS',
    url: 'https://stbtn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- BETA / WEB ----------------
  { key: 'beta-web-viewer', channel: 'beta', group: 'web', platform: 'viewer', label: 'Viewer',
    url: 'https://stbtn.startsupport.com/version.json',
    pageUrl: 'https://stbtn.startsupport.com', type: 'web-viewer' },
  { key: 'beta-web-relay', channel: 'beta', group: 'web', platform: 'relay', label: 'Relay',
    url: 'https://stbtn.113366.com/version.json',
    pageUrl: 'https://stbtn.113366.com', type: 'web-relay' },
  { key: 'beta-web-partneradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'PartnerAdmin',
    url: 'https://stbtnpartners.startsupport.com/verion.txt', // 원본 URL의 오탈자(verion) 유지
    siteUrl: 'https://stbtnpartners.startsupport.com', type: 'admin-txt',
    timeField: 'build-date', timeMode: 'kst' },
  { key: 'beta-web-useradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'UserAdmin',
    url: 'https://stbtnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stbtnadmin.startsupport.com', type: 'admin-txt',
    timeField: 'build_date', timeMode: 'kst' },
];

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (build-dashboard serverless fetcher)',
        Accept: '*/*',
        ...(opts.headers || {}),
      },
      cache: 'no-store',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// raw 시간 문자열/숫자를 UTC 기준 Date 로 최대한 관대하게 파싱
function parseAsUTCDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return new Date(raw < 1e12 ? raw * 1000 : raw);
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  // 이미 타임존 정보(Z 또는 +09:00 등)가 있으면 그대로 파싱
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // 타임존 정보가 없으면 UTC로 간주
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(iso + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

// UTC Date -> 'YYYY-MM-DD HH:mm:ss' (Asia/Seoul)
function formatKST(date) {
  if (!date) return null;
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // sv-SE 로케일은 'YYYY-MM-DD HH:mm:ss' 형태(콤마 없이)로 출력됨
  return fmt.format(date).replace(',', '');
}

function todayKSTDateStr() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

// 이미 KST 문자열(예: "2026-06-24 18:56:16 KST")에서 뒤에 붙은 " KST" 등의 타임존 표기만 제거
function stripTZSuffix(raw) {
  if (!raw) return null;
  return raw.replace(/\s*(KST|UTC|GMT[+-]?\d*)\s*$/i, '').trim();
}

// 값이 문자열/숫자 등 "표시 가능한 값"인지 확인 (객체가 build 필드에 잘못 들어오는 것을 방지)
function isPrimitiveValue(v) {
  return v !== null && v !== undefined && (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '';
}

// 정확한 필드명을 모를 때 대비: "build"와 "number"(또는 no)가 모두 들어간 키를 대소문자 구분 없이 재귀 탐색
function findBuildNumberDeep(obj, maxDepth) {
  if (maxDepth < 0 || obj === null || typeof obj !== 'object') return null;
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (/^build[_-]?number$/i.test(k) && isPrimitiveValue(obj[k])) return obj[k];
  }
  for (const k of keys) {
    if (/build/i.test(k) && /(num|no)/i.test(k) && isPrimitiveValue(obj[k])) return obj[k];
  }
  for (const k of keys) {
    if (obj[k] && typeof obj[k] === 'object') {
      const found = findBuildNumberDeep(obj[k], maxDepth - 1);
      if (found !== null) return found;
    }
  }
  return null;
}

async function fetchAppJson(src) {
  const res = await fetchWithTimeout(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const buildCandidates = [j.build, j.build_number, j.buildNumber];
  let build = null;
  for (const c of buildCandidates) { if (isPrimitiveValue(c)) { build = c; break; } }
  const date = parseAsUTCDate(j.releasedAt || j.released_at || null);
  return {
    build,
    updateDateText: formatKST(date),
    updateDateForCompare: date ? formatKST(date).slice(0, 10) : null,
    downloadUrl: j.url || null,
    downloadLabel: '다운로드',
  };
}

async function fetchAdminTxt(src) {
  const res = await fetchWithTimeout(src.url, { headers: { Accept: 'application/json, text/plain, */*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch (e) {
    j = null;
  }
  if (!j) {
    return {
      build: null,
      updateDateText: null,
      updateDateForCompare: null,
      downloadUrl: src.siteUrl,
      downloadLabel: '바로가기',
      _debug: { reason: 'JSON 파싱 실패', rawSnippet: text.slice(0, 300) },
    };
  }

  // buildNumber는 반드시 "값"(문자열/숫자)이어야 함 - 객체가 걸리면 절대 사용하지 않음
  // (예전 버그: j.build가 {version, time, ...} 같은 객체인 경우가 있어 "#[object Object]"로 표시되던 문제 수정)
  const buildCandidates = [
    j.buildNumber,
    j.build_number,
    j.build && j.build.buildNumber,
    j.build && j.build.build_number,
    j.build && j.build.number,
    j.info && j.info.buildNumber,
    j.info && j.info.build && j.info.build.buildNumber,
    isPrimitiveValue(j.build) ? j.build : undefined,
  ];
  let build = null;
  for (const c of buildCandidates) {
    if (isPrimitiveValue(c)) { build = c; break; }
  }
  // 정확한 필드명을 못 찾으면, "build"와 "number"가 들어간 키를 대소문자 구분 없이 재귀적으로 탐색 (2단계 깊이)
  if (build === null) {
    build = findBuildNumberDeep(j, 2);
  }

  // 알파 PartnerAdmin/UserAdmin: "time" 필드, UTC로 간주하고 KST로 변환
  // 베타 PartnerAdmin/UserAdmin: "build-date" 필드, 이미 KST 값이므로 접미사만 제거
  const timeField = src.timeField || 'time';
  const timeMode = src.timeMode || 'utc';
  const timeCandidates = [
    j[timeField],
    j.time,
    j['build_date'],
    j['build-date'],
    j.buildDate,
    j.build && j.build[timeField],
    j.build && j.build.time,
    j.build && j.build['build_date'],
    j.build && j.build['build-date'],
  ];
  let rawTimeValue = null;
  for (const c of timeCandidates) {
    if (isPrimitiveValue(c)) { rawTimeValue = c; break; }
  }

  let updateDateText = null;
  let updateDateForCompare = null;
  if (rawTimeValue !== null) {
    if (timeMode === 'kst') {
      const stripped = stripTZSuffix(String(rawTimeValue).trim());
      updateDateText = stripped;
      updateDateForCompare = stripped ? stripped.slice(0, 10) : null;
    } else {
      const date = parseAsUTCDate(rawTimeValue);
      updateDateText = formatKST(date);
      updateDateForCompare = date ? updateDateText.slice(0, 10) : null;
    }
  }

  const result = {
    build,
    updateDateText,
    updateDateForCompare,
    downloadUrl: src.siteUrl,
    downloadLabel: '바로가기',
  };
  // buildNumber를 끝내 못 찾은 경우, 실제 응답 구조를 바로 확인할 수 있도록 진단 정보를 함께 내려줌
  if (build === null) {
    result._debug = {
      reason: 'buildNumber 후보 키를 찾지 못함',
      topLevelKeys: Object.keys(j),
      rawSnippet: text.slice(0, 400),
    };
  }
  return result;
}

async function fetchWebViewer(src) {
  const [jsonRes, pageRes] = await Promise.all([
    fetchWithTimeout(src.url),
    fetchWithTimeout(src.pageUrl, { headers: { Accept: 'text/html' } }),
  ]);
  if (!jsonRes.ok) throw new Error(`HTTP ${jsonRes.status}`);
  const j = await jsonRes.json();
  const buildCandidates = [j.build_number, j.build];
  let build = null;
  for (const c of buildCandidates) { if (isPrimitiveValue(c)) { build = c; break; } }

  let updateDateText = null;
  let updateDateForCompare = null;
  if (pageRes.ok) {
    const html = await pageRes.text();
    const m = html.match(/<meta[^>]+name=["']build-date["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/meta-build-date:\s*(.+)/i); // 일부 렌더러가 프론트매터 형태로 반환하는 경우 대비
    if (m) {
      const raw = stripTZSuffix(m[1]); // 이미 KST, "KST" 접미사만 제거
      updateDateText = raw;
      updateDateForCompare = raw ? raw.slice(0, 10) : null;
    }
  }

  return {
    build,
    updateDateText,
    updateDateForCompare,
    downloadUrl: src.pageUrl,
    downloadLabel: '바로가기',
  };
}

async function fetchWebRelay(src) {
  const res = await fetchWithTimeout(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const buildCandidates = [j.build_number, j.build];
  let build = null;
  for (const c of buildCandidates) { if (isPrimitiveValue(c)) { build = c; break; } }
  return {
    build,
    updateDateText: null, // Relay는 업데이트 시간을 표시하지 않음
    updateDateForCompare: null,
    downloadUrl: src.pageUrl,
    downloadLabel: '바로가기',
  };
}

async function fetchOne(src) {
  try {
    let data;
    if (src.type === 'app-json') data = await fetchAppJson(src);
    else if (src.type === 'admin-txt') data = await fetchAdminTxt(src);
    else if (src.type === 'web-viewer') data = await fetchWebViewer(src);
    else if (src.type === 'web-relay') data = await fetchWebRelay(src);
    else throw new Error('unknown source type');

    const todayKST = todayKSTDateStr();
    const isToday = !!data.updateDateForCompare && data.updateDateForCompare === todayKST;

    return {
      key: src.key,
      channel: src.channel,
      group: src.group,
      platform: src.platform,
      label: src.label,
      ok: true,
      build: data.build,
      updateDateText: data.updateDateText,
      isToday,
      downloadUrl: data.downloadUrl,
      downloadLabel: data.downloadLabel,
    };
  } catch (err) {
    return {
      key: src.key,
      channel: src.channel,
      group: src.group,
      platform: src.platform,
      label: src.label,
      ok: false,
      error: String(err && err.message ? err.message : err),
      build: null,
      updateDateText: null,
      isToday: false,
      downloadUrl: src.siteUrl || src.pageUrl || null,
      downloadLabel: src.type === 'app-json' ? '다운로드' : '바로가기',
    };
  }
}

module.exports = async (req, res) => {
  try {
    const results = await Promise.all(SOURCES.map(fetchOne));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      serverTime: new Date().toISOString(),
      items: results,
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
