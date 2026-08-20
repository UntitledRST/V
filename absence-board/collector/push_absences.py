#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cube 부재자 현황 수집기
=======================
vacation_api.py 가 저장해 둔 브라우저 세션(cube_profile)을 그대로 재사용해
https://cube.rsup.io/hr/notin/list 화면이 부르는 API 응답을 가로챈 뒤,
Vercel 에 올린 보드의 /api/ingest 로 보냅니다.

Cube 는 사내 SSO 뒤에 있어 Vercel 서버가 직접 부를 수 없습니다.
그래서 "사내 PC 가 읽어서 밀어 넣는" 방식이 가장 확실합니다.

준비
    pip install playwright requests
    playwright install chromium
    # vacation_api.py 와 같은 폴더의 cube_profile 을 쓰거나,
    # 없으면 python vacation_api.py --login 으로 먼저 만들어 두세요.

사용
    python push_absences.py --show                 # 처음 한 번: 응답 구조 확인
    python push_absences.py                        # 수집해서 전송
    python push_absences.py --dump absences.json   # 파일로만 저장
    python push_absences.py --print-endpoints      # 어떤 API 를 부르는지 목록만
    python push_absences.py --back 1 --months 3    # 지난달 ~ 다음다음달까지

환경변수
    BOARD_URL     예) https://your-board.vercel.app
    INGEST_TOKEN  Vercel 에 넣어 둔 것과 같은 값
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

BASE = "https://cube.rsup.io"
NOTIN_PAGE = f"{BASE}/hr/notin/list"

# 월 이동 버튼.
# 실제 클릭 핸들러는 보통 dd 에 걸려 있어 dd 를 먼저 누르고,
# 안 되면 안쪽 svg 를 눌러 봅니다.
FORM_DL = '//*[@id="content"]/div/div/div[1]/form/dl[3]'
PREV_SELECTORS = [
    f"xpath={FORM_DL}/dd[1]",
    f"xpath={FORM_DL}/dd[1]/svg",
]
NEXT_SELECTORS = [
    f"xpath={FORM_DL}/dd[3]",
    f"xpath={FORM_DL}/dd[3]/svg",
    f"xpath={FORM_DL}/dd[3]/svg/path",
]
MONTH_LABEL = f"xpath={FORM_DL}/dd[2]"

HERE = Path(__file__).resolve().parent
PROFILE_DIR = Path(os.environ.get("CUBE_PROFILE", HERE / "cube_profile"))

BOARD_URL = os.environ.get("BOARD_URL", "").rstrip("/")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}")


