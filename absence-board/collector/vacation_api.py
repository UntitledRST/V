#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cube 휴가 신청서 - API 직접 상신
================================
브라우저 화면 조작 없이 REST API 호출 한 번으로 결재를 상신합니다.

    POST https://cube.rsup.io/api/hr/app/insertApp
    Content-Type: multipart/form-data   (필드명: appVo)

인증은 cube_profile 폴더에 저장된 브라우저 세션(쿠키)을 그대로 사용합니다.
쿠키를 코드에 적어두지 않으므로 파일이 유출돼도 계정은 안전합니다.

준비
    pip install playwright
    playwright install chromium
    python vacation_api.py --login       # 최초 1회 (또는 세션 만료 시)

실행
    python vacation_api.py
    python vacation_api.py 08031         # 인자로 바로 지정
    python vacation_api.py 08031 --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import traceback
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

# ------------------------------------------------------------------ 상수
BASE = "https://cube.rsup.io"
PAGE_URL = f"{BASE}/hr/app/add"
API_INSERT = f"{BASE}/api/hr/app/insertApp"
API_HOLIDAY = f"{BASE}/api/hr/app/selectExcludeHolidayInfo"
LIST_URL = (f"{BASE}/hr/app/list?appGbn=OPENED&content="
            "&endYmd={end}&pageCnt=10&pageNum=1&startYmd={start}")

HERE = Path(__file__).parent
PROFILE_DIR = HERE / "cube_profile"
TEMPLATE_FILE = HERE / "appvo_template.json"

LOGIN_EMAIL = "mclee@rsupport.com"

# 비밀번호는 아래 순서로 찾습니다.
#   1) 환경변수 CUBE_PASSWORD
#   2) 같은 폴더의 cube_password.txt 파일 (첫 줄)
#   3) 아래 상수
# 1)이나 2)를 쓰면 스크립트 파일에 비밀번호가 남지 않습니다.
LOGIN_PASSWORD = ""


def get_password() -> str:
    import os
    env = os.environ.get("CUBE_PASSWORD")
    if env:
        return env.strip()
    pw_file = HERE / "cube_password.txt"
    if pw_file.exists():
        first = pw_file.read_text(encoding="utf-8").splitlines()
        if first and first[0].strip():
            return first[0].strip()
    return LOGIN_PASSWORD

# 실행 시 선택하는 4가지: (표시명, timeTypeCd, timeCd, 제목 접미사)
#   ✔ 확인됨   : 시간(9~11) = TIME/AB,  오전 = AM/AM
#   ? 미확인   : 오후 / 종일 — 아래는 오전 규칙에서 유추한 값입니다.
#                최초 1회는 `--probe` 로 확인하세요. (예: python vacation_api.py 08033 --probe)
PRESETS = [
    ("연차_시간(9~11)", "TIME", "AB",  "(~11)"),
    ("연차_오전",       "AM",   "AM",  "(오전)"),
    ("연차_오후",       "PM",   "PM",  "(오후)"),
    ("연차_종일",       "DAY",  "DAY", ""),
]
TITLE_BASE = "연차휴가 신청서"
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}")


# ------------------------------------------------------------------ 입력 파싱
def parse_date(raw: str) -> str:
    """다양한 입력을 YYYYMMDD로 변환. 20260803 / 260803 / 0803 / 803 / 3"""
    s = raw.strip()
    if not s:
        raise ValueError("빈 입력")
    today = datetime.today()

    parts = [p for p in re.split(r"[.\-/\s]+", s) if p]
    if len(parts) >= 2 and all(p.isdigit() for p in parts):
        if len(parts) == 3:
            y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
            if y < 100:
                y += 2000
        else:
            y, m, d = today.year, int(parts[0]), int(parts[1])
        return datetime(y, m, d).strftime("%Y%m%d")

    digits = re.sub(r"\D", "", s)
    if len(digits) == 8:
        y, m, d = int(digits[:4]), int(digits[4:6]), int(digits[6:])
    elif len(digits) == 6:
        y, m, d = 2000 + int(digits[:2]), int(digits[2:4]), int(digits[4:])
    elif len(digits) == 4:
        y, m, d = today.year, int(digits[:2]), int(digits[2:])
    elif len(digits) == 3:
        y, m, d = today.year, int(digits[0]), int(digits[1:])
    elif len(digits) in (1, 2):
        y, m, d = today.year, today.month, int(digits)
    else:
        raise ValueError("자릿수를 해석할 수 없습니다")
    return datetime(y, m, d).strftime("%Y%m%d")


