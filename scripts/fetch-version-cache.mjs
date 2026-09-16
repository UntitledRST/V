#!/usr/bin/env node
// scripts/fetch-version-cache.mjs
//
// 버전 정보를 주기적으로 내려받아 저장소 안에 스냅샷(JSON)으로 저장합니다.
// GitHub Actions(.github/workflows/version-cache.yml)가 이 스크립트를 실행하고,
// 값이 바뀐 경우에만 커밋합니다.
//
// 저장 형식은 /api/builds.js 의 { type: 'file' } / { type: 'mirror' } 경로가
// 읽는 형식과 동일합니다:  { fetchedAt, status, url, body }
//
// 로컬 실행:  node scripts/fetch-version-cache.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// 수집 대상
// ---------------------------------------------------------------------------
const TARGETS = [
  {
    name: '베타 파트너 어드민',
    url: 'https://stbtn.startsupport.com/version.txt',
    out: 'version/version-cache/beta-partneradmin.json',
  },
];

const TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 수집
// ---------------------------------------------------------------------------
async function fetchOnce(url) {
  const busted = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(busted, {
      headers: HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastErr = err;
      const msg = err && err.message ? err.message : String(err);
      console.log(`  · ${i}번째 시도 실패: ${msg}`);
      if (i < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 검증: 빌드 번호를 뽑을 수 있는 응답만 저장한다
// (에러 페이지나 로그인 리다이렉트 HTML을 캐시로 덮어쓰지 않기 위함)
// ---------------------------------------------------------------------------
function parseKeyValueText(text) {
  const obj = {};
  let matched = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"?([^"\n]*?)"?\s*$/);
    if (m) {
      obj[m[1]] = m[2];
      matched = true;
    }
  }
  return matched ? obj : null;
}

function extractBuild(text) {
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    j = parseKeyValueText(text);
  }
  if (!j || typeof j !== 'object') return null;

  const candidates = [
    j.buildNumber,
    j.build_number,
    j.build && j.build.buildNumber,
    j.build && j.build.build_number,
    j.build && j.build.number,
    typeof j.build === 'string' || typeof j.build === 'number' ? j.build : undefined,
  ];
  for (const c of candidates) {
    if (c !== null && c !== undefined && String(c).trim() !== '') return String(c);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 저장 (내용이 같으면 파일을 건드리지 않아 불필요한 커밋을 막는다)
// ---------------------------------------------------------------------------
async function readSnapshot(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function run() {
  const root = process.cwd();
  let failed = 0;
  let changed = 0;

  for (const target of TARGETS) {
    const outPath = join(root, target.out);
    console.log(`\n[${target.name}] ${target.url}`);

    let result;
    try {
      result = await fetchWithRetry(target.url);
    } catch (err) {
      console.log(`  ✗ 수집 실패: ${err && err.message ? err.message : err} (기존 스냅샷 유지)`);
      failed++;
      continue;
    }

    const build = extractBuild(result.body);
    if (build === null) {
      console.log('  ✗ 응답에서 빌드 번호를 찾지 못해 저장하지 않습니다.');
      console.log(`    응답 앞부분: ${result.body.slice(0, 200).replace(/\s+/g, ' ')}`);
      failed++;
      continue;
    }

    const prev = await readSnapshot(outPath);
    if (prev && String(prev.body) === String(result.body)) {
      console.log(`  = 변경 없음 (빌드 #${build})`);
      continue;
    }

    const snapshot = {
      fetchedAt: new Date().toISOString(),
      status: result.status,
      url: target.url,
      body: result.body,
    };

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    console.log(`  ✓ 갱신 완료 → ${target.out} (빌드 #${build})`);
    changed++;
  }

  console.log(`\n요약: 갱신 ${changed}건, 실패 ${failed}건`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