def read_month(page) -> str:
    """현재 보고 있는 연월 표시를 읽습니다. 못 읽으면 빈 문자열."""
    try:
        return (page.locator(MONTH_LABEL).first.inner_text(timeout=1500) or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def move_month(page, selectors: list[str], direction: str) -> bool:
    """월 이동 버튼을 눌러 화면이 실제로 바뀌었는지까지 확인합니다."""
    before = read_month(page)

    for sel in selectors:
        try:
            target = page.locator(sel).first
            target.scroll_into_view_if_needed(timeout=1500)
            target.click(timeout=2000)
        except Exception:  # noqa: BLE001
            # SVG 요소는 일반 클릭이 막히는 경우가 있어 좌표로 한 번 더 시도
            try:
                box = page.locator(sel).first.bounding_box(timeout=1000)
                if not box:
                    continue
                page.mouse.click(box["x"] + box["width"] / 2,
                                 box["y"] + box["height"] / 2)
            except Exception:  # noqa: BLE001
                continue

        page.wait_for_timeout(2500)
        after = read_month(page)
        if not before or after != before:
            log(f"{direction} 달로 이동: {before or '?'} → {after or '?'}")
            return True

    log(f"{direction} 달 버튼을 누르지 못했습니다. 이 달까지만 수집합니다.")
    return False


def collect(show: bool, months: int, back: int) -> tuple[list, list]:
    """부재자 목록 페이지를 열고, 그 화면이 부른 JSON 응답을 전부 모읍니다."""
    captured: list[dict] = []
    endpoints: list[str] = []

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=not show,
            no_viewport=True,
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            def on_response(res):
                url = res.url
                if "/api/" not in url:
                    return
                ctype = (res.headers or {}).get("content-type", "")
                if "json" not in ctype:
                    return
                try:
                    body = res.json()
                except Exception:  # noqa: BLE001
                    return
                endpoints.append(url)
                captured.append({"url": url, "body": body})

            page.on("response", on_response)

            log("부재자 현황 페이지를 엽니다...")
            try:
                page.goto(NOTIN_PAGE, wait_until="networkidle", timeout=45_000)
            except Exception:  # noqa: BLE001
                pass
            page.wait_for_timeout(4000)

            if "login" in page.url.lower():
                log("로그인이 필요합니다. --show 로 다시 실행해 로그인해 주세요.")
                if show:
                    input("로그인을 마친 뒤 Enter를 누르세요...")
                    page.goto(NOTIN_PAGE, wait_until="networkidle", timeout=45_000)
                    page.wait_for_timeout(4000)
                else:
                    return [], []

            log(f"현재 화면: {read_month(page)}")

            # 과거 달로 되돌아가며 수집
            for _ in range(max(0, back)):
                if not move_month(page, PREV_SELECTORS, "이전"):
                    break

            # 되돌아간 만큼 다시 앞으로 오고, 이어서 미래 달까지 수집
            for _ in range(max(0, back) + max(0, months - 1)):
                if not move_month(page, NEXT_SELECTORS, "다음"):
                    break
        finally:
            ctx.close()

    return captured, endpoints


def find_rows(node, depth: int = 0) -> list:
    """응답 어딘가에 있는 목록 배열을 찾아냅니다."""
    if isinstance(node, list):
        return node
    if not isinstance(node, dict) or depth > 5:
        return []
    for key in ("list", "dataList", "resultList", "rows", "items", "content", "data", "result"):
        value = node.get(key)
        if isinstance(value, list):
            return value
    for value in node.values():
        found = find_rows(value, depth + 1)
        if found:
            return found
    return []


def merge_rows(captured: list[dict]) -> tuple[list, str]:
    """여러 달을 넘기며 받은 응답들의 행을 하나로 합칩니다 (중복 제거)."""
    # 행이 가장 많이 나온 API 주소를 부재자 목록으로 봅니다.
    per_url: dict[str, int] = {}
    for item in captured:
        base = item["url"].split("?")[0]
        per_url[base] = per_url.get(base, 0) + len(find_rows(item["body"]))
    if not per_url or max(per_url.values()) == 0:
        return [], ""
    main_url = max(per_url, key=per_url.get)

    merged, seen = [], set()
    for item in captured:
        if item["url"].split("?")[0] != main_url:
            continue
        for row in find_rows(item["body"]):
            key = json.dumps(row, sort_keys=True, ensure_ascii=False)
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)
    return merged, main_url


def main() -> None:
    ap = argparse.ArgumentParser(description="Cube 부재자 현황 수집 후 보드로 전송")
    ap.add_argument("--show", action="store_true", help="브라우저 창을 띄운 채 실행")
    ap.add_argument("--months", type=int, default=2, help="이번 달 포함 앞으로 몇 달치 (기본 2)")
    ap.add_argument("--back", type=int, default=0, help="과거로 몇 달치를 더 볼지 (기본 0)")
    ap.add_argument("--dump", help="전송하지 않고 JSON 파일로 저장")
    ap.add_argument("--print-endpoints", action="store_true", help="호출된 API 목록만 출력")
    args = ap.parse_args()

    captured, endpoints = collect(args.show, args.months, args.back)
    if not captured:
        log("가져온 응답이 없습니다. --show 로 화면을 보며 다시 시도해 주세요.")
        sys.exit(1)

    log(f"JSON 응답 {len(captured)}건을 받았습니다.")
    for url in dict.fromkeys(u.split("?")[0] for u in endpoints):
        print(f"   · {url}")

    if args.print_endpoints:
        print("\n위 주소 중 부재자 목록에 해당하는 것을 골라 Vercel 환경변수에 넣으세요:")
        print("   CUBE_ABSENCE_API=https://cube.rsup.io/api/....?startYmd={start}&endYmd={end}")
        return

    rows, main_url = merge_rows(captured)
    if not rows:
        log("행이 들어 있는 응답을 찾지 못했습니다.")
        sys.exit(1)
    log(f"부재자 목록으로 판단한 API: {main_url}")
    log(f"여러 달을 합쳐 {len(rows)}행을 모았습니다.")

    if args.dump:
        Path(args.dump).write_text(
            json.dumps({"list": rows}, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        log(f"{args.dump} 에 저장했습니다. 구조를 확인한 뒤 lib/cube.js 의 FIELD 를 맞춰 주세요.")
        return

    if not BOARD_URL or not INGEST_TOKEN:
        log("BOARD_URL / INGEST_TOKEN 환경변수가 없습니다. --dump 로 먼저 확인해 보세요.")
        sys.exit(1)

    res = requests.post(
        f"{BOARD_URL}/api/ingest",
        headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
        json={"raw": {"list": rows}},
        timeout=30,
    )
    log(f"전송 결과 {res.status_code}: {res.text[:300]}")


if __name__ == "__main__":
    main()
