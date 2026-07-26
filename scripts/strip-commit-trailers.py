#!/usr/bin/env python3
"""Strip AI co-author / Made-with trailers injected into commit messages."""
from __future__ import annotations

import pathlib
import re
import sys

TRAILER_RE = re.compile(
    r"(?mi)^(Co-authored-by:\s*.+\s*<[^>]+>|Made-with:\s*Cursor)\s*\r?\n?",
)


def clean(text: str) -> str:
    cleaned = TRAILER_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", cleaned).rstrip() + ("\n" if text.endswith("\n") or text else "")


def main() -> int:
    # filter-branch / pipe: `python scripts/strip-commit-trailers.py -`
    if len(sys.argv) < 2 or sys.argv[1] == "-":
        sys.stdout.write(clean(sys.stdin.read()))
        return 0
    path = pathlib.Path(sys.argv[1])
    text = path.read_text(encoding="utf-8", errors="replace")
    cleaned = clean(text)
    if cleaned != text:
        path.write_text(cleaned, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
