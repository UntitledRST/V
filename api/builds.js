// builds.js
// /api/builds 서버리스 함수를 호출하여 빌드 정보를 표시합니다.

const API_URL = "/api/builds";
const STORAGE_PREFIX = "bdash_v1_";

// 카드 정의: 표시 순서, 라벨, 아이콘, 바로가기 오버라이드 링크
const CARD_DEFS = {
  alpha: {
    app: [
      { key: "windows", label: "Windows", icon: "W" },
      { key: "macos", label: "macOS", icon: "M" },
      { key: "android", label: "Android", icon: "A" },
      { key: "ios", label: "iOS", icon: "i" },
    ],
    web: [
      { key: "viewer", label: "Viewer", icon: "V", linkOverride: "https://stapn.startsupport.com" },
      { key: "relay", label: "Relay", icon: "R", linkOverride: "https://stapn.113366.com/vp" },
    ],
  },
  beta: {
    app: [
      { key: "windows", label: "Windows", icon: "W" },
      { key: "macos", label: "macOS", icon: "M" },
      { key: "android", label: "Android", icon: "A" },
      { key: "ios", label: "iOS", icon: "i" },
    ],
    web: [
      { key: "viewer", label: "Viewer", icon: "V", linkOverride: "https://stbtn.startsupport.com" },
      { key: "relay", label: "Relay", icon: "R", linkOverride: "https://stbtn.113366.com/vp" },
    ],
  },
};

const CHANNEL_META = {
  alpha: { badgeClass: "alpha", badgeText: "ALPHA", koName: "알파 채널" },
  beta: { badgeClass: "beta", badgeText: "BETA", koName: "베타 채널" },
};

let autoRefreshTimer = null;

/* ---------- 유틸 ---------- */

function pad(n) { return String(n).padStart(2, "0"); }

// 현재 시각 -> "yyyy-mm-dd hh:mm:ss" (KST 고정, 브라우저 타임존 무관)
function nowKstString() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// 현재 날짜 -> "yyyy-mm-dd" (KST 고정)
function todayKstDate() {
  return nowKstString().slice(0, 10);
}

function dateOnly(str) {
  if (!str) return null;
  return str.slice(0, 10);
}

// v8.0.1 같은 버전 문자열이 텍스트에 섞여 있으면 제거 (안전장치)
function stripVersionString(text) {
  if (!text) return text;
  return String(text).replace(/v?\d+\.\d+\.\d+/gi, "").trim();
}

/* ---------- localStorage 기반 "오늘 업데이트 횟수" 추적 ---------- */

function trackUpdateCount(cardId, currentBuild, today) {
  const key = STORAGE_PREFIX + cardId;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    stored = null;
  }

  if (currentBuild === null || currentBuild === undefined) {
    return stored && stored.date === today ? stored.count : 0;
  }

  if (!stored || stored.date !== today) {
    stored = { date: today, build: currentBuild, count: 0 };
  } else if (String(stored.build) !== String(currentBuild)) {
    stored = { date: today, build: currentBuild, count: stored.count + 1 };
  }

  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch (e) {
    /* ignore quota errors */
  }

  return stored.count;
}

/* ---------- 카드 렌더링 ---------- */