def parse_combined(raw: str) -> tuple[str, int]:
    """'08031' → ('20260803', 1). 마지막 한 자리가 유형 번호."""
    s = raw.strip()
    if not s:
        raise ValueError("빈 입력")

    parts = s.split()
    if len(parts) == 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= len(PRESETS):
        return parse_date(parts[0]), int(parts[1])

    digits = re.sub(r"\D", "", s)
    if len(digits) >= 2:
        last = int(digits[-1])
        if 1 <= last <= len(PRESETS):
            try:
                return parse_date(digits[:-1]), last
            except ValueError:
                pass
    raise ValueError("날짜+번호 형식이 아닙니다")


def ask_input(arg: str | None) -> tuple[str, int]:
    if arg:
        return parse_combined(arg)

    print("\n" + "=" * 46)
    print(" 휴가일자 + 번호를 이어서 입력하세요.")
    for i, (label, *_r) in enumerate(PRESETS, 1):
        print(f"   {i} = {label}")
    print("-" * 46)
    print("  예) 08031 → 08월 03일, 연차_시간(9~11)")
    print("      08034 → 08월 03일, 연차_종일")
    print("=" * 46)

    while True:
        raw = input("입력: ").strip()
        try:
            ymd, no = parse_combined(raw)
            dt = datetime.strptime(ymd, "%Y%m%d")
            print(f"  → {dt:%Y.%m.%d} ({WEEKDAYS[dt.weekday()]}) / {PRESETS[no - 1][0]}")
            return ymd, no
        except ValueError as e:
            print(f"  인식할 수 없습니다 ({e}). 예) 08031")


# ------------------------------------------------------------------ 페이로드
def build_payload(ymd: str, preset_no: int,
                  time_type_override: str | None = None,
                  time_cd_override: str | None = None) -> dict:
    """템플릿을 읽어 날짜/시간유형만 교체."""
    if not TEMPLATE_FILE.exists():
        raise RuntimeError(
            f"{TEMPLATE_FILE.name} 이(가) 없습니다. "
            "capture_api.py 로 캡처한 뒤 생성해야 합니다."
        )
    vo = json.loads(TEMPLATE_FILE.read_text(encoding="utf-8"))

    label, time_type, time_cd, suffix = PRESETS[preset_no - 1]
    if time_type_override:
        time_type = time_type_override
    if time_cd_override is not None:
        time_cd = time_cd_override or None

    use = {
        "dayoffCd": "ANNUAL",
        "timeTypeCd": time_type,
        "useYmd": ymd,
    }
    if time_cd:
        use["timeCd"] = time_cd

    vo["appDayoffVo"]["appDayoffUseVoList"] = [use]
    vo["appDayoffVo"]["periodYn"] = "N"
    vo["appDayoffVo"]["dayoffCd"] = "ANNUAL"
    vo["title"] = f"{TITLE_BASE}{suffix}"
    vo["appStatCd"] = "DRAFT"
    return vo


# ------------------------------------------------------------------ 전송
def launch(p, headless: bool):
    return p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR),
        headless=headless,
        args=["--start-maximized"],
        no_viewport=True,
    )


def open_page(ctx):
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=30_000)
    except Exception:  # noqa: BLE001
        pass          # SSO 리다이렉트로 중단되는 것은 정상
    page.wait_for_timeout(2500)
    return page


