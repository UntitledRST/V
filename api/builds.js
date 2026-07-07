// /api/builds.js
// Vercel Serverless Function (Node.js runtime)
// - version.json 을 서버 쪽에서 직접 요청하므로 브라우저 CORS 제한이 적용되지 않습니다.
// - App 항목: build/build_number, version, releasedAt(업데이트 시간), 다운로드 URL을 추출합니다.
// - Web 항목: build/build_number 는 version.json 에서, 업데이트 시간은 Viewer 페이지 HTML의
//   <meta name="build-date" content="..."> 또는 releasedAt 값을 찾아 추출합니다. (Host 는 업데이트 시간 미표시)ㅁ//
// ⚠️ 실제 서비스의 version.json / 페이지 구조에 따라 아래 필드명(extractBuild, extractDownloadUrl 등)을
//    조정해야 할 수 있습니다. 알 수 없는 필드는 여러 후보 이름을 순서대로 시도하도록 구성했습니다.

const SOURCES = {
  alpha: {
    app: {
      windows: { json: 'https://stapn.113366.com/pub/windows/version.json' },
      macos:   { json: 'https://stapn.113366.com/pub/macos/version.json' },
      android: { json: 'https://stapn.113366.com/pub/android/version.json' },
      ios:     { json: 'https://stapn.113366.com/pub/ios/version.json' }
    },
    web: {
      viewer: { json: 'https://stapn.startsupport.com/version.json', page: 'https://stapn.startsupport.com' },
      host:   { json: 'https://stapn.113366.com/version.json' }
    }
  },
  beta: {
    app: {
      windows: { json: 'https://stbtn.113366.com/pub/windows/version.json' },
      macos:   { json: 'https://stbtn.113366.com/pub/macos/version.json' },
      android: { json: 'https://stbtn.113366.com/pub/android/version.json' },
      ios:     { json: 'https://stbtn.113366.com/pub/ios/version.json' }
    },
    web: {
      viewer: { json: 'https://stbtn.startsupport.com/version.json', page: 'https://stbtn.startsupport.com' },
      host:   { json: 'https://stbtn.113366.com/version.json' }
    }
  }
};

const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; BuildDashboardBot/1.0; +https://example.com)';

function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promiseFactory(controller.signal).finally(() => clearTimeout(timer));
}

async function fetchJson(url) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, 'Accept': 'application/json,text/plain,*/*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // 응답이 JSON 앞뒤로 불필요한 텍스트를 포함한 경우 대비
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
      }
      throw new Error('JSON 파싱 실패');
    }
  }, FETCH_TIMEOUT_MS);
}

async function fetchText(url) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }, FETCH_TIMEOUT_MS);
}

function extractBuild(data) {
  if (!data || typeof data !== 'object') return null;
  const v = data.build ?? data.build_number ?? data.buildNumber ?? data.buildNo ?? null;
  return v === undefined ? null : v;
}

function extractVersion(data) {
  if (!data || typeof data !== 'object') return null;
  return data.version ?? data.ver ?? null;
}

function extractReleasedAt(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    data.releasedAt ??
    data.released_at ??
    data.updatedAt ??
    data.updated_at ??
    data.buildDate ??
    data.build_date ??
    data.date ??
    null
  );
}

function extractDownloadUrl(data, baseUrl) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [
    data.url,
    data.download_url,
    data.downloadUrl,
    data.file_url,
    data.fileUrl,
    data.package_url,
    data.packageUrl,
    data.installer,
    data.installer_url,
    data.download,
    data.path
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      try {
        return new URL(c, baseUrl).href;
      } catch (e) {
        return c;
      }
    }
  }
  return null;
}

function extractBuildDateFromHtml(html) {
  if (!html) return null;
  let m = html.match(/<meta\s+[^>]*name=["']build-date["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (!m) {
    m = html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']build-date["'][^>]*>/i);
  }
  if (m) return m[1];

  const m2 = html.match(/"releasedAt"\s*:\s*"([^"]+)"/i);
  if (m2) return m2[1];

  return null;
}

async function buildAppItem(cfg) {
  try {
    const data = await fetchJson(cfg.json);
    return {
      build: extractBuild(data),
      version: extractVersion(data),
      updatedAt: extractReleasedAt(data),
      downloadUrl: extractDownloadUrl(data, cfg.json),
      sourceJson: cfg.json,
      error: null
    };
  } catch (err) {
    return {
      build: null,
      version: null,
      updatedAt: null,
      downloadUrl: null,
      sourceJson: cfg.json,
      error: err && err.message ? err.message : 'fetch failed'
    };
  }
}

async function buildWebItem(key, cfg) {
  try {
    const data = await fetchJson(cfg.json);
    const item = {
      build: extractBuild(data),
      version: extractVersion(data),
      updatedAt: null,
      downloadUrl: cfg.page || extractDownloadUrl(data, cfg.json),
      sourceJson: cfg.json,
      error: null
    };

    if (key === 'viewer' && cfg.page) {
      try {
        const html = await fetchText(cfg.page);
        item.updatedAt = extractBuildDateFromHtml(html) || extractReleasedAt(data);
      } catch (e) {
        item.updatedAt = extractReleasedAt(data);
      }
    }
    return item;
  } catch (err) {
    return {
      build: null,
      version: null,
      updatedAt: null,
      downloadUrl: cfg.page || null,
      sourceJson: cfg.json,
      error: err && err.message ? err.message : 'fetch failed'
    };
  }
}

module.exports = async function handler(req, res) {
  try {
    const channels = Object.keys(SOURCES);
    const result = {};

    await Promise.all(
      channels.map(async (ch) => {
        result[ch] = { app: {}, web: {} };

        const appKeys = Object.keys(SOURCES[ch].app);
        await Promise.all(
          appKeys.map(async (key) => {
            result[ch].app[key] = await buildAppItem(SOURCES[ch].app[key]);
          })
        );

        const webKeys = Object.keys(SOURCES[ch].web);
        await Promise.all(
          webKeys.map(async (key) => {
            result[ch].web[key] = await buildWebItem(key, SOURCES[ch].web[key]);
          })
        );
      })
    );

    result.fetchedAt = new Date().toISOString();

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : 'Unknown error' });
  }
};
