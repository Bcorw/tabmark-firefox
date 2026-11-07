# Third-party assets and credits

## qrcode-generator

- Files: `shared/vendor/qrcode.js`, `shared/vendor/qrcode-utf8.js`
- Copyright (c) 2011 Kazuhiko Arase
- License: MIT
- Source: https://github.com/kazuhikoarase/qrcode-generator

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

The library ships locally, so QR codes are generated on-device with no network
request.

## System fonts

The interface uses the operating system font stack only. No font files are
bundled and no webfont is fetched at runtime.

## Design reference — Markoob (Chrome)

This add-on is an independent Firefox implementation whose interface and
feature set were modelled on the publicly visible UI of the Chrome extension
**Markoob – Bookmark Launcher** by Gwokhou Wong (0.5.0), studied from its store
listing and screenshots.

- No source code, font file, image asset, icon or trademark of the original is
  included in this package.
- Colour values were sampled from publicly visible screenshots in order to match
  the visual style. Markup, CSS, all JavaScript, the icon and the wordmark here
  are newly written for this project.
- The name **Tabmark** and its logo are original to this project and were chosen
  to avoid confusion with the original add-on.
