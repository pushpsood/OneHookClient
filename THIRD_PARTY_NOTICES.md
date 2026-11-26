# Third-party notices

The OneHook web client is proprietary (see [LICENSE](LICENSE)). It ships the open-source components
below, whose licences require this notice. Each is used unmodified, as published on npm.

## heic2any 0.0.4

- Used for: converting HEIC/HEIF photos to JPEG in the browser before they are sent to Mr OneHook
  (`src/lib/heic-to-jpeg.ts`).
- How it ships: loaded only on demand with `import('heic2any')`, as its own JavaScript file (a
  separate chunk under `dist/assets/`), not inside the main bundle. It is the unmodified
  `heic2any/dist/heic2any.js` from npm.
- Source: <https://github.com/alexcorvi/heic2any> (npm: <https://www.npmjs.com/package/heic2any>)
- Licence: MIT

```
MIT License

Copyright (c) 2020 Alex Corvi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### libheif (bundled inside heic2any)

- heic2any's published file contains libheif, compiled to JavaScript with Emscripten, which decodes
  the HEIF image in a Web Worker.
- Source: <https://github.com/strukturag/libheif> (Copyright struktur AG and the libheif
  contributors)
- Licence: GNU Lesser General Public License v3.0 (LGPL-3.0),
  <https://www.gnu.org/licenses/lgpl-3.0.html>, which builds on the GNU GPL v3,
  <https://www.gnu.org/licenses/gpl-3.0.html>.
- OneHook does not modify libheif or heic2any. Both are delivered as a separate file that the browser
  downloads only when a HEIC/HEIF photo is attached, so the library can be inspected and replaced
  independently of the OneHook code. The corresponding source is available at the links above.

### gifshot (bundled inside heic2any)

- heic2any's published file also contains gifshot (used by heic2any only for GIF output, which
  OneHook does not use).
- Source: <https://github.com/yahoo/gifshot>
- Licence: MIT, Copyright 2017 Yahoo Inc. (the full notice is at the top of
  `heic2any/dist/heic2any.js`).
