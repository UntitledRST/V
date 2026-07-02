// Vercel 서버리스 함수: 브라우저가 아니라 서버에서 실행되므로 CORS 제한이 적용되지 않습니다.
// GET /api/builds 로 호출하면 App(실행파일) + Web(뷰어/호스트) 빌드 정보를 한번에 모아서 반환합니다.

const APP_CHANNELS = {
  alpha: {
    windows: {
      json: "https://stapn.113366.com/pub/windows/version.json",
      download: "https://stapn.113366.com/pub/windows/remotecall-host.exe",
    },
    macos: {
      json: "https://stapn.113366.com/pub/macos/version.json",
      download: "https://stapn.113366.com/pub/macos/remotecall-host.app.zip",
    },
    android: {
      json: "https://stapn.113366.com/pub/android/version.json",
      download: "https://stapn.113366.com/pub/android/remotecall-host.apk",
    },
    ios: {
      json: "https://stapn.113366.com/pub/ios/version.json",
      download: "itms-services://?action=download-manifest&url=https://stapn.113366.com/pub/ios/manifest.plist",
    },
  },
  beta: {
    windows: {
      json: "https://stbtn.113366.com/pub/windows/version.json",
      download: "https://stbtn.113366.com/pub/windows/remotecall-host.exe",
    },
    macos: {
      json: "https://stbtn.113366.com/pub/macos/version.json",
      download: "https://stbtn.113366.com/pub/macos/remotecall-host.app.zip",
    },
    android: {
      json: "https://stbtn.113366.com/pub/android/version.json",
      download: "https://stbtn.113366.com/pub/android/remotecall-host.apk",
    },
    ios: {
      json: "https://stbtn.113366.com/pub/ios/version.json",
      download: "itms-services://?action=download-manifest&url=https://stbtn.113366.com/pub/ios/manifest.plist",
    },
  },
};

const WEB_CHANNELS = {
  alpha: {
    viewer: {
      json: "https://stapn.startsupport.com/version.json",
      page: "https://stapn.startsupport.com",
    },
    host: {
      json: "https://stapn.113366.com/version.json",
      page: "https://stapn.113366.com",
    },
  },
  beta: {
    viewer: {
      json: "https://stbtn.startsupport.com/version.json",
      page: "https://stbtn.startsupport.com",
    },
    host: {
      json: "https://stbtn.113366.com/version.json",
      page: "https://stbtn.113366.com",
    },
  },
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "요청 시간 초과" : String(err.message || err) };
  }
}

// 페이지 HTML을 가져와 <meta name="build-date" content="..."> 값을 추출합니다.
async function fetchBuildDate(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();

    let match =
      html.match(/<meta[^>]*name=["']build-date["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']build-date["'][^>]*>/i);

    if (!match) {
      return { ok: false, error: "build-date 메타태그 없음" };
    }
    return { ok: true, buildDate: match[1] };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "요청 시간 초과" : String(err.message || err) };
  }
}

export default async function handler(req, res) {
  const results = {
    alpha: { app: {}, web: {} },
    beta: { app: {}, web: {} },
  };

  const tasks = [];

  // App 항목: version.json 하나만 있으면 됨
  for (const [channelKey, platforms] of Object.entries(APP_CHANNELS)) {
    for (const [platformKey, cfg] of Object.entries(platforms)) {
      tasks.push(
        fetchJson(cfg.json).then((result) => {
          results[channelKey].app[platformKey] = { ...result, download: cfg.download };
        })
      );
    }
  }

  // Web 항목: version.json + 페이지의 build-date 메타태그 둘 다 필요
  for (const [channelKey, items] of Object.entries(WEB_CHANNELS)) {
    for (const [itemKey, cfg] of Object.entries(items)) {
      tasks.push(
        Promise.all([fetchJson(cfg.json), fetchBuildDate(cfg.page)]).then(([jsonResult, dateResult]) => {
          results[channelKey].web[itemKey] = {
            ...jsonResult,
            buildDate: dateResult.ok ? dateResult.buildDate : null,
            buildDateError: dateResult.ok ? null : dateResult.error,
            open: cfg.page,
          };
        })
      );
    }
  }

  await Promise.all(tasks);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(results);
}
