#!/usr/bin/env python3
"""Concatena collector + counter + overlay e embute em safari/instalar.html."""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ROOT / "extensao" / "collector.js",
    ROOT / "extensao" / "counter.js",
    ROOT / "safari" / "overlay.js",
]
INSTALL_HTML = ROOT / "safari" / "instalar.html"
BUNDLE_RE = re.compile(r'(<textarea id="bundle">)(.*?)(</textarea>)', re.S)


def main() -> int:
    missing = [path for path in SOURCES if not path.exists()]
    if missing:
        print("Arquivos ausentes:", ", ".join(str(p) for p in missing), file=sys.stderr)
        return 1

    bundle = "\n".join(path.read_text(encoding="utf-8") for path in SOURCES).strip() + "\n"
    text = INSTALL_HTML.read_text(encoding="utf-8")
    updated, count = BUNDLE_RE.subn(lambda m: m.group(1) + html.escape(bundle) + m.group(3), text, count=1)
    if count != 1:
        print('Não encontrei <textarea id="bundle"> em safari/instalar.html', file=sys.stderr)
        return 1

    INSTALL_HTML.write_text(updated, encoding="utf-8")
    print(f"Safari atualizado ({len(bundle.splitlines())} linhas no atalho).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