def interactive_login(page, minutes: int = 5) -> bool:
    """CUBE 로그인 클릭 + 구글 이메일 자동 입력 후 완료될 때까지 대기."""
    import time

    print("\n" + "-" * 55)
    print(" 로그인이 필요합니다.")
    print(" 이메일과 비밀번호는 자동 입력됩니다.")
    print(" 2단계 인증이 뜨면 직접 완료해 주세요.")
    print(" 완료되면 자동으로 결재 상신이 이어집니다.")
    print("-" * 55)

    deadline = time.time() + minutes * 60
    pw_done = False
    while time.time() < deadline:
        if is_logged_in(page):
            page.wait_for_timeout(1500)
            log("로그인 확인됨")
            return True

        for sel in ('xpath=//*[@id="root"]/div/div/button/span',
                    "button:has-text('CUBE 로그인')"):
            try:
                page.locator(sel).first.click(timeout=1200)
                log("CUBE 로그인 클릭")
                page.wait_for_timeout(2500)
                break
            except Exception:  # noqa: BLE001
                continue

        if "accounts.google" in page.url:
            # 이메일 입력
            try:
                box = page.locator("input[type='email'], #identifierId").first
                if box.is_visible(timeout=1000) and not box.input_value().strip():
                    box.fill(LOGIN_EMAIL)
                    log(f"이메일 자동 입력: {LOGIN_EMAIL}")
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(3000)
            except Exception:  # noqa: BLE001
                pass

            # 비밀번호 입력 (한 번만 시도)
            if not pw_done:
                try:
                    pw = page.locator("input[type='password']").first
                    if pw.is_visible(timeout=1200) and not pw.input_value().strip():
                        pw.click()
                        pw.fill(get_password())
                        log("비밀번호 자동 입력")
                        page.keyboard.press("Enter")
                        pw_done = True
                        page.wait_for_timeout(3500)
                except Exception:  # noqa: BLE001
                    pass

        time.sleep(2)

    log("로그인 대기 시간이 초과되었습니다.")
    return False


def session_ok(ctx) -> bool:
    """가벼운 API를 호출해 세션이 살아있는지 실제로 확인한다.

    화면(URL/버튼)만으로는 판단할 수 없다. 세션이 만료돼도 SPA 화면은
    그대로 떠 있어서 로그인된 것처럼 보이기 때문.
    """
    try:
        res = ctx.request.post(
            API_HOLIDAY,
            data=[{"holidayYmd": datetime.today().strftime("%Y%m%d")}],
            headers={"content-type": "application/json", "referer": PAGE_URL},
        )
        if res.status == 401:
            log("세션 만료 (401)")
            return False
        log(f"세션 유효 (확인 응답 {res.status})")
        return res.status < 400
    except Exception as e:  # noqa: BLE001
        log(f"세션 확인 실패: {e}")
        return False


def call_api(ctx, vo: dict, ymd: str, dry_run: bool) -> tuple[bool, int]:
    req = ctx.request

    try:
        res = req.post(API_HOLIDAY, data=[{"holidayYmd": ymd}],
                       headers={"content-type": "application/json",
                                "referer": PAGE_URL})
        log(f"휴일 확인: {res.status} {res.text()[:120]}")
    except Exception as e:  # noqa: BLE001
        log(f"휴일 확인 건너뜀: {e}")

    if dry_run:
        log("[DRY-RUN] 전송하지 않고 페이로드만 출력합니다.")
        print(json.dumps(vo["appDayoffVo"], ensure_ascii=False, indent=2))
        print(f"title = {vo['title']}")
        return True, 0

    log("결재 상신 요청...")
    res = req.post(
        API_INSERT,
        multipart={"appVo": json.dumps(vo, ensure_ascii=False)},
        headers={"referer": PAGE_URL,
                 "accept": "application/json, text/plain, */*"},
    )
    text = res.text()
    log(f"응답: {res.status} {text[:300]}")

    if res.status == 401:
        return False, 401

    try:
        data = json.loads(text)
        ok = data.get("status") == "OK" or data.get("resultCode") == 200
    except Exception:  # noqa: BLE001
        ok = res.status == 200

    if ok:
        dt = datetime.strptime(ymd, "%Y%m%d")
        log(f"상신 완료 — {dt:%Y.%m.%d} {vo['title']}")
    else:
        log("상신에 실패했습니다.")
        print("\n--- 보낸 값 ---")
        print(json.dumps(vo["appDayoffVo"]["appDayoffUseVoList"],
                         ensure_ascii=False))
        print(f"title = {vo['title']}")
        print("--- 전체 응답 ---")
        print(text[:1500])
        print("-----------------")
    return ok, res.status


