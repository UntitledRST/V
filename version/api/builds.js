// /api/builds.js
// 서버리스 함수: 각 버전 소스에서 서버 사이드로 직접 데이터를 가져와 정규화한 뒤
// 브라우저로 내려줍니다. 서버 -> 원본 서버 요청이므로 브라우저 CORS 제한을 받지 않습니다.
// Vercel Node.js 서버리스 함수 형식 (Node 18+ 전역 fetch 사용)

const SOURCES = [
  // ---------------- ALPHA / APP (Host) ----------------
  { key: 'alpha-app-windows', channel: 'alpha', group: 'app-host', platform: 'windows', label: 'Win',
    url: 'https://stapn.113366.com/pub/windows/version.json', type: 'app-json',
    downloadUrl: 'https://stapn.113366.com/pub/windows/remotecall-host.exe' },
  { key: 'alpha-app-macos', channel: 'alpha', group: 'app-host', platform: 'macos', label: 'macOS',
    url: 'https://stapn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'alpha-app-android', channel: 'alpha', group: 'app-host', platform: 'android', label: 'Android',
    url: 'https://stapn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'alpha-app-ios', channel: 'alpha', group: 'app-host', platform: 'ios', label: 'iOS',
    url: 'https://stapn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- ALPHA / APP (Viewer) ----------------
  { key: 'alpha-appviewer-windows', channel: 'alpha', group: 'app-viewer', platform: 'windows', label: 'Win',
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
  { key: 'alpha-web-partneradmin', channel: 'alpha', group: 'web', platform: 'admin', label: 'Partner\nAdmin',
    url: 'https://stapnpartners.startsupport.com/version.txt',
    siteUrl: 'https://stapnpartners.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },
  { key: 'alpha-web-useradmin', channel: 'alpha', group: 'web', platform: 'admin', label: 'User\nAdmin',
    url: 'https://stapnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stapnadmin.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },


  // ---------------- ALPHA / API SERVER ----------------
  { key: 'alpha-api-server', channel: 'alpha', group: 'api-server', platform: 'server', label: 'Service',
    url: 'https://stapn.startsupport.com/version.txt',
    type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },
  // ---------------- BETA / APP (Host) ----------------
  { key: 'beta-app-windows', channel: 'beta', group: 'app-host', platform: 'windows', label: 'Win',
    url: 'https://stbtn.113366.com/pub/windows/version.json', type: 'app-json' },
  { key: 'beta-app-macos', channel: 'beta', group: 'app-host', platform: 'macos', label: 'macOS',
    url: 'https://stbtn.113366.com/pub/macos/version.json', type: 'app-json' },
  { key: 'beta-app-android', channel: 'beta', group: 'app-host', platform: 'android', label: 'Android',
    url: 'https://stbtn.113366.com/pub/android/version.json', type: 'app-json' },
  { key: 'beta-app-ios', channel: 'beta', group: 'app-host', platform: 'ios', label: 'iOS',
    url: 'https://stbtn.113366.com/pub/ios/version.json', type: 'app-json' },

  // ---------------- BETA / APP (Viewer) ----------------
  { key: 'beta-appviewer-windows', channel: 'beta', group: 'app-viewer', platform: 'windows', label: 'Win',
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
  { key: 'beta-web-partneradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'Partner\nAdmin',
    url: 'https://stbtnpartners.startsupport.com/version.txt',
    siteUrl: 'https://stbtnpartners.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc',
    timeoutMs: 2500,
    sources: [
      // 0) version.json 에서 직접 불러오기 (1순위)
      { type: 'direct', url: 'https://stbtnpartners.startsupport.com/version.json' },
      // 1) 원본 version.txt 에 직접 요청
      { type: 'direct' },
      // 2) HTTP/1.1 강제
      { type: 'direct-http1' },
      // 3) GitHub Actions 가 주기적으로 받아 저장소에 커밋해 둔 스냅샷
      //    ↓ 경로 수정: version/version-cache/beta-partneradmin.json
      { type: 'file', path: 'version/version-cache/beta-partneradmin.json' },
      // 4) 위 파일을 디스크에서 못 읽는 경우를 대비해 같은 파일을 HTTP 로도 읽어본다
      { type: 'mirror', url: 'https://rc-version-check.vercel.app/version-cache/beta-partneradmin.json' },
      // 5) Cloudflare Worker 중계가 필요하면 주석을 푸세요 (version-proxy-worker.js)
      // { type: 'proxy', url: 'https://version-proxy.<계정>.workers.dev' },
    ],
    // ↓ fallback 값 최신으로 업데이트
    fallback: { build: '10', time: '2026-08-13T06:41:29.728Z' },
  },
  { key: 'beta-web-useradmin', channel: 'beta', group: 'web', platform: 'admin', label: 'User\nAdmin',
    url: 'https://stbtnadmin.startsupport.com/version.txt',
    siteUrl: 'https://stbtnadmin.startsupport.com', type: 'admin-txt',
    timeField: 'time', timeMode: 'utc',
    allowNodeHttpsFallback: true },
];

  // ---------------- BETA / API SERVER ----------------
  { key: 'beta-api-server', channel: 'beta', group: 'api-server', platform: 'server', label: 'Service',
    url: 'https://stbtn.startsupport.com/version.txt',
    type: 'admin-txt',
    timeField: 'time', timeMode: 'utc' },

// 유일한 타임아웃 설정: 모든 소스가 이 값(1초) 하나만 사용한다.
const TIMEOUT_MS = 1000;

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
    isFallback: true,
    downloadUrl: src.siteUrl || src.url || null,
    downloadLabel: '바로가기',
  };
}

const FETCH_MAX_RETRIES = 0;

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

const BROWSER_LIKE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
  'Upgrade-Insecure-Requests': '1',
};

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
      ALPNProtocols: ['http/1.1'],
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

    hardTimer = setTimeout(() => {
      req.destroy();
      finish(reject, Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    }, timeoutMs);

    req.end();
  });
}

