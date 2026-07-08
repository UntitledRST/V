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
    siteUrl: 'https://stbtnpartners.startsupport.com',
    // 이 사이트는 Vercel 직접요청/HTTP1.1 강제/Cloudflare Worker 경유까지 모두 시도했지만
    // 원본 서버가 522(원본 응답 없음)로 응답해 조회가 불가능함이 확인됨.
    // 더 이상 네트워크 요청을 시도하지 않고, 아래 고정 문구를 그대로 표시함.
    disabled: true,
    staticNote: '업데이트 시간: 2026-07-06 13:01:50',
  },
  { key: 'beta-web-useradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'UserAdmin',
    url: 'https://stbtnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stbtnadmin.startsupport.com', type: 'admin-txt',
    timeField: 'build_date', timeMode: 'utc' },
];

const FETCH_TIMEOUT_MS = 1200; // 개별 소스 조회의 기본 타임아웃(1200ms)
const FETCH_MAX_RETRIES = 0; // 재시도 없이 바로 실패 처리

// 페이지 전체(=/api/builds 응답)는 개별 소스가 내부적으로 재시도/폴백을 하든 말든
// 절대 이 시간을 넘기지 않도록 하는 "최종 안전장치" 데드라인.
// (개별 FETCH_TIMEOUT_MS를 아무리 잘 맞춰도, 코드 경로에 따라 재시도/폴백이 겹치면
//  1.2초를 넘길 수 있으므로, 소스 하나하나를 이 시간으로 강제 컷오프함)
const HARD_DEADLINE_MS = 1200;

// promise가 ms 안에 끝나지 않으면, 원래 처리 결과를 기다리지 않고 즉시 fallbackFactory()의
// 결과로 대체해서 응답함 (원래 promise 자체가 취소되는 건 아니지만, 응답에는 영향을 주지 않음)
function withHardDeadline(promise, ms, fallbackFactory) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallbackFactory());
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        // fetchOne은 내부에서 이미 모든 에러를 잡아서 정상 반환하므로 여기로 올 일은 거의 없지만,
        // 혹시 모를 예외 상황에서도 응답 자체는 절대 지연/실패하지 않도록 안전하게 처리
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallbackFactory());
      }
    );
  });
}

const https = require('https');
const { URL } = require('url');

// 일부 사이트가 서버리스/데이터센터發 요청이나 봇으로 보이는 User-Agent를 방화벽(CDN/WAF) 단에서
// 조용히 무응답 처리(블랙홀)하는 경우가 있어, 실제 브라우저와 최대한 유사한 헤더로 요청함
const BROWSER_LIKE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
  'Upgrade-Insecure-Requests': '1',
};

// 요청 URL 자신의 오리진을 Referer로 넣어 "그 사이트 내에서 이동한 것"처럼 보이게 함
function refererFor(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch (e) {
    return undefined;
  }
}

