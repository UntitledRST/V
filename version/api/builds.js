// /api/builds.js
// 서버리스 함수: 각 버전 소스에서 서버 사이드로 직접 데이터를 가져와 정규화한 뒤
// 브라우저로 내려줍니다. 서버 -> 원본 서버 요청이므로 브라우저 CORS 제한을 받지 않습니다.
// Vercel Node.js 서버리스 함수 형식 (Node 18+ 전역 fetch 사용)

const SOURCES = [
  // ---------------- ALPHA / APP (Host) ----------------
  { key: 'alpha-app-windows', channel: 'alpha', group: 'app-host', platform: 'windows', label: 'Windows',
    url: 'https://stapn.113366.com/pub/windows/version.json', type: 'app-json',
    // fixed download url regardless of version.json's url field
    downloadUrl: 'https://stapn.113366.com/pub/windows/remotecall-host.exe' },
  { key: 'alpha-app-macos', channel: 'alpha', group: 'app-host', platform: 'macos', label: 'macOS',
    url: 'https://stapn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'alpha-app-android', channel: 'alpha', group: 'app-host', platform: 'android', label: 'Android',
    url: 'https://stapn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'alpha-app-ios', channel: 'alpha', group: 'app-host', platform: 'ios', label: 'iOS',
    url: 'https://stapn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- ALPHA / APP (Viewer) ----------------
  { key: 'alpha-appviewer-windows', channel: 'alpha', group: 'app-viewer', platform: 'windows', label: 'Windows',
    url: 'http://stapn.startsupport.com/pub/windows/version.json', type: 'app-json' },
  { key: 'alpha-appviewer-macos', channel: 'alpha', group: 'app-viewer', platform: 'macos', label: 'macOS',
    url: 'http://stapn.startsupport.com/pub/macos/version.json', type: 'app-json' },

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

  // ---------------- BETA / APP (Host) ----------------
  { key: 'beta-app-windows', channel: 'beta', group: 'app-host', platform: 'windows', label: 'Windows',
    url: 'https://stbtn.113366.com/pub/windows/version.json', type: 'app-json' },
  { key: 'beta-app-macos', channel: 'beta', group: 'app-host', platform: 'macos', label: 'macOS',
    url: 'https://stbtn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'beta-app-android', channel: 'beta', group: 'app-host', platform: 'android', label: 'Android',
    url: 'https://stbtn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'beta-app-ios', channel: 'beta', group: 'app-host', platform: 'ios', label: 'iOS',
    url: 'https://stbtn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- BETA / APP (Viewer) ----------------
  { key: 'beta-appviewer-windows', channel: 'beta', group: 'app-viewer', platform: 'windows', label: 'Windows',
    url: 'http://stbtn.startsupport.com/pub/windows/version.json', type: 'app-json' },
  { key: 'beta-appviewer-macos', channel: 'beta', group: 'app-viewer', platform: 'macos', label: 'macOS',
    url: 'http://stbtn.startsupport.com/pub/macos/version.json', type: 'app-json' },

  // ---------------- BETA / WEB ----------------
  { key: 'beta-web-viewer', channel: 'beta', group: 'web', platform: 'viewer', label: 'Viewer',
    url: 'https://stbtn.startsupport.com/version.json',
    pageUrl: 'https://stbtn.startsupport.com', type: 'web-viewer' },
  { key: 'beta-web-relay', channel: 'beta', group: 'web', platform: 'relay', label: 'Relay',
    url: 'https://stbtn.113366.com/version.json',
    pageUrl: 'https://stbtn.113366.com', type: 'web-relay' },
  { key: 'beta-web-partneradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'PartnerAdmin',
    url: 'https://stbtnpartners.startsupport.com/version.txt',
    siteUrl: 'https://stbtnpartners.startsupport.com', type: 'admin-txt',
    // 정상 조회되면 version.txt 의 buildNumber / time 을 그대로 사용하고,
    // 1초 안에 못 받거나 조회에 실패하면 아래 fallback 값을 대신 표시한다.
    timeField: 'time', timeMode: 'utc',
    // 경로를 여러 개 시도하므로 이 소스만 제한 시간을 늘린다(다른 소스는 1초 그대로).
    timeoutMs: 2500,
    // 원본 서버가 서버리스 요청을 막으므로 여러 경로를 순서대로 시도한다.
    // 쓰지 않을 경로는 줄을 지우거나 주석 처리하면 건너뛴다.
    sources: [
      // 1) 원본에 직접 요청
      { type: 'direct' },
      // 2) HTTP/1.1 강제 (HTTP/2 협상이나 TLS 특징으로 막는 WAF 우회 시도)
      { type: 'direct-http1' },
      // 3) GitHub Actions 가 주기적으로 받아 저장소에 커밋해 둔 스냅샷 (version-collect.yml)
      //    배포에 함께 올라가므로 디스크에서 바로 읽는다. 네트워크를 타지 않아 가장 빠르고 확실하다.
      { type: 'file', path: 'version-cache/beta-partneradmin.json' },
      // 4) 위 파일을 디스크에서 못 읽는 경우를 대비해 같은 파일을 HTTP 로도 읽어본다
      { type: 'mirror', url: 'https://rc-version-check.vercel.app/version-cache/beta-partneradmin.json' },
      // 5) Cloudflare Worker 중계가 필요하면 주석을 푸세요 (version-proxy-worker.js)
      // { type: 'proxy', url: 'https://version-proxy.<계정>.workers.dev' },
    ],
    fallback: { build: '7', time: '2026-08-06T07:05:40.207Z' },
    // 서버리스 IP가 차단되어 직접 조회가 안 되면 아래 주석을 풀고 Worker 주소를 넣으세요.
    // (version-proxy-worker.js 를 Cloudflare Workers 에 배포한 뒤 그 주소)
    // proxyUrl: 'https://version-proxy.<계정>.workers.dev',
  },
  { key: 'beta-web-useradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'UserAdmin',
    url: 'https://stbtnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stbtnadmin.startsupport.com', type: 'admin-txt',
    // Spring Boot actuator 형식(build.time / build.buildNumber)까지 함께 탐색
    timeField: 'time', timeMode: 'utc',
    allowNodeHttpsFallback: true },
];

// 유일한 타임아웃 설정: 모든 소스가 이 값(1초) 하나만 사용한다.
// 1초 안에 응답이 없으면 그 소스는 값 없이 넘어간다.
const TIMEOUT_MS = 1000;

// 소스에 fallback 이 지정되어 있으면, 조회 실패(타임아웃 포함) 시 이 고정값을 대신 표시한다.
// 코드에 명시된 값이라 함수 재시작(cold start)과 무관하게 항상 동일하게 동작한다.
function buildFallbackResult(src) {
  const date = parseAsUTCDate(src.fallback.time);
  const text = formatKST(date);
  const compare = text ? text.slice(0, 10) : null;
  return {
    key: src.key,
    channel: src.channel,
    group: src.group,
    platform: src.platform,
    label: src.label,
    ok: true,
    build: src.fallback.build,
    updateDateText: text,
    isToday: !!compare && compare === todayKSTDateStr(),
    isFallback: true, // 실제 조회값이 아니라 고정값임을 표시 (화면에는 영향 없음)
    downloadUrl: src.siteUrl || src.url || null,
    downloadLabel: '바로가기',
  };
}

const FETCH_MAX_RETRIES = 0; // 재시도 없이 바로 실패 처리

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

    let settled = false;
    let hardTimer = null;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      fn(arg);
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
        finish(resolve, {
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
      finish(reject, Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    });
    req.on('error', (err) => finish(reject, err));

    // TLS 핸드셰이크 단계에서 멈추는 경우까지 확실히 끊기 위한 보조 타이머
    hardTimer = setTimeout(() => {
      req.destroy();
      finish(reject, Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    }, timeoutMs);

    req.end();
  });
}

async function fetchWithTimeout(url, opts = {}, config = {}) {
  // config로 개별 소스가 기본 타임아웃(1초)/재시도(0회)/https 폴백 여부를 오버라이드할 수 있음
  // 기본값은 재시도/폴백 없이 정확히 timeoutMs에서 바로 실패 처리 (모든 소스 통일)
  const timeoutMs = config.timeoutMs != null ? config.timeoutMs : TIMEOUT_MS;
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
    downloadUrl: src.downloadUrl || j.url || null,
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

// 원본 서버가 서버리스 요청을 막을 때를 대비해 여러 경로를 순서대로 시도한다.
//   direct : 원본 서버에 바로 요청
//   mirror : 다른 곳에서 미리 받아 저장해둔 스냅샷({ body, fetchedAt })을 읽음 (GitHub Actions 등)
//   proxy  : Cloudflare Worker 같은 중계기를 거쳐 요청
async function fetchViaChain(src, bustedUrl, timeoutMs) {
  const errors = [];
  // 전체 소요 시간이 timeoutMs 를 넘지 않도록 경로 수로 시간을 균등하게 나눠 쓴다.
  const share = Math.floor(timeoutMs / src.sources.length);
  const started = Date.now();

  for (const route of src.sources) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 200) {
      errors.push(`${route.type}: 남은 시간이 없어 건너뜀`);
      continue;
    }
    const slice = Math.max(250, Math.min(share, remaining - 100));

    try {
      // direct      : 일반 요청 (HTTP/2 협상)
      // direct-http1 : HTTP/1.1 을 강제한 요청 (HTTP/2 나 TLS 특징으로 막는 WAF 우회용)
      if (route.type === 'direct' || route.type === 'direct-http1') {
        const headers = { Accept: 'application/json, text/plain, */*', 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
        const res = route.type === 'direct-http1'
          ? await fetchViaNodeHttps(bustedUrl, { headers }, slice)
          : await fetchWithTimeout(bustedUrl, { headers }, { timeoutMs: slice, allowNodeHttpsFallback: false });
        if (!res.ok) throw httpStatusError(res.status);
        return await res.text();
      }

      // file : 이 배포에 함께 올라간 스냅샷 파일을 디스크에서 바로 읽는다(네트워크 없음).
      if (route.type === 'file') {
        const fs = require('fs');
        const path = require('path');
        const target = path.join(process.cwd(), route.path);
        const snap = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (!snap || snap.body == null) throw new Error('스냅샷에 body 가 없음');
        return String(snap.body);
      }

      if (route.type === 'mirror') {
        const url = route.url + (route.url.includes('?') ? '&' : '?') + '_=' + Date.now();
        const res = await fetchWithTimeout(url, {}, { timeoutMs: slice });
        if (!res.ok) throw httpStatusError(res.status, '미러 HTTP');
        const snap = await res.json();
        if (!snap || snap.body == null) throw new Error('미러에 body 가 없음');
        if (route.maxAgeMinutes) {
          const age = (Date.now() - new Date(snap.fetchedAt).getTime()) / 60000;
          if (isFinite(age) && age > route.maxAgeMinutes) {
            throw new Error(`미러가 ${Math.round(age)}분 전 값이라 사용하지 않음`);
          }
        }
        return String(snap.body);
      }

      if (route.type === 'proxy') {
        const proxied = route.url + (route.url.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(bustedUrl);
        const res = await fetchWithTimeout(
          proxied,
          { headers: route.key ? { 'x-proxy-key': route.key } : {} },
          { timeoutMs: slice }
        );
        if (!res.ok) throw httpStatusError(res.status, '프록시 HTTP');
        const payload = await res.json();
        if (!payload || payload.ok === false) throw new Error(`프록시 오류: ${(payload && payload.error) || '알 수 없음'}`);
        if (typeof payload.status === 'number' && (payload.status < 200 || payload.status >= 300)) {
          throw httpStatusError(payload.status);
        }
        return String(payload.body != null ? payload.body : '');
      }

      throw new Error(`알 수 없는 경로 타입: ${route.type}`);
    } catch (err) {
      errors.push(`${route.type}: ${err && err.message ? err.message : err}`);
    }
  }

  const e = new Error(`모든 경로 실패 (${errors.join(' / ')})`);
  e.chainErrors = errors;
  throw e;
}


async function fetchAdminTxt(src) {
  const timeoutMs = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
  // 원본 서버나 CDN이 예전 응답을 돌려주지 않도록 매 요청마다 값을 바꿔 붙인다
  const bustedUrl = src.url + (src.url.includes('?') ? '&' : '?') + '_=' + Date.now();

  let text;
  if (src.sources && src.sources.length) {
    // 경로를 순서대로 시도해서 처음 성공한 값을 쓴다
    text = await fetchViaChain(src, bustedUrl, timeoutMs);
  } else if (src.proxyUrl) {
    // 원본 서버가 서버리스 IP를 차단할 때: Cloudflare Worker 등 다른 대역을 거쳐서 가져옴
    // Worker 응답 형식: { ok: true, status: 200, body: "<version.txt 원문>" }
    const proxied = src.proxyUrl + (src.proxyUrl.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(bustedUrl);
    const res = await fetchWithTimeout(
      proxied,
      { headers: src.proxyKey ? { 'x-proxy-key': src.proxyKey } : {} },
      { timeoutMs, maxRetries: 0, allowNodeHttpsFallback: false }
    );
    if (!res.ok) throw httpStatusError(res.status, '프록시 HTTP');
    const payload = await res.json();
    if (!payload || payload.ok === false) {
      throw new Error(`프록시 오류: ${(payload && payload.error) || '알 수 없음'}`);
    }
    if (typeof payload.status === 'number' && (payload.status < 200 || payload.status >= 300)) {
      throw httpStatusError(payload.status);
    }
    text = String(payload.body != null ? payload.body : '');
  } else {
    const res = await fetchWithTimeout(
      bustedUrl,
      { headers: { Accept: 'application/json, text/plain, */*', 'Cache-Control': 'no-cache', Pragma: 'no-cache' } },
      { timeoutMs, allowNodeHttpsFallback: src.allowNodeHttpsFallback === true }
    );
    if (!res.ok) throw httpStatusError(res.status);
    text = await res.text();
  }
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
  // 값을 못 찾았을 때는 원본 응답 일부를 함께 내려줘서 원인을 바로 확인할 수 있게 함
  if (updateDateText === null || build === null) {
    const missing = [];
    if (build === null) missing.push('buildNumber');
    if (updateDateText === null) missing.push(timeField);
    result._debug = {
      reason: `${missing.join(', ')} 값을 찾지 못함`,
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
  const timeoutMs = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
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
    // fallback 이 지정된 소스는 에러 대신 고정값을 표시
    if (src.fallback) {
      return buildFallbackResult(src);
    }

    const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)));
    const effectiveTimeoutMs = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
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

// 하드 데드라인(TIMEOUT_MS)을 넘긴 소스에 대해 내려줄 결과.
// 일반 실패(ok:false)와 형태는 같지만, 사유가 "우리 쪽에서 강제로 끊음"이라는 걸 명확히 구분해서 표시.
function buildHardDeadlineResult(src) {
  // fallback 이 지정된 소스는 하드 데드라인에 걸려도 동일하게 고정값을 표시
  if (src.fallback) {
    return buildFallbackResult(src);
  }


  return {
    key: src.key,
    channel: src.channel,
    group: src.group,
    platform: src.platform,
    label: src.label,
    ok: false,
    error: `응답 지연으로 강제 종료(${src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS}ms 초과)`,
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

// 진단 모드: /api/builds?debug=beta-web-partneradmin
// 해당 소스를 넉넉한 시간(기본 8초)으로 한 번 조회해서 상태코드, 소요 시간, 응답 원문 앞부분을 그대로 보여준다.
// "1초 안에 못 받는 것"인지 "아예 막혀 있는 것"인지 구분하기 위한 용도.
// Vercel 리전 코드 -> 사람이 읽을 수 있는 이름 (자주 쓰는 것만)
const REGION_NAMES = {
  icn1: '서울', hnd1: '도쿄', sin1: '싱가포르', syd1: '시드니', bom1: '뭄바이',
  iad1: '미국 버지니아', sfo1: '미국 샌프란시스코', cle1: '미국 클리블랜드', pdx1: '미국 오리건',
  fra1: '독일 프랑크푸르트', cdg1: '프랑스 파리', arn1: '스웨덴 스톡홀름', dub1: '아일랜드 더블린',
  lhr1: '영국 런던', gru1: '브라질 상파울루', hkg1: '홍콩', kix1: '오사카',
};

// 이 함수가 밖으로 나갈 때 쓰는 IP 를 확인한다. 리전이 실제로 바뀌었는지 판단하는 근거가 된다.
async function checkEgress() {
  try {
    const res = await fetchOnce('https://ipinfo.io/json', { headers: { Accept: 'application/json' } }, 2500);
    if (!res.ok) return { 확인: `조회 실패 (HTTP ${res.status})` };
    const j = await res.json();
    return {
      나가는IP: j.ip || null,
      국가: j.country || null,
      도시: [j.city, j.region].filter(Boolean).join(', ') || null,
      회선: j.org || null,
    };
  } catch (err) {
    return { 확인: `조회 실패 (${err && err.message ? err.message : err})` };
  }
}

// 스냅샷 파일(version-cache/*.json)을 실제로 읽을 수 있는지 확인한다.
// 로컬 수집 스크립트가 파일을 올바른 위치에 올렸는지 판단하는 근거.
function checkSnapshot(src) {
  const route = (src.sources || []).find((r) => r.type === 'file');
  if (!route) return { 사용: '이 소스는 스냅샷 경로를 쓰지 않습니다.' };

  const fs = require('fs');
  const path = require('path');
  const target = path.join(process.cwd(), route.path);

  try {
    const snap = JSON.parse(fs.readFileSync(target, 'utf8'));
    return {
      경로: route.path,
      배포루트: process.cwd(),
      읽기: '성공',
      수집시각: snap.fetchedAt || null,
      원문길이: snap.body ? String(snap.body).length : 0,
      원문앞부분: snap.body ? String(snap.body).slice(0, 200) : null,
    };
  } catch (err) {
    let 폴더목록 = null;
    try { 폴더목록 = fs.readdirSync(process.cwd()); } catch (e) { /* 무시 */ }
    return {
      경로: route.path,
      배포루트: process.cwd(),
      읽기: `실패 (${err && err.message ? err.message : err})`,
      배포루트_안의_항목: 폴더목록,
      안내: 'version-cache 폴더가 배포 루트 안에 있는지 확인하세요. Vercel Root Directory 설정과 파일 위치가 맞아야 합니다.',
    };
  }
}

async function runDiagnostic(key, timeoutMs) {
  const src = SOURCES.find((s) => s.key === key);
  if (!src) {
    return { ok: false, error: `알 수 없는 소스: ${key}`, available: SOURCES.map((s) => s.key) };
  }

  const url = src.url + (src.url.includes('?') ? '&' : '?') + '_=' + Date.now();
  const started = Date.now();
  const attempt = async (label, useNodeHttps) => {
    const t0 = Date.now();
    try {
      const res = useNodeHttps
        ? await fetchViaNodeHttps(url, {}, timeoutMs)
        : await fetchOnce(url, { headers: { Accept: 'application/json, text/plain, */*' } }, timeoutMs);
      const text = await res.text();
      return {
        방식: label,
        결과: res.ok ? '성공' : '실패',
        상태코드: res.status,
        소요시간ms: Date.now() - t0,
        응답길이: text.length,
        응답앞부분: text.slice(0, 500),
      };
    } catch (err) {
      const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)));
      return {
        방식: label,
        결과: isAbort ? `타임아웃(${timeoutMs}ms 안에 응답 없음)` : '오류',
        소요시간ms: Date.now() - t0,
        오류: String(err && err.message ? err.message : err),
        오류코드: (err && (err.code || (err.cause && err.cause.code))) || null,
      };
    }
  };

  const attempts = [await attempt('일반 요청(HTTP/2 협상)', false)];
  if (attempts[0].결과 !== '성공') {
    attempts.push(await attempt('HTTP/1.1 강제', true));
  }

  const success = attempts.find((a) => a.결과 === '성공');
  const region = process.env.VERCEL_REGION || null;

  return {
    ok: true,
    소스: key,
    주소: src.url,
    실행리전: region
      ? `${region} (${REGION_NAMES[region] || '알 수 없는 지역'})`
      : '알 수 없음 (Vercel 환경이 아님)',
    리전설정확인: region === 'icn1'
      ? '서울 리전이 적용되어 있습니다.'
      : `서울(icn1)이 아닙니다. vercel.json 의 regions 설정과 재배포 여부를 확인하세요.`,
    나가는곳: await checkEgress(),
    스냅샷파일: checkSnapshot(src),
    대시보드_타임아웃ms: TIMEOUT_MS,
    전체소요ms: Date.now() - started,
    판정: !success
      ? '응답을 받지 못했습니다. 서버가 막고 있거나 도달할 수 없는 상태입니다.'
      : (success.소요시간ms > TIMEOUT_MS
          ? `응답은 오지만 ${success.소요시간ms}ms 가 걸려 대시보드 제한(${TIMEOUT_MS}ms)을 넘습니다.`
          : '정상입니다. 대시보드 제한 안에서 응답합니다.'),
    시도: attempts,
  };
}

module.exports = async (req, res) => {
  try {
    // 진단 모드 먼저 처리
    const debugKey = req.query && req.query.debug;
    if (debugKey) {
      const timeoutMs = Number((req.query && req.query.timeout) || 8000);
      const result = await runDiagnostic(String(debugKey), timeoutMs);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json(result);
    }

    // 소스 하나하나에 TIMEOUT_MS 강제 컷오프를 적용 -> 무엇이 얼마나 느려지든
    // /api/builds 응답 자체는 절대 TIMEOUT_MS(1초)를 넘기지 않음
    const results = await Promise.all(
      SOURCES.map((src) => {
        const eff = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
        // 경로를 여러 개 시도하는 소스는 마지막 경로가 끝날 여유를 조금 더 준다
        const deadline = src.sources && src.sources.length ? eff + 800 : eff;
        return withHardDeadline(fetchOne(src), deadline, () => buildHardDeadlineResult(src));
      })
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