async function fetchWithTimeout(url, opts = {}, config = {}) {
  const timeoutMs = config.timeoutMs != null ? config.timeoutMs : TIMEOUT_MS;
  const maxRetries = config.maxRetries != null ? config.maxRetries : FETCH_MAX_RETRIES;
  const allowNodeHttpsFallback = config.allowNodeHttpsFallback === true;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOnce(url, opts, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }
  if (!allowNodeHttpsFallback) throw lastErr;
  try {
    return await fetchViaNodeHttps(url, opts, timeoutMs);
  } catch (fallbackErr) {
    throw lastErr || fallbackErr;
  }
}

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
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(iso + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

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

function stripTZSuffix(raw) {
  if (!raw) return null;
  return raw.replace(/\s*(KST|UTC|GMT[+-]?\d*)\s*$/i, '').trim();
}

function isPrimitiveValue(v) {
  return v !== null && v !== undefined && (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '';
}

function httpStatusError(status, messagePrefix) {
  const e = new Error((messagePrefix || 'HTTP') + ' ' + status);
  e.status = status;
  return e;
}

const GATEWAY_STATUS_CODES = [502, 503, 504, 520, 521, 522, 523, 524];
const GATEWAY_NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_SOCKET'];

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

async function fetchViaChain(src, bustedUrl, timeoutMs) {
  const errors = [];
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
      if (route.type === 'direct' || route.type === 'direct-http1') {
        const headers = { Accept: 'application/json, text/plain, */*', 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
        const res = route.type === 'direct-http1'
          ? await fetchViaNodeHttps(bustedUrl, { headers }, slice)
          : await fetchWithTimeout(bustedUrl, { headers }, { timeoutMs: slice, allowNodeHttpsFallback: false });
        if (!res.ok) throw httpStatusError(res.status);
        return await res.text();
      }

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
  const bustedUrl = src.url + (src.url.includes('?') ? '&' : '?') + '_=' + Date.now();

  let text;
  if (src.sources && src.sources.length) {
    text = await fetchViaChain(src, bustedUrl, timeoutMs);
  } else if (src.proxyUrl) {
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
  if (build === null) {
    build = findBuildNumberDeep(j, 2);
  }

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

async function fetchAdminHead(src) {
  const timeoutMs = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
  let lastModifiedRaw = null;

  if (src.proxyUrl) {
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
    const res = await fetchWithTimeout(
      src.url,
      { method: 'GET' },
      { timeoutMs, maxRetries: 0, allowNodeHttpsFallback: true }
    );
    if (!res.ok) throw httpStatusError(res.status);
    lastModifiedRaw = res.headers.get('last-modified');
  }

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
      || html.match(/meta-build-date:\s*(.+)/i);
    if (m) {
      const raw = stripTZSuffix(m[1]);
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

  let updateDateText = null;
  let updateDateForCompare = null;
  let metaFound = false;
  if (pageRes && pageRes.ok) {
    const html = await pageRes.text();
    const m = html.match(/<meta[^>]+name=["']build-date["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/meta-build-date:\s*(.+)/i);
    if (m) {
      const raw = stripTZSuffix(m[1]);
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
      staticNote: src.staticNote || null,
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
    if (data._debug) out._debug = data._debug;

    return out;
  } catch (err) {
    if (src.fallback) {
      return buildFallbackResult(src);
    }

    const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)));
    const effectiveTimeoutMs = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
    const errorMessage = isAbort
      ? `타임아웃: ${effectiveTimeoutMs / 1000}초 응답 없음`
      : String(err && err.message ? err.message : err);

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

function buildHardDeadlineResult(src) {
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
    possibleDeployIssue: true,
    build: null,
    updateDateText: null,
    isToday: false,
    downloadUrl: src.siteUrl || src.pageUrl || src.url || null,
    downloadLabel: src.type === 'app-json' ? '다운로드' : '바로가기',
  };
}

const REGION_NAMES = {
  icn1: '서울', hnd1: '도쿄', sin1: '싱가포르', syd1: '시드니', bom1: '뭄바이',
  iad1: '미국 버지니아', sfo1: '미국 샌프란시스코', cle1: '미국 클리블랜드', pdx1: '미국 오리건',
  fra1: '독일 프랑크푸르트', cdg1: '프랑스 파리', arn1: '스웨덴 스톡홀름', dub1: '아일랜드 더블린',
  lhr1: '영국 런던', gru1: '브라질 상파울루', hkg1: '홍콩', kix1: '오사카',
};

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
    try { 폴더목록 = require('fs').readdirSync(process.cwd()); } catch (e) { /* 무시 */ }
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
    const debugKey = req.query && req.query.debug;
    if (debugKey) {
      const timeoutMs = Number((req.query && req.query.timeout) || 8000);
      const result = await runDiagnostic(String(debugKey), timeoutMs);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json(result);
    }

    const results = await Promise.all(
      SOURCES.map((src) => {
        const eff = src.timeoutMs != null ? src.timeoutMs : TIMEOUT_MS;
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