async function fetchOnce(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        ...BROWSER_LIKE_HEADERS,
        Referer: refererFor(url),
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

// 최후의 수단: Node 기본 https 모듈로 HTTP/1.1 연결을 강제해서 재시도.
// fetch(undici)가 사용하는 HTTP/2 협상이나 TLS 핑거프린트를 근거로 차단하는 WAF를 우회하기 위함.
function fetchViaNodeHttps(url, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }

    const headers = {
      ...BROWSER_LIKE_HEADERS,
      Referer: refererFor(url),
      Accept: '*/*',
      ...((opts && opts.headers) || {}),
    };

    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      port: u.port || 443,
      headers,
      ALPNProtocols: ['http/1.1'], // HTTP/2 협상을 하지 않고 HTTP/1.1로만 접속
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: { get: (name) => res.headers[String(name).toLowerCase()] || null },
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchWithTimeout(url, opts = {}, config = {}) {
  // config로 개별 소스가 기본 타임아웃(2초)/재시도(0회)/https 폴백 여부를 오버라이드할 수 있음
  // 기본값은 재시도/폴백 없이 정확히 timeoutMs에서 바로 실패 처리 (모든 소스 통일)
  const timeoutMs = config.timeoutMs != null ? config.timeoutMs : FETCH_TIMEOUT_MS;
  const maxRetries = config.maxRetries != null ? config.maxRetries : FETCH_MAX_RETRIES;
  const allowNodeHttpsFallback = config.allowNodeHttpsFallback === true;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOnce(url, opts, timeoutMs);
    } catch (err) {
      lastErr = err;
      // 타임아웃(AbortError)이나 일시적 네트워크 오류일 수 있으므로, 마지막 시도가 아니면 짧게 쉬었다가 재시도
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

    }
  }
  if (!allowNodeHttpsFallback) throw lastErr;
  // fetch(undici)로 계속 실패하면, HTTP/1.1을 강제하는 Node https 모듈로 마지막으로 한 번 더 시도
  try {
    return await fetchViaNodeHttps(url, opts, timeoutMs);
  } catch (fallbackErr) {
    // 폴백까지 실패하면, 더 구체적인(원래) 에러를 우선 노출
    throw lastErr || fallbackErr;
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

// HTTP 실패 시, 상태 코드를 err.status에 담아서 던짐 (나중에 "배포 중 추정" 판단에 사용)
function httpStatusError(status, messagePrefix) {
  const e = new Error((messagePrefix || 'HTTP') + ' ' + status);
  e.status = status;
  return e;
}

// 재배포(원본 서버 재시작) 도중 흔히 나타나는 상태코드/네트워크 오류 코드.
// 이 값들이 감지되면 "서버 완전 장애"가 아니라 "빌드 업데이트로 인한 일시적 접속 불가"일 가능성이 높다고 판단함.
const GATEWAY_STATUS_CODES = [502, 503, 504, 520, 521, 522, 523, 524];
const GATEWAY_NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_SOCKET'];

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
  if (!res.ok) throw httpStatusError(res.status);
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

// key="value" 형태의 한 줄씩 나오는 텍스트(자바 properties 스타일)를 객체로 파싱
// 예: name="user-admin"\nversion="8.0.1"\nbuild_date="2026-07-06T04:01:58.693Z"
function parseKeyValueText(text) {
  const obj = {};
  const lines = text.split(/\r?\n/);
  let matched = false;
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"?([^"\n]*?)"?\s*$/);
    if (m) {
      obj[m[1]] = m[2];
      matched = true;
    }
  }
  return matched ? obj : null;
}

