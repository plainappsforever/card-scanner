#!/usr/bin/env python3
"""CSV referee (SPEC §13 O2, acceptance A8): Python's own csv module parses our export back.

Usage: csv_check.py <export.csv> <expected.json>
expected.json = {"header": [...], "rows": [[...], ...], "phoneColumns": [...]} — the cells our writer meant to write
(after the formula guard). Checks: UTF-8 BOM, CRLF row ends, RFC 4180 parse-back equals the expected rows exactly,
no cell outside the phone columns starts with = + - @ TAB CR (formula guard), phone cells are plain numbers.
Prints differences; exit status 1 when there is any.
"""
import csv
import io
import json
import re
import sys

SAFE_PHONE = re.compile(r"^\+?[0-9 ()./-]+$")
DANGER = ("=", "+", "-", "@", "\t", "\r")


def main() -> int:
    path, expected_path = sys.argv[1], sys.argv[2]
    raw = open(path, "rb").read()
    expected = json.load(open(expected_path, encoding="utf-8"))
    problems = []
    if not raw.startswith(b"\xef\xbb\xbf"):
        problems.append("no UTF-8 BOM")
    text = raw.decode("utf-8-sig")
    if not text.endswith("\r\n"):
        problems.append("last row does not end with CRLF")
    rows = list(csv.reader(io.StringIO(text, newline=""), strict=True))
    if rows[0] != expected["header"]:
        problems.append(f"header differs: {rows[0]}")
    body = rows[1:]
    if len(body) != len(expected["rows"]):
        problems.append(f"{len(body)} rows instead of {len(expected['rows'])}")
    phone_idx = {expected["header"].index(c) for c in expected["phoneColumns"]}
    for i, (got, want) in enumerate(zip(body, expected["rows"]), start=1):
        if got != want:
            for j, (g, w) in enumerate(zip(got, want)):
                if g != w:
                    problems.append(f"row {i} column {expected['header'][j]!r}: {g!r} != {w!r}")
            if len(got) != len(want):
                problems.append(f"row {i}: {len(got)} cells instead of {len(want)}")
        for j, cell in enumerate(got):
            if j in phone_idx:
                if cell and not all(SAFE_PHONE.match(v) for v in cell.split(" ; ")) and not cell.startswith("'"):
                    problems.append(f"row {i} phone column {expected['header'][j]!r} holds a non-number without guard: {cell!r}")
            elif cell.startswith(DANGER):
                problems.append(f"row {i} column {expected['header'][j]!r} starts with a formula character: {cell!r}")
    for p in problems:
        print(f"CSV DIFF {p}")
    print(f"csv_check: {len(body)} rows, {len(problems)} difference(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
