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

환경변수
    BOARD_URL     예) https://your-board.vercel.app
    INGEST_TOKEN  Vercel 에 넣어 둔 것과 같은 값
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

BASE = "https://cube.rsup.io"
NOTIN_PAGE = f"{BASE}/hr/notin/list"

HERE = Path(__file__).resolve().parent
PROFILE_DIR = Path(os.environ.get("CUBE_PROFILE", HERE.parent / "cube_profile"))

BOARD_URL = os.environ.get("BOARD_URL", "").rstrip("/")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}")


def collect(show: bool, months: int) -> tuple[list, list]:
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

            # 다음 달로 넘겨 미래 일정까지 긁습니다. (버튼 문구는 화면에 맞게 조정)
            for _ in range(max(0, months - 1)):
                moved = False
                for sel in ("button[aria-label*='다음']", "button:has-text('>')",
                            ".next", "[class*='next']"):
                    try:
                        page.locator(sel).first.click(timeout=1200)
                        moved = True
                        break
                    except Exception:  # noqa: BLE001
                        continue
                if not moved:
                    break
                page.wait_for_timeout(2500)
        finally:
            ctx.close()

    return captured, endpoints


def pick_absence_payload(captured: list[dict]) -> dict | None:
    """가장 그럴듯한 응답 하나를 고릅니다 — 행이 가장 많은 것."""
    best, best_len = None, 0

    def count_rows(node) -> int:
        if isinstance(node, list):
            return len(node)
        if isinstance(node, dict):
            return max((count_rows(v) for v in node.values()), default=0)
        return 0

    for item in captured:
        n = count_rows(item["body"])
        if n > best_len:
            best, best_len = item, n
    return best


def main() -> None:
    ap = argparse.ArgumentParser(description="Cube 부재자 현황 수집 후 보드로 전송")
    ap.add_argument("--show", action="store_true", help="브라우저 창을 띄운 채 실행")
    ap.add_argument("--months", type=int, default=2, help="앞으로 몇 달치를 넘겨볼지 (기본 2)")
    ap.add_argument("--dump", help="전송하지 않고 JSON 파일로 저장")
    ap.add_argument("--print-endpoints", action="store_true", help="호출된 API 목록만 출력")
    args = ap.parse_args()

    captured, endpoints = collect(args.show, args.months)
    if not captured:
        log("가져온 응답이 없습니다. --show 로 화면을 보며 다시 시도해 주세요.")
        sys.exit(1)

    log(f"JSON 응답 {len(captured)}건을 받았습니다.")
    for url in dict.fromkeys(endpoints):
        print(f"   · {url}")

    if args.print_endpoints:
        print("\n위 주소 중 부재자 목록에 해당하는 것을 골라 Vercel 환경변수에 넣으세요:")
        print("   CUBE_ABSENCE_API=https://cube.rsup.io/api/....?startYmd={start}&endYmd={end}")
        return

    best = pick_absence_payload(captured)
    if not best:
        log("행이 들어 있는 응답을 찾지 못했습니다.")
        sys.exit(1)
    log(f"선택한 응답: {best['url']}")

    if args.dump:
        Path(args.dump).write_text(
            json.dumps(best["body"], ensure_ascii=False, indent=2), encoding="utf-8"
        )
        log(f"{args.dump} 에 저장했습니다. 구조를 확인한 뒤 lib/cube.js 의 FIELD 를 맞춰 주세요.")
        return

    if not BOARD_URL or not INGEST_TOKEN:
        log("BOARD_URL / INGEST_TOKEN 환경변수가 없습니다. --dump 로 먼저 확인해 보세요.")
        sys.exit(1)

    res = requests.post(
        f"{BOARD_URL}/api/ingest",
        headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
        json={"raw": best["body"]},
        timeout=30,
    )
    log(f"전송 결과 {res.status_code}: {res.text[:300]}")


if __name__ == "__main__":
    main()
