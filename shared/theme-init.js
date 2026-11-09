/* ============================================================================
   theme-init.js — runs synchronously in <head>, before any CSS paints.

   Reads the mirrored theme / motion preference from localStorage and writes it
   onto <html> so the first frame is already correct (no white flash).
   `system` is never written: the CSS prefers-color-scheme block handles it.
   ========================================================================== */

(function () {
  'use strict';
  var root = document.documentElement;
  try {
    /* query params win over the stored mirror — used for static previews/QA.
       Applied here, synchronously, so the first frame already has the right
       theme (no late flip, no 120ms background-color transition racing). */
    var params = new URLSearchParams(window.location.search);
    /* ?fast=1 marks QA/preview loads: tokens.css disables every animation and
       transition under [data-qa="1"], so headless screenshots capture the
       settled state instead of frame 0 of an entrance animation. */
    if (params.has('fast')) {
      root.setAttribute('data-qa', '1');
    }
    var qTheme = params.get('theme');
    if (qTheme !== 'light' && qTheme !== 'dark') {
      qTheme = window.localStorage.getItem('tabmark.theme');
    }
    if (qTheme === 'light' || qTheme === 'dark') {
      root.setAttribute('data-theme', qTheme);
    }
    var motion = params.get('motion') || window.localStorage.getItem('tabmark.motion');
    if (motion === 'off') {
      root.setAttribute('data-motion', 'off');
    }
    /* 字号 / 书签宽度：预渲染阶段就写到 <html>，避免首屏按默认值排版后跳变 */
    var fs = parseFloat(window.localStorage.getItem('tabmark.fontScale'));
    if (fs && fs > 0.5 && fs < 2) root.style.setProperty('--font-scale', String(fs));
    var ws = parseFloat(window.localStorage.getItem('tabmark.widthScale'));
    if (ws && ws > 0.3 && ws < 2) root.style.setProperty('--width-scale', String(ws));

    var lang = params.get('lang') || window.localStorage.getItem('tabmark.lang');
    if (lang === 'zh' || lang === 'en') {
      root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    }
  } catch (e) {
    /* private mode / storage disabled — the CSS defaults still look right */
  }
})();