async function fetchAdminTxt(src) {
  const res = await fetchWithTimeout(src.url, { headers: { Accept: 'application/json, text/plain, */*' } });
  if (!res.ok) throw httpStatusError(res.status);
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch (e) {
    j = null;
  }
  if (!j) {
    // JSON이 아니면 "key=value" 한 줄씩 나오는 텍스트 포맷(예: name="user-admin")으로 시도
    j = parseKeyValueText(text);
  }
  if (!j) {
    return {
      build: null,
      updateDateText: null,
      updateDateForCompare: null,
      downloadUrl: src.siteUrl,
      downloadLabel: '바로가기',
      _debug: { reason: 'JSON도 key=value 텍스트도 아님(파싱 실패)', rawSnippet: text.slice(0, 300) },
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
  // build 필드는 이 API에 애초에 존재하지 않는 경우가 많아 정상 상황이므로 진단 메시지에서 제외하고,
  // 실제 문제인 "시간 필드를 못 찾은 경우"만 진단 정보를 내려줌
  if (updateDateText === null) {
    result._debug = {
      reason: `시간 필드(${timeField}) 후보를 찾지 못함`,
      topLevelKeys: Object.keys(j),
      rawSnippet: text.slice(0, 500),
    };
  }
  return result;
}

// Cloudflare Worker 등 별도 경유지(proxyUrl)를 통해, 혹은 직접 GET 요청으로
// 응답 헤더의 Last-Modified 값을 가져와 업데이트 시간으로 사용.
// direct fetch가 방화벽/봇 차단으로 계속 응답을 못 받는 사이트(예: 베타 PartnerAdmin)를 위한 대안.
async function fetchAdminHead(src) {
  const timeoutMs = src.timeoutMs != null ? src.timeoutMs : FETCH_TIMEOUT_MS;
  let lastModifiedRaw = null;

  if (src.proxyUrl) {
    // Cloudflare Worker 프록시를 거쳐 대상 사이트의 헤더를 대신 가져옴
    // (Worker는 다른 네트워크/IP 대역에서 요청하므로, 원본 사이트가 서버리스 IP를 차단해도 우회 가능)
    const res = await fetchWithTimeout(
      src.proxyUrl,
      { headers: src.proxyKey ? { 'x-proxy-key': src.proxyKey } : {} },
      { timeoutMs, maxRetries: 0, allowNodeHttpsFallback: false }
    );
    if (!res.ok) throw httpStatusError(res.status, '프록시 HTTP');
    const json = await res.json();
    if (json && json.ok === false && json.error) throw new Error(`프록시 오류: ${json.error}`);
    lastModifiedRaw = (json && json.lastModified) || null;
  } else {
    // 프록시 미설정 시: 기존처럼 직접 GET 요청 (실패하면 HTTP/1.1 강제 폴백까지 시도)
    const res = await fetchWithTimeout(
      src.url,
      { method: 'GET' },
      { timeoutMs, maxRetries: 0, allowNodeHttpsFallback: true }
    );
    if (!res.ok) throw httpStatusError(res.status);
    lastModifiedRaw = res.headers.get('last-modified');
  }

  // Last-Modified는 표준 HTTP-date 형식(예: "Wed, 21 Oct 2015 07:28:00 GMT")이라 Date가 바로 파싱 가능
  const date = lastModifiedRaw ? new Date(lastModifiedRaw) : null;
  const valid = !!(date && !isNaN(date.getTime()));

  const result = {
    build: null,
    updateDateText: valid ? formatKST(date) : null,
    updateDateForCompare: valid ? formatKST(date).slice(0, 10) : null,
    downloadUrl: src.siteUrl || src.url,
    downloadLabel: '바로가기',
  };
  if (!valid) {
    result._debug = {
      reason: 'Last-Modified 헤더를 찾지 못함',
      lastModifiedHeader: lastModifiedRaw || null,
    };
  }
  return result;
}

async function fetchWebViewer(src) {
  const [jsonRes, pageRes] = await Promise.all([
    fetchWithTimeout(src.url),
    fetchWithTimeout(src.pageUrl, { headers: { Accept: 'text/html' } }),
  ]);
  if (!jsonRes.ok) throw httpStatusError(jsonRes.status);
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
  const [jsonRes, pageRes] = await Promise.all([
    fetchWithTimeout(src.url),
    fetchWithTimeout(src.pageUrl, { headers: { Accept: 'text/html' } }).catch(() => null),
  ]);
  if (!jsonRes.ok) throw httpStatusError(jsonRes.status);
  const j = await jsonRes.json();
  const buildCandidates = [j.build_number, j.build];
  let build = null;
  for (const c of buildCandidates) { if (isPrimitiveValue(c)) { build = c; break; } }

  // Relay 응답 자체에는 날짜 정보가 없어서, (1) 페이지의 build-date 메타태그(Viewer와 동일한 방식)
  // -> (2) HTTP Last-Modified 헤더 순으로 시도해서 업데이트 시간을 구함(이제 텍스트로도 표시).
  let updateDateText = null;
  let updateDateForCompare = null;
  let metaFound = false;
  if (pageRes && pageRes.ok) {
    const html = await pageRes.text();
    const m = html.match(/<meta[^>]+name=["']build-date["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/meta-build-date:\s*(.+)/i);
    if (m) {
      const raw = stripTZSuffix(m[1]); // 이미 KST 값
      updateDateText = raw;
      updateDateForCompare = raw ? raw.slice(0, 10) : null;
      metaFound = true;
    }
  }
  const lastModified = jsonRes.headers.get('last-modified');
  if (!updateDateText && lastModified) {
    const d = new Date(lastModified);
    if (!isNaN(d.getTime())) {
      updateDateText = formatKST(d);
      updateDateForCompare = updateDateText.slice(0, 10);
    }
  }

  const result = {
    build,
    updateDateText,
    updateDateForCompare,
    downloadUrl: src.pageUrl,
    downloadLabel: '바로가기',
  };
  if (!updateDateText) {
    result._debug = {
      reason: '업데이트 시간을 못 찾음',
      pageFetchOk: !!(pageRes && pageRes.ok),
      metaTagFound: metaFound,
      lastModifiedHeader: lastModified || null,
    };
  }
  return result;
}

async function fetchOne(src) {
  // 조회를 아예 포기한 소스: 네트워크 요청을 전혀 시도하지 않고 항상 "정보 없음" 상태로 반환
  if (src.disabled) {
    return {
      key: src.key,
      channel: src.channel,
      group: src.group,
      platform: src.platform,
      label: src.label,
      ok: true,
      build: null,
      updateDateText: null,
      staticNote: src.staticNote || null, // 있으면 카드에 이 문구를 그대로 표시 (index.html에서 처리)
      isToday: false,
      downloadUrl: src.siteUrl || src.url || null,
      downloadLabel: '바로가기',
    };
  }

  try {
    let data;
    if (src.type === 'app-json') data = await fetchAppJson(src);
    else if (src.type === 'admin-txt') data = await fetchAdminTxt(src);
    else if (src.type === 'admin-head') data = await fetchAdminHead(src);
    else if (src.type === 'web-viewer') data = await fetchWebViewer(src);
    else if (src.type === 'web-relay') data = await fetchWebRelay(src);
    else throw new Error('unknown source type');

    const todayKST = todayKSTDateStr();
    const isToday = !!data.updateDateForCompare && data.updateDateForCompare === todayKST;

    const out = {
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
    if (data._debug) out._debug = data._debug; // 진단 정보가 있으면 항상 응답에 포함시킴
    return out;
  } catch (err) {
    const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)));
    const effectiveTimeoutMs = src.timeoutMs != null ? src.timeoutMs : FETCH_TIMEOUT_MS;
    const errorMessage = isAbort
      ? `타임아웃: ${effectiveTimeoutMs / 1000}초 응답 없음`
      : String(err && err.message ? err.message : err);

    // 실패 원인이 "게이트웨이/원본서버 응답 없음" 계열 상태코드이거나, 연결이 끊기는 네트워크 오류이거나,
    // 타임아웃(응답 자체가 없음)인 경우 -> 완전한 장애라기보다 "빌드 업데이트로 서버가 재시작 중"일 가능성이 높음
    const statusCode = (err && typeof err.status === 'number') ? err.status : null;
    const networkErrorCode = (err && (err.code || (err.cause && err.cause.code))) || null;
    const possibleDeployIssue = !!(
      isAbort ||
      (statusCode !== null && GATEWAY_STATUS_CODES.indexOf(statusCode) !== -1) ||
      (networkErrorCode !== null && GATEWAY_NETWORK_CODES.indexOf(networkErrorCode) !== -1)
    );

    return {
      key: src.key,
      channel: src.channel,
      group: src.group,
      platform: src.platform,
      label: src.label,
      ok: false,
      error: errorMessage,
      statusCode,
      networkErrorCode,
      possibleDeployIssue,
      build: null,
      updateDateText: null,
      isToday: false,
      downloadUrl: src.siteUrl || src.pageUrl || null,
      downloadLabel: src.type === 'app-json' ? '다운로드' : '바로가기',
    };
  }
}

// 하드 데드라인(HARD_DEADLINE_MS)을 넘긴 소스에 대해 내려줄 결과.
// 일반 실패(ok:false)와 형태는 같지만, 사유가 "우리 쪽에서 강제로 끊음"이라는 걸 명확히 구분해서 표시.
function buildHardDeadlineResult(src) {
  return {
    key: src.key,
    channel: src.channel,
    group: src.group,
    platform: src.platform,
    label: src.label,
    ok: false,
    error: `응답 지연으로 강제 종료(${HARD_DEADLINE_MS}ms 초과)`,
    statusCode: null,
    networkErrorCode: null,
    possibleDeployIssue: true, // 응답이 이례적으로 느린 것도 재배포/재시작 정황일 가능성이 높아 동일하게 취급
    build: null,
    updateDateText: null,
    isToday: false,
    downloadUrl: src.siteUrl || src.pageUrl || src.url || null,
    downloadLabel: src.type === 'app-json' ? '다운로드' : '바로가기',
  };
}

module.exports = async (req, res) => {
  try {
    // 소스 하나하나에 HARD_DEADLINE_MS 강제 컷오프를 적용 -> 무엇이 얼마나 느려지든
    // /api/builds 응답 자체는 절대 HARD_DEADLINE_MS(1초)를 넘기지 않음
    const results = await Promise.all(
      SOURCES.map((src) => withHardDeadline(fetchOne(src), HARD_DEADLINE_MS, () => buildHardDeadlineResult(src)))
    );
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      serverTime: new Date().toISOString(),
      items: results,
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
