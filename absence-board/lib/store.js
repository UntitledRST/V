// 구독 정보와 수집 스냅샷을 보관합니다.
// Vercel KV(Upstash Redis)가 연결돼 있으면 그쪽에, 없으면 메모리에 저장합니다.
// 메모리 저장은 서버리스 인스턴스가 재활용되면 사라지므로 실서비스에서는 KV를 연결하세요.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasKV = Boolean(URL_ && TOKEN);

const memory = new Map();

async function command(args) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`KV ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.result;
}

export async function getJSON(key, fallback = null) {
  try {
    if (!hasKV) return memory.has(key) ? memory.get(key) : fallback;
    const raw = await command(['GET', key]);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error('store.getJSON', key, err.message);
    return fallback;
  }
}

export async function setJSON(key, value) {
  if (!hasKV) {
    memory.set(key, value);
    return true;
  }
  await command(['SET', key, JSON.stringify(value)]);
  return true;
}

export const KEYS = {
  subscriptions: 'absence:subscriptions',
  snapshot: 'absence:snapshot',
  sentLog: 'absence:sent',
};