def probe_candidates(preset_no: int) -> list[dict]:
    """서버가 받아들일 가능성이 있는 timeTypeCd/timeCd 조합 후보."""
    label, time_type, time_cd, _ = PRESETS[preset_no - 1]

    if time_type == "TIME":
        return [{"timeTypeCd": "TIME", "timeCd": time_cd or "AB"}]

    half = {"AM": "AM", "PM": "PM"}.get(time_type)
    cands: list[dict] = [
        {"timeTypeCd": time_type},                       # 원래 시도한 값
        {"timeTypeCd": time_type, "timeCd": half},
        {"timeTypeCd": "HALF", "timeCd": half},
        {"timeTypeCd": "HALFDAY", "timeCd": half},
        {"timeTypeCd": time_type, "timeCd": time_type},
    ]
    if time_type == "DAY":
        cands = [
            {"timeTypeCd": "DAY"},
            {"timeTypeCd": "ALL"},
            {"timeTypeCd": "ALLDAY"},
            {"timeTypeCd": "DAY", "timeCd": "DAY"},
            {"timeTypeCd": "FULL"},
        ]
    # 중복 제거 (순서 유지)
    seen, out = set(), []
    for c in cands:
        key = json.dumps(c, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


def run_probe(ctx, ymd: str, preset_no: int) -> bool:
    """후보 조합을 순서대로 전송해 성공하는 값을 찾는다."""
    cands = probe_candidates(preset_no)
    label = PRESETS[preset_no - 1][0]
    print(f"\n{label} — 후보 {len(cands)}개를 순서대로 시험합니다.")
    print("성공하면 즉시 멈춥니다. 실패한 요청은 결재로 남지 않습니다.\n")

    for i, cand in enumerate(cands, 1):
        vo = json.loads(TEMPLATE_FILE.read_text(encoding="utf-8"))
        use = {"dayoffCd": "ANNUAL", "useYmd": ymd}
        use.update(cand)
        vo["appDayoffVo"]["appDayoffUseVoList"] = [use]
        vo["appDayoffVo"]["periodYn"] = "N"
        vo["appDayoffVo"]["dayoffCd"] = "ANNUAL"
        vo["title"] = f"{TITLE_BASE}{PRESETS[preset_no - 1][3]}"
        vo["appStatCd"] = "DRAFT"

        log(f"[{i}/{len(cands)}] {json.dumps(cand, ensure_ascii=False)}")
        res = ctx.request.post(
            API_INSERT,
            multipart={"appVo": json.dumps(vo, ensure_ascii=False)},
            headers={"referer": PAGE_URL,
                     "accept": "application/json, text/plain, */*"},
        )
        text = res.text()
        try:
            data = json.loads(text)
            ok = data.get("status") == "OK"
            msg = data.get("resultMsg")
        except Exception:  # noqa: BLE001
            ok, msg = res.status == 200, text[:120]

        if ok:
            print()
            log("성공한 조합을 찾았습니다.")
            print("=" * 52)
            print(f"  {json.dumps(cand, ensure_ascii=False)}")
            print("=" * 52)
            print("vacation_api.py 의 PRESETS 에서 해당 줄을 이 값으로 바꾸세요.")
            print(f"  timeTypeCd = {cand.get('timeTypeCd')!r}, "
                  f"timeCd = {cand.get('timeCd')!r}")
            return True

        log(f"      → 실패 (resultMsg={msg})")

    print("\n모든 후보가 실패했습니다. capture_api.py 로 실제 요청을 캡처해 주세요.")
    return False


def build_list_url() -> str:
    """오늘 ~ 2년 전 범위의 결재 목록 URL."""
    today = datetime.today()
    try:
        start = today.replace(year=today.year - 2)
    except ValueError:                      # 2월 29일 대응
        start = today.replace(year=today.year - 2, day=28)
    return LIST_URL.format(end=today.strftime("%Y%m%d"),
                           start=start.strftime("%Y%m%d"))


def open_result_page(p, show: bool) -> None:
    """상신 결과를 확인할 수 있도록 결재 목록을 브라우저로 연다."""
    url = build_list_url()
    log("결재 목록을 엽니다.")
    print(f"  {url}")
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR),
        headless=False,
        args=["--start-maximized"],
        no_viewport=True,
    )
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(2000)
        try:
            input("\n확인 후 Enter를 누르면 브라우저를 닫습니다...")
        except (EOFError, KeyboardInterrupt):
            pass
    finally:
        try:
            ctx.close()
        except Exception:  # noqa: BLE001
            pass


