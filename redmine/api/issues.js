// /api/issues.js
// Redmine에서 이슈를 가져와 필터링하고, 대시보드에 필요한 모든 집계를 계산해서 반환하는 서버리스 함수

const BASE_URL = 'https://projects.rsupport.com/projects/rc8_lite/issues.json';
const API_KEY = 'c54ea549f0554f040d4088feaae8b55af13d2807';
const TITLE_PREFIX = '[saas_8.0.1_qa]';
const TRACKER_KEYWORDS = ['업무', '기능', '개선', '결함', '지원'];
const NOT_DONE_KEYWORDS = ['신규', '진행', '피드백'];
const DONE_KEYWORDS = ['해결', '완료성공', '중단', '완료실패'];
const STATUS_ORDER = ['신규', '진행', '보류', '해결', '피드백', '완료성공', '중단', '완료실패'];
const TRACKER_ORDER = ['업무', '기능', '개선', '결함', '지원'];
const PRIORITY_ORDER = ['낮음', '보통', '높음', '긴급', '즉시'];
const FETCH_TIMEOUT_MS = 8000;

function containsAny(text, keywords) {
  text = text || '';
  return keywords.some((kw) => text.indexOf(kw) !== -1);
}

function convertToKST(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllIssues() {
  const pageSize = 100;
  let offset = 0;
  let all = [];
  while (true) {
    const url = `${BASE_URL}?key=${API_KEY}&status_id=*&limit=${pageSize}&offset=${offset}`;
    const json = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    const issues = json.issues || [];
    if (issues.length === 0) break;
    all = all.concat(issues);
    offset += pageSize;
    if (issues.length < pageSize) break;
  }
  return all;
}

function buildIssueList(rawIssues) {
  const filtered = rawIssues.filter((issue) => {
    const subject = (issue.subject || '').toLowerCase();
    if (subject.indexOf(TITLE_PREFIX) !== 0) return false;
    const tracker = (issue.tracker && issue.tracker.name) || '';
    const status = (issue.status && issue.status.name) || '';
    const trackerMatch = TRACKER_KEYWORDS.some((kw) => tracker.indexOf(kw) !== -1);
    const isEndSuccess = status.indexOf('완료성공') !== -1;
    return trackerMatch || isEndSuccess;
  });

  return filtered.map((issue, i) => ({
    번호: i + 1,
    일감번호: issue.id,
    분류: (issue.tracker && issue.tracker.name) || '',
    상태: (issue.status && issue.status.name) || '',
    제목: issue.subject || '',
    우선순위: (issue.priority && issue.priority.name) || '',
    담당자: (issue.assigned_to && issue.assigned_to.name) || '',
    created_on: issue.created_on ? convertToKST(issue.created_on) : null,
    link: `https://projects.rsupport.com/issues/${issue.id}`,
  }));
}

function buildSummary(issues) {
  // 완료율
  const notDone = issues.filter((it) => containsAny(it.상태, NOT_DONE_KEYWORDS)).length;
  const done = issues.filter((it) => containsAny(it.상태, DONE_KEYWORDS)).length;
  const completion = { notDone, done, total: notDone + done };

  // 담당자별집계
  const byAssignee = {};
  issues.forEach((it) => {
    const name = it.담당자 || '(미배정)';
    if (!byAssignee[name]) byAssignee[name] = { total: 0, done: 0 };
    byAssignee[name].total++;
    if (!containsAny(it.상태, NOT_DONE_KEYWORDS)) byAssignee[name].done++;
  });
  const assignees = Object.keys(byAssignee)
    .sort()
    .map((name) => {
      const v = byAssignee[name];
      const rate = v.total === 0 ? 0 : Math.floor((v.done / v.total) * 100);
      return { name, total: v.total, done: v.done, complete: v.total === v.done, rate };
    });

  // 일감추적(분류별)
  const byTracker = {};
  const trackerLabel = {};
  issues.forEach((it) => {
    const key = TRACKER_ORDER.find((kw) => it.분류.indexOf(kw) !== -1);
    if (!key) return;
    if (!byTracker[key]) byTracker[key] = { progress: 0, done: 0 };
    trackerLabel[key] = it.분류;
    if (containsAny(it.상태, NOT_DONE_KEYWORDS)) byTracker[key].progress++;
    else byTracker[key].done++;
  });
  const trackers = TRACKER_ORDER.filter((k) => byTracker[k]).map((key) => {
    const v = byTracker[key];
    return { label: trackerLabel[key] || key, progress: v.progress, done: v.done, total: v.progress + v.done };
  });

  // 상태별집계
  const byStatus = {};
  issues.forEach((it) => {
    STATUS_ORDER.forEach((s) => {
      if (it.상태.indexOf(s) !== -1) byStatus[s] = (byStatus[s] || 0) + 1;
    });
  });
  const statuses = STATUS_ORDER.map((s) => ({ label: s, count: byStatus[s] || 0 }));

  // 우선순위별집계
  const byPriority = {};
  issues.forEach((it) => {
    PRIORITY_ORDER.forEach((p) => {
      if (it.우선순위.indexOf(p) !== -1) byPriority[p] = (byPriority[p] || 0) + 1;
    });
  });
  const priorities = PRIORITY_ORDER.map((p) => ({ label: p, count: byPriority[p] || 0 }));

  // 날짜별 누적 이슈/해결/처리율
  const byDate = {};
  issues.forEach((it) => {
    if (!it.created_on) return;
    const dateOnly = it.created_on.substring(0, 10);
    if (!byDate[dateOnly]) byDate[dateOnly] = { newCount: 0, doneCount: 0 };
    byDate[dateOnly].newCount++;
    if (containsAny(it.상태, DONE_KEYWORDS)) byDate[dateOnly].doneCount++;
  });
  const sortedDates = Object.keys(byDate).sort();
  let cumIssue = 0;
  let cumDone = 0;
  const timeline = sortedDates.map((d) => {
    cumIssue += byDate[d].newCount;
    cumDone += byDate[d].doneCount;
    const rate = cumIssue === 0 ? 0 : Math.round((cumDone / cumIssue) * 100);
    return { date: d, cumIssue, cumDone, rate };
  });

  return { completion, assignees, trackers, statuses, priorities, timeline };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const rawIssues = await fetchAllIssues();
    const issues = buildIssueList(rawIssues);
    const summary = buildSummary(issues);
    res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: issues.length,
      issues,
      summary,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String((err && err.message) || err),
    });
  }
};
