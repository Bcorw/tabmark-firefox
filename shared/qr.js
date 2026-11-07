/* ============================================================================
   qr.js — local QR rendering. No network, no service, no image request.

   Wraps the vendored qrcode-generator (MIT) with the product's requirements:
   typeNumber 0 (auto), EC level M, quiet zone 4 modules, white card, ink
   modules, canvas output, PNG download.

   API
     MK.qr.render(canvas, text, moduleSize?)  -> true | false
     MK.qr.download(canvas, filenameBase)     -> Promise
   ========================================================================== */

(function () {
  'use strict';
  var MK = (window.MK = window.MK || {});

  /* Canvas needs literal colours (this is not CSS); white card is required for
     scannability, and the modules use the product ink instead of pure black. */
  var CARD = '#FFFFFF';
  var INK = '#211E19';
  var QUIET = 4;

  function render(canvas, text, moduleSize) {
    if (!canvas || !text) return false;
    if (typeof qrcode !== 'function') return false;
    var qr;
    try {
      qr = qrcode(0, 'M');
      qr.addData(String(text));
      qr.make();
    } catch (e) {
      return false; /* URL beyond QR capacity */
    }
    var count = qr.getModuleCount();
    var total = count + QUIET * 2;
    var px = moduleSize || Math.max(3, Math.round(280 / total));
    var size = total * px;

    canvas.width = size;
    canvas.height = size;
    canvas.setAttribute('width', String(size));
    canvas.setAttribute('height', String(size));

    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = CARD;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = INK;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + QUIET) * px, (r + QUIET) * px, px, px);
        }
      }
    }
    return true;
  }

  function safeName(hostname) {
    var base = String(hostname || 'bookmark')
      .replace(/^www\./, '')
      .replace(/[^a-z0-9.-]+/gi, '-')
      .replace(/^-+|-+$/g, '');
    return 'tabmark-qr-' + (base || 'bookmark') + '.png';
  }

  function download(canvas, hostname, label) {
    return new Promise(function (resolve, reject) {
      if (!canvas) {
        reject(new Error('no-canvas'));
        return;
      }
      var name = label || safeName(hostname);
      var finish = function (blob) {
        if (!blob) {
          reject(new Error('no-blob'));
          return;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve(name);
      };
      if (canvas.toBlob) {
        canvas.toBlob(finish, 'image/png');
      } else {
        try {
          var data = canvas.toDataURL('image/png');
          var bin = atob(data.split(',')[1]);
          var buf = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          finish(new Blob([buf], { type: 'image/png' }));
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  MK.qr = {
    render: render,
    download: download,
    safeName: safeName
  };
})();