def submit(vo: dict, ymd: str, dry_run: bool, show: bool,
           probe_no: int | None = None, open_result: bool = True) -> bool:
    """세션이 살아있으면 조용히, 아니면 로그인 창을 띄운 뒤 이어서 전송."""
    with sync_playwright() as p:
        ctx = launch(p, headless=not show)
        try:
            log("세션 확인 중...")
            open_page(ctx)

            if not session_ok(ctx):
                # 로그인 필요 → 창을 띄워 다시 실행
                if not show:
                    ctx.close()
                    ctx = launch(p, headless=False)
                page = open_page(ctx)
                if not interactive_login(page):
                    return False
                page.wait_for_timeout(1500)
                if not session_ok(ctx):
                    log("로그인했지만 세션이 유효하지 않습니다.")
                    return False

            if probe_no:
                return run_probe(ctx, ymd, probe_no)

            ok, status = call_api(ctx, vo, ymd, dry_run)
            if status == 401:
                log("세션이 만료되어 재로그인 후 다시 시도합니다.")
                if not show:
                    ctx.close()
                    ctx = launch(p, headless=False)
                page = open_page(ctx)
                if interactive_login(page):
                    ok, _ = call_api(ctx, vo, ymd, dry_run)

            if ok and not dry_run and open_result:
                try:
                    ctx.close()
                except Exception:  # noqa: BLE001
                    pass
                open_result_page(p, show)
            return ok
        finally:
            try:
                ctx.close()
            except Exception:  # noqa: BLE001
                pass


def is_logged_in(page) -> bool:
    url = page.url.lower()
    if "cube.rsup.io" not in url or "login" in url:
        return False
    for sel in ("button:has-text('CUBE 로그인')", "text=CUBE 로그인"):
        try:
            if page.locator(sel).first.is_visible(timeout=800):
                return False
        except Exception:  # noqa: BLE001
            continue
    return True


def do_login() -> None:
    """로그인만 수행해 세션을 저장 (선택 사항)."""
    with sync_playwright() as p:
        ctx = launch(p, headless=False)
        try:
            page = open_page(ctx)
            if is_logged_in(page):
                log("이미 로그인되어 있습니다.")
            else:
                interactive_login(page)
            log(f"세션 저장 위치: {PROFILE_DIR}")
        finally:
            ctx.close()


# ------------------------------------------------------------------ 메인
def main() -> None:
    ap = argparse.ArgumentParser(description="Cube 휴가 신청 (API 직접 호출)")
    ap.add_argument("input", nargs="?", help="예) 08031")
    ap.add_argument("--login", action="store_true", help="로그인 세션 저장")
    ap.add_argument("--dry-run", action="store_true", help="전송하지 않고 확인만")
    ap.add_argument("--show", action="store_true", help="브라우저 창을 띄운 채 실행")
    ap.add_argument("--timetype", help="timeTypeCd 직접 지정 (TIME/AM/PM/DAY 등)")
    ap.add_argument("--timecd", help="timeCd 직접 지정 (예: AB, 없으면 빈 문자열)")
    ap.add_argument("--probe", action="store_true",
                    help="후보 조합을 순서대로 시험해 맞는 값을 찾음")
    ap.add_argument("--no-open", action="store_true",
                    help="상신 후 결재 목록을 열지 않음")
    args = ap.parse_args()

    if args.login:
        do_login()
        return

    if not PROFILE_DIR.exists():
        log("저장된 세션이 없습니다. 로그인부터 진행합니다.")

    ymd, no = ask_input(args.input)
    vo = build_payload(ymd, no, args.timetype, args.timecd)

    dt = datetime.strptime(ymd, "%Y%m%d")
    print(f"\n--- 신청 내용 ---\n"
          f" 제목   : {vo['title']}\n"
          f" 일자   : {dt:%Y.%m.%d} ({WEEKDAYS[dt.weekday()]})\n"
          f" 유형   : {PRESETS[no - 1][0]}\n"
          f" 결재선 : " +
          ", ".join(f"{a['userNm']}({a['appTypeCd']})"
                    for a in vo["appLineVoList"][:3]) + " ...\n"
          f"------------------")

    submit(vo, ymd, args.dry_run, args.show,
           no if args.probe else None,
           open_result=not args.no_open)


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001
        traceback.print_exc()
    finally:
        try:
            input("\nEnter를 누르면 종료합니다...")
        except (EOFError, KeyboardInterrupt):
            pass
