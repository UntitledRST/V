// api/builds.js
// -----------------------------------------------------------------------
// Vercel(Node.js) 서버리스 함수
// 브라우저가 아닌 서버(이 함수)가 직접 각 version.json / 페이지를 요청하므로
// 브라우저의 CORS 제한을 받지 않습니다.
// -----------------------------------------------------------------------

const APP_PLATFORMS = ["windows", "macos", "android", "ios"];
const FETCH_TIMEOUT_MS = 8000;

const CONFIG = {
  alpha: {
    app: {
      windows: "https://stapn.113366.com/pub/windows/version.json",
      macos: "https://stapn.113366.com/pub/macos/version.json",
      android: "https://stapn.113366.com/pub/android/version.json",
      ios: "https://stapn.113366.com/pub/ios/version.json",
    },
    web: {
      viewer: {
        json: "https://stapn.startsupport.com/version.json",
        page: "https://stapn.startsupport.com",
      },
      relay: {
        json: "https://stapn.113366.com/version.json",
        shortcut: "https://stapn.113366.com/vp",
      },
    },
  },
  beta: {
    app: {
      windows: "https://stbtn.113366.com/pub/windows/version.json",
      macos: "https://stbtn.113366.com/pub/macos/version.json",
      android: "https://stbtn.113366.com/pub/android/version.json",
      ios: "https://stbtn.113366.com/pub/ios/version.json",
    },
    web: {
      viewer: {
        json: "https://stbtn.startsupport.com/version.json",
        page: "https://stbtn.startsupport.com",
      },
      relay: {
        json: "https://stbtn.113366.com/version.json",
        shortcut: "https://stbtn.113366.com/vp",
      },
    },
  },
};

function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { cache: "no-store", signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 뷰어 페이지 HTML에서 <meta name="build-date" content="..."> 값을 추출
async function fetchBuildDateMeta(pageUrl) {
  const res = await fetchWithTimeout(pageUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m =
    html.match(/<meta[^>]+name=["']build-date["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']build-date["']/i);
  return m ? m[1].trim() : null; // 예: "2026-06-24 18:56:16 KST"
}

// "2026-06-24 18:56:16 KST" -> ISO(+09:00) 문자열로 정규화
function parseKstString(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/KST/i, "").trim();
  const iso = cleaned.replace(" ", "T") + "+09:00";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadAppPlatform(url) {
  try {
    const data = await fetchJson(url);
    return {
      ok: true,
      build: data.build ?? data.build_number ?? null,
      version: data.version ?? null,
      releasedAt: data.releasedAt ?? null,
      downloadUrl: data.url ?? null,
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function loadViewer(cfg) {
  const [jsonResult, dateResult] = await Promise.allSettled([
    fetchJson(cfg.json),
    fetchBuildDateMeta(cfg.page),
  ]);

  if (jsonResult.status !== "fulfilled") {
    return { ok: false, error: String((jsonResult.reason && jsonResult.reason.message) || jsonResult.reason) };
  }
  const data = jsonResult.value;
  const rawDate = dateResult.status === "fulfilled" ? dateResult.value : null;

  return {
    ok: true,
    build: data.build_number ?? data.build ?? null,
    version: data.version ?? null,
    updatedAt: parseKstString(rawDate),
    shortcutUrl: cfg.page,
  };
}

async function loadRelay(cfg) {
  try {
    const data = await fetchJson(cfg.json);
    return {
      ok: true,
      build: data.build_number ?? data.build ?? null,
      version: data.version ?? null,
      shortcutUrl: cfg.shortcut,
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

module.exports = async (req, res) => {
  try {
    const result = {};

    for (const channelKey of Object.keys(CONFIG)) {
      const channelCfg = CONFIG[channelKey];

      const appEntries = await Promise.all(
        APP_PLATFORMS.map(async (platform) => [
          platform,
          await loadAppPlatform(channelCfg.app[platform]),
        ])
      );

      const [viewer, relay] = await Promise.all([
        loadViewer(channelCfg.web.viewer),
        loadRelay(channelCfg.web.relay),
      ]);

      result[channelKey] = {
        app: Object.fromEntries(appEntries),
        web: { viewer, relay },
      };
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      channels: result,
    });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
