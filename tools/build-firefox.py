#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打包 Firefox 版 Tabmark 扩展（AMO 提交用）。
用法：python3 tools/build-firefox.py
产物：tabmark-firefox.zip（manifest.json 为 Firefox 版，根目录）
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # tabmark-firefox/
OUT = os.path.join(os.path.dirname(ROOT), "tabmark-firefox.zip")

SKIP_DIRS = {".git", "node_modules", ".workbuddy", "__pycache__", "tools"}
SKIP_FILES = {"manifest.chrome.json"}   # Chrome 专属 manifest 不进 Firefox 包
SKIP_PREFIX = ("docs/qa/",)             # QA 截图体积大，不进包


def main():
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dp, dn, fn in os.walk(ROOT):
            dn[:] = [d for d in dn if d not in SKIP_DIRS]
            for f in fn:
                if f.startswith(".DS_Store"):
                    continue
                if f in SKIP_FILES:
                    continue
                p = os.path.join(dp, f)
                arc = os.path.relpath(p, ROOT)
                if any(arc.startswith(x) for x in SKIP_PREFIX):
                    continue
                z.write(p, arc)
                count += 1

    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        assert "manifest.json" in names, "manifest.json 必须在根目录"
        assert "background.js" in names
        assert "newtab/newtab.html" in names
        assert "manifest.chrome.json" not in names
    size = round(os.path.getsize(OUT) / 1024 / 1024, 2)
    print(f"OK  tabmark-firefox.zip  {count} 文件  {size} MB")


if __name__ == "__main__":
    main()