function renderCard(channel, section, def, data) {
  const cardId = `${channel}_${section}_${def.key}`;
  const today = todayKstDate();

  const build = data ? data.build : null;
  const updatedAt = data ? data.updatedAt : null; // relay는 항상 null
  const url = data ? data.url : null;

  const updateCount = trackUpdateCount(cardId, build, today);

  let isUpdatedToday = false;
  if (updatedAt) {
    isUpdatedToday = dateOnly(updatedAt) === today;
  } else if (section === "web" && def.key === "relay") {
    // Relay는 타임스탬프가 없으므로 오늘 감지된 변경 횟수로 판단
    isUpdatedToday = updateCount > 0;
  }

  const buildText = build !== null && build !== undefined && build !== ""
    ? `#${stripVersionString(String(build))}`
    : "—";

  const showUpdateLine = !(section === "web" && def.key === "relay");
  const updateLineHtml = showUpdateLine
    ? `<div class="update-text">업데이트: <span class="u-date">${updatedAt ? stripVersionString(updatedAt) : "정보 없음"}</span></div>`
    : `<div class="update-text">&nbsp;</div>`;

  const isDownload = section === "app";
  const btnLabel = isDownload ? "다운로드" : "바로가기";
  const linkHref = isDownload ? url : (def.linkOverride || url);
  const btnDisabledClass = linkHref ? "" : " disabled";

  const btnIconSvg = isDownload
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>`;

  return `
    <div class="card${isUpdatedToday ? " updated-today" : ""}" data-card-id="${cardId}">
      ${updateCount > 0 ? `<span class="update-badge">+${updateCount}</span>` : ""}
      <div class="card-head">
        <span class="icon-badge">${def.icon}</span>
        <span class="card-name">${def.label}</span>
        <span class="status-dot"></span>
      </div>
      <div class="build-number">${buildText}</div>
      <div class="build-label">현재 빌드</div>
      ${updateLineHtml}
      <div class="spacer"></div>
      <a class="action-btn${btnDisabledClass}" href="${linkHref || "#"}" target="_blank" rel="noopener noreferrer">
        ${btnIconSvg}<span>${btnLabel}</span>
      </a>
    </div>
  `;
}

function renderChannel(channel, channelData) {
  const meta = CHANNEL_META[channel];
  const defs = CARD_DEFS[channel];

  const appCards = defs.app
    .map((def) => renderCard(channel, "app", def, channelData ? channelData.app[def.key] : null))
    .join("");

  const webCards = defs.web
    .map((def) => renderCard(channel, "web", def, channelData ? channelData.web[def.key] : null))
    .join("");

  return `
    <div class="channel-block">
      <div class="channel-heading">
        <span class="badge ${meta.badgeClass}">${meta.badgeText}</span>
        <span class="ko-name">${meta.koName}</span>
      </div>
      <div class="channel-row">
        <div class="panel app-panel">
          <div class="panel-label app">App</div>
          <div class="cards-grid">${appCards}</div>
        </div>
        <div class="panel web-panel">
          <div class="panel-label web">Web</div>
          <div class="cards-grid">${webCards}</div>
        </div>
      </div>
    </div>
  `;
}

function renderAll(data) {
  const container = document.getElementById("channels");
  container.innerHTML =
    renderChannel("alpha", data ? data.alpha : null) +
    renderChannel("beta", data ? data.beta : null);
}

/* ---------- 데이터 페치 ---------- */

async function fetchBuilds() {
  const btn = document.getElementById("refreshBtn");
  btn.classList.add("spinning");
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("API 오류: " + res.status);
    const data = await res.json();
    renderAll(data);
    document.getElementById("lastRefreshValue").textContent = nowKstString();
  } catch (e) {
    console.error(e);
    document.getElementById("lastRefreshValue").textContent = nowKstString() + " (실패)";
  } finally {
    setTimeout(() => btn.classList.remove("spinning"), 400);
  }
}

/* ---------- 자동 새로고침 ---------- */

function setupAutoRefresh() {
  const select = document.getElementById("autoRefreshSelect");
  const savedInterval = localStorage.getItem(STORAGE_PREFIX + "autorefresh") || "0";
  select.value = savedInterval;
  applyAutoRefresh(parseInt(savedInterval, 10));

  select.addEventListener("change", () => {
    const seconds = parseInt(select.value, 10);
    localStorage.setItem(STORAGE_PREFIX + "autorefresh", String(seconds));
    applyAutoRefresh(seconds);
  });
}

function applyAutoRefresh(seconds) {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (seconds > 0) {
    autoRefreshTimer = setInterval(fetchBuilds, seconds * 1000);
  }
}

/* ---------- 초기화 ---------- */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn").addEventListener("click", fetchBuilds);
  setupAutoRefresh();
  fetchBuilds();
});
