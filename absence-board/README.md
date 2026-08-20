# 부재자 보드

Cube 부재자 현황을 달력으로 보고, 지정한 사람만 걸러 보고, 정한 시간에 메일로 받는 보드입니다.
Vercel 에 그대로 올리면 동작합니다.

```
index.html                 달력 · 사람 필터 · 알림 설정 화면
api/absences.js            부재 데이터 조회
api/ingest.js              사내 수집기가 데이터를 올리는 곳
api/subscribe.js           메일 알림 저장 / 조회 / 삭제
api/notify.js              메일 발송 (Cron + 미리보기)
lib/cube.js                Cube 응답을 공통 형태로 변환
lib/store.js               Vercel KV 저장소
lib/mail.js                Resend 메일 발송
collector/push_absences.py 사내 PC 용 수집기
vercel.json                Cron 설정
```

---

## 먼저 알아둘 것 — Cube 인증

`https://cube.rsup.io/hr/notin/list` 는 사내 SSO 뒤에 있습니다.
Vercel 서버는 사내 세션이 없어서 이 주소를 그냥 부를 수 없습니다. 방법은 두 가지입니다.

**A. 수집기 방식 (권장)**
사내 PC 에서 `collector/push_absences.py` 를 돌려 데이터를 보드로 밀어 넣습니다.
`vacation_api.py` 가 만들어 둔 `cube_profile` 세션을 그대로 씁니다.
윈도우 작업 스케줄러나 cron 에 하루 몇 번 걸어두면 됩니다.

**B. 쿠키 방식**
브라우저 개발자도구에서 Cube 세션 쿠키를 복사해 `CUBE_COOKIE` 환경변수에 넣습니다.
간단하지만 세션이 만료되면 끊기므로 주기적으로 갱신해야 합니다.

두 경로 모두 없으면 화면은 **예시 데이터**로 뜹니다. 배포 직후 동작 확인용입니다.

---

## 1. 실제 API 주소 찾기

`/hr/notin/list` 가 어떤 API 를 부르는지 확인합니다.

```bash
cd collector
python push_absences.py --show --print-endpoints
```

출력된 주소 중 부재자 목록에 해당하는 것을 골라, 날짜 부분을 `{start}` / `{end}` 로 바꿔
`CUBE_ABSENCE_API` 에 넣습니다. 예:

```
CUBE_ABSENCE_API=https://cube.rsup.io/api/hr/notin/selectNotInList?startYmd={start}&endYmd={end}
```

응답 필드명이 `lib/cube.js` 의 `FIELD` 후보와 다르면 그 목록에 실제 키를 추가하면 됩니다.
구조를 눈으로 보려면:

```bash
python push_absences.py --dump absences.json
```

## 2. 배포

```bash
npm i -g vercel
vercel            # 미리보기
vercel --prod     # 실배포
```

## 3. 환경변수

Vercel 프로젝트 → Settings → Environment Variables

| 이름 | 필수 | 설명 |
|---|---|---|
| `RESEND_API_KEY` | 메일 쓸 때 | resend.com 에서 발급 |
| `MAIL_FROM` | 메일 쓸 때 | `부재자 알림 <notice@도메인>` (도메인 인증 필요) |
| `KV_REST_API_URL` | 권장 | Vercel Marketplace → Upstash Redis 연결 시 자동 주입 |
| `KV_REST_API_TOKEN` | 권장 | 위와 동일 |
| `INGEST_TOKEN` | 수집기 쓸 때 | 아무 긴 문자열. 수집기와 같은 값 |
| `CRON_SECRET` | 권장 | Cron 호출을 보호 |
| `CUBE_ABSENCE_API` | 쿠키 방식일 때 | 위에서 찾은 주소 |
| `CUBE_COOKIE` | 쿠키 방식일 때 | Cube 세션 쿠키 전체 |

KV 를 연결하지 않으면 구독 정보가 메모리에만 남아 서버가 재활용될 때 사라집니다.
알림을 계속 쓸 거면 KV 연결을 권합니다.

## 4. 수집기 돌리기

```bash
export BOARD_URL=https://your-board.vercel.app
export INGEST_TOKEN=아까_정한_값
python collector/push_absences.py
```

## 5. 알림 시간에 대해

Vercel Cron 은 **UTC** 로 돌고, `vercel.json` 에는 매시 정각(`0 * * * *`)으로 걸려 있습니다.
`/api/notify` 가 KST 기준으로 "예약 시각이 지났고 아직 오늘 안 보낸" 구독을 찾아 보냅니다.
따라서 실제 발송은 사용자가 지정한 시각부터 **다음 정각 사이**에 이뤄집니다.
09:30 으로 지정하면 10:00 경에 도착합니다.

- **분 단위까지 맞추고 싶다면**: Vercel Pro(크론 주기 제한 완화)로 올리거나,
  `cron-job.org` 같은 외부 스케줄러가 5분마다 `/api/notify` 를 호출하도록 하세요.
  이때 헤더에 `Authorization: Bearer $CRON_SECRET` 을 넣어야 합니다.
- **Hobby 플랜**은 Cron 이 하루 1회로 제한됩니다. 이 경우 외부 스케줄러 방식을 쓰세요.

---

## 보안 메모

받은 `vacation_api.py` 에는 로그인 비밀번호가 코드에 그대로 들어 있습니다
(`LOGIN_PASSWORD = "test1357!@#"`). 이 저장소를 GitHub 에 올릴 계획이라면
그 값을 지우고 환경변수 `CUBE_PASSWORD` 만 쓰도록 바꾸시고,
이미 어딘가에 올라간 적이 있다면 비밀번호를 교체하시길 권합니다.
`cube_profile` 폴더와 `cube_password.txt` 도 `.gitignore` 에 넣어 주세요.
