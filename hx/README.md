# 하이닉스 실시간 시세 앱 (HynixTicker)

한국투자증권 **KIS Developers OpenAPI 실시간 웹소켓**으로 SK하이닉스(000660) 체결가를 **체결이 발생할 때마다 즉시** 갱신해 보여주는 안드로이드 앱입니다. (5초 폴링이 아니라 틱 단위 푸시 방식)

---

## 1. KIS OpenAPI 키 발급 (앱 실행 전 필수)

1. 한국투자증권 계좌 개설 (없으면 앱으로 비대면 개설)
2. 홈페이지 → **트레이딩 → Open API → KIS Developers → 서비스 신청하기**
   - 실전투자 계좌 또는 모의투자 계좌를 선택해 신청
3. 발급받은 **APP KEY / APP SECRET** 을 메모
4. 앱 첫 실행 화면에 두 값을 입력하고 실전/모의 서버를 선택 → `시작하기`

> 키는 기기 내 SharedPreferences 에만 저장되고 외부로 전송되지 않습니다.
> 접근토큰(`/oauth2/tokenP`)은 발급 제한(분당 1회)이 있어 앱이 24시간 캐싱합니다.

사용 API
| 용도 | 엔드포인트 | tr_id |
|---|---|---|
| REST 접근토큰 | `POST /oauth2/tokenP` | – |
| 초기 스냅샷 시세 | `GET /uapi/domestic-stock/v1/quotations/inquire-price` | `FHKST01010100` |
| **웹소켓 접속키** | `POST /oauth2/Approval` | – |
| **실시간 체결가** | `ws://ops.koreainvestment.com:21000` | `H0STCNT0` |

REST 베이스 URL: 실전 `https://openapi.koreainvestment.com:9443` / 모의 `https://openapivts.koreainvestment.com:29443`
웹소켓: 실전 `21000` / 모의 `31000` 포트

### 실시간 동작 방식
1. `POST /oauth2/Approval` 로 `approval_key` 발급 (본문 키 이름이 `secretkey` 인 점 주의 — REST 토큰과 다름)
2. 웹소켓 접속 후 등록 요청 전송
   ```json
   {"header":{"approval_key":"...","custtype":"P","tr_type":"1","content-type":"utf-8"},
    "body":{"input":{"tr_id":"H0STCNT0","tr_key":"000660"}}}
   ```
   `tr_type` 은 `1`=등록, `2`=해제
3. 이후 `0|H0STCNT0|001|000660^093015^242000^2^...` 형태의 `^` 구분 평문 프레임 수신
   (체결가는 비암호화 TR 이라 복호화가 필요 없습니다)
4. 서버가 보내는 `PINGPONG` 프레임은 같은 내용을 그대로 되돌려 보내 연결 유지
5. 끊기면 지수 백오프(2초 → 최대 30초)로 자동 재접속

---

## 2. APK 만드는 법

### A. 온라인(클라우드)에서 빌드 — PC에 아무것도 설치하지 않아도 됨

**GitHub Actions (무료, 가장 확실함)** — 이 프로젝트에 워크플로가 이미 포함돼 있습니다.
1. github.com 에서 새 저장소 생성
2. 이 폴더 전체를 업로드(또는 push). `.github/workflows/build-apk.yml` 이 함께 올라가야 합니다
3. 저장소의 **Actions** 탭 → `Build APK` → 실행이 끝나면 하단 **Artifacts** 의 `app-debug-apk` 다운로드
4. 압축을 풀면 `app-debug.apk`

그 외 선택지
| 서비스 | 특징 |
|---|---|
| **Codemagic** (codemagic.io) | 안드로이드/플러터 특화 CI. 무료 크레딧 제공, 저장소 연결만 하면 APK 산출 |
| **Bitrise** (bitrise.io) | 모바일 전용 CI, 무료 티어 있음. 설정 마법사가 Gradle 프로젝트를 자동 인식 |
| **Appcircle** (appcircle.io) | 무료 티어에서 빌드+배포까지. UI가 단순한 편 |
| **GitHub Codespaces / Gitpod** | 브라우저 안의 리눅스 개발환경. `sdkmanager` 설치 후 `./gradlew assembleDebug` 직접 실행 |

> "소스 없이 웹에서 앱 만들어 주는 서비스"(앱인벤터, 웹뷰 변환 사이트 등)도 있지만,
> 5초 폴링·인증 헤더가 필요한 이 앱에는 맞지 않습니다. 위의 CI 방식이 정답입니다.

### B. 내 PC에서 빌드
1. Android Studio(Koala 이상) 설치 후 `File > Open` 으로 이 폴더 열기
2. Gradle 동기화 완료 후 `Build > Build Bundle(s)/APK(s) > Build APK(s)`
3. 결과물: `app/build/outputs/apk/debug/app-debug.apk`

배포용 서명 APK는 `Build > Generate Signed Bundle / APK` 를 사용하세요.

### 설치
APK를 폰으로 옮긴 뒤 "출처를 알 수 없는 앱 설치"를 허용하고 실행하거나, `adb install app-debug.apk`.

---

## 3. 커스터마이징

`MainActivity.kt` 상단:
```kotlin
private const val DEFAULT_CODE = "000660"   // 종목 코드
```
호가까지 실시간으로 받고 싶으면 `KisRealtime` 에서 `H0STASP0`(실시간 호가) TR 을 추가로 등록하면 됩니다.

---

## 4. 주의사항

- **장 시간 외에는 체결이 발생하지 않으므로 화면이 멈춰 있는 게 정상입니다.** 이때는 앱 시작 시 REST 로 받아 둔 스냅샷 값이 표시됩니다.
- 실시간 등록은 **계정당 41건**까지만 가능합니다(종목 × TR 기준). 여러 종목을 볼 때 주의하세요.
- 웹소켓은 `ws://` 평문 접속이라 Android 9 이상에서 차단됩니다. `res/xml/network_security_config.xml` 에서 `ops.koreainvestment.com` 만 예외 처리해 뒀습니다.
- 모의투자 서버(31000)는 실시간 시세 TR 이 제한될 수 있습니다. 시세 목적이면 실전 서버 키를 권장합니다.
- 앱을 백그라운드로 보내면 화면이 사라지며 연결이 정리됩니다. 백그라운드 유지가 필요하면 포그라운드 서비스로 옮겨야 합니다.
- 표시 값은 지연이 있을 수 있고, 투자 판단의 근거로 삼기에는 적합하지 않습니다.
