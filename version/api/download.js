// /api/download.js
// 원본 파일 서버가 Content-Type / Content-Disposition 을 제대로 주지 않으면
// 브라우저가 설치 파일(.dmg, .exe 등)을 저장하지 않고 화면에 텍스트로 렌더링해버린다.
// 이 중계는 응답 본문은 그대로 스트리밍하고 헤더만 교체해서 항상 저장 창이 뜨게 만든다.
//
// Edge 런타임을 쓰는 이유:
//   Node 서버리스 함수는 응답 본문이 4.5MB 로 제한되어 87MB 짜리 dmg 를 통과시킬 수 없다.
//   Edge 는 스트리밍이라 용량 제한이 없다.

export const config = { runtime: 'edge' };

// 오픈 프록시가 되는 것을 막기 위한 화이트리스트. 반드시 유지할 것.
// 현재 중계를 사용하는 항목은 베타 App(Viewer) macOS 하나뿐이므로 해당 호스트만 허용한다.
// 다른 항목도 중계를 태우려면 여기에 호스트를 추가하고
// index.html 의 PROXY_DOWNLOAD_KEYS 에 소스 key 를 넣으면 된다.
const ALLOWED_HOSTS = [
  'stbtn.startsupport.com',
];

export default async function handler(req) {
  const raw = new URL(req.url).searchParams.get('url');
  if (!raw) {
    return new Response('url 파라미터가 필요합니다.', { status: 400 });
  }

  let target;
  try {
    target = new URL(raw);
  } catch (e) {
    return new Response('잘못된 URL 입니다.', { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol) || !ALLOWED_HOSTS.includes(target.hostname)) {
    return new Response('허용되지 않은 주소입니다.', { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), { redirect: 'follow', cache: 'no-store' });
  } catch (err) {
    return new Response(
      '원본 서버에 연결하지 못했습니다: ' + (err && err.message ? err.message : err),
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return new Response('원본 서버 오류: HTTP ' + upstream.status, { status: 502 });
  }

  // 경로 마지막 조각을 파일명으로 사용. 헤더 인젝션 방지를 위해 안전한 문자만 남긴다.
  let filename = 'download';
  try {
    filename = decodeURIComponent(target.pathname.split('/').pop() || '') || 'download';
  } catch (e) {
    filename = target.pathname.split('/').pop() || 'download';
  }
  filename = filename.replace(/[^\w.\-]/g, '_');

  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + filename + '"',
    'Cache-Control': 'no-store',
  });

  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new Response(upstream.body, { status: 200, headers });
}
