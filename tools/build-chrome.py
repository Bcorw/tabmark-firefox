#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打包 Chrome 版 Tabmark 扩展。
用法：python3 tools/build-chrome.py
产物：tabmark-chrome.zip（manifest.json 为 Chrome MV3 版，根目录）
"""
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # tabmark-firefox/
OUT = os.path.join(os.path.dirname(ROOT), "tabmark-chrome.zip")

SKIP_DIRS = {".git", "node_modules", ".workbuddy", "__pycache__", "tools"}
SKIP_FILES = {"manifest.chrome.json"}  # 不作为普通文件打包
SKIP_PREFIX = ("docs/qa/",)  # 截图不进包


def main():
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dp, dn, fn in os.walk(ROOT):
            dn[:] = [d for d in dn if d not in SKIP_DIRS]
            for f in fn:
                if f.startswith(".DS_Store") or f == "manifest.json":
                    continue
                if f in SKIP_FILES:
                    continue
                p = os.path.join(dp, f)
                arc = os.path.relpath(p, ROOT)
                if any(arc.startswith(x) for x in SKIP_PREFIX):
                    continue
                z.write(p, arc)
                count += 1
        # Chrome 版 manifest 作为根 manifest.json
        z.write(os.path.join(ROOT, "manifest.chrome.json"), "manifest.json")

    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        assert "manifest.json" in names
        assert "background.js" in names
        assert "newtab/newtab.html" in names
    size = round(os.path.getsize(OUT) / 1024 / 1024, 2)
    print(f"OK  tabmark-chrome.zip  {count + 1} 文件  {size} MB")


if __name__ == "__main__":
    main()
