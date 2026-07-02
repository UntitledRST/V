// Vercel 서버리스 함수: 브라우저가 아니라 서버에서 실행되므로 CORS 제한이 적용되지 않습니다.
// GET /api/builds 로 호출하면 8개 채널/플랫폼의 버전 정보를 한번에 모아서 반환합니다.

const CHANNELS = {
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

async function fetchOne(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "요청 시간 초과" : String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const results = { alpha: {}, beta: {} };

  const tasks = [];
  for (const [channelKey, platforms] of Object.entries(CHANNELS)) {
    for (const [platformKey, cfg] of Object.entries(platforms)) {
      tasks.push(
        fetchOne(cfg.json).then((result) => {
          results[channelKey][platformKey] = { ...result, download: cfg.download };
        })
      );
    }
  }

  await Promise.all(tasks);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(results);
}
