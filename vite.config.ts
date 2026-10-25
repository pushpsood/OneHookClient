import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { rm } from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
import {
  DEFAULT_SHARE_IMAGE,
  DEFAULT_SHARE_IMAGE_ALT,
  NOT_FOUND_SEO,
  PRERENDER_ROUTES,
  ROUTE_SEO,
  SITEMAP_ROUTES,
  SITE_URL,
  smartAppBannerContent,
  type RouteSeo,
} from './src/config/seo-routes';

const distDir = resolve(__dirname, 'dist');

/**
 * Rollup runs `closeBundle` even when the build FAILED, and on a failed build Vite never created
 * `dist`, so a closeBundle hook writing into it threw ENOENT and replaced the real build error.
 * Creating the directory up front keeps the genuine error visible.
 */
const ensureOutDirPlugin = (): Plugin => ({
  name: 'ensure-out-dir',
  apply: 'build',
  buildStart() {
    mkdirSync(distDir, { recursive: true });
  },
});

/**
 * `onehook-api-client` is a `file:` link into the sibling OneHookBackend repo's generated Smithy
 * SDK. In GitHub Actions, it is installed from the GitHub Packages registry.
 * This alias ensures that Vite can resolve the package in either environment.
 */
function resolveApiClient() {
  try {
    // Attempt standard Node resolution
    return createRequire(import.meta.url).resolve('onehook-api-client');
  } catch {
    console.warn(
      '[onehook] onehook-api-client is not available.\n' +
        'Generate the SDK from the API contract before building:\n' +
        '  cd ../OneHookBackend/packages/api-models && mvn -q exec:java\n' +
        '  npm install   # re-links the file: dependency\n' +
        'No stub fallback exists by design — see "No test code in production" in README.md.'
    );
  }
}

/**
 * Per-route HTML for crawlers. The app renders in the browser, so on its own every URL would serve
 * the same index.html (homepage title, description and canonical, and an empty body) until JavaScript
 * runs. After the client build this writes, for the homepage, every route in src/config/seo-routes.ts
 * (dist/<route>/index.html) and the not-found page (dist/404.html):
 *
 *  - the page's own title, description, robots, canonical, og:/twitter: tags (incl. a 1200×630 share
 *    image), JSON-LD and, once the iOS app is listed, Apple's Smart App Banner, in the raw <head>;
 *  - the page's content, rendered with React at build time (src/prerender-entry.tsx), inside
 *    <div id="root">, so crawlers that don't run JavaScript (AI search, link previews) read it.
 *
 * It also writes sitemap.xml from the indexable routes. The scripts are untouched: the browser mounts
 * the app with createRoot, which replaces the pre-rendered markup. CloudFront maps /<route> to
 * /<route>/index.html and serves 404.html with a real 404 status (infra/stacks/frontend-stack.ts).
 */
const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Motion renders each element's `initial` state into server HTML, so entrance-animated content comes
 * out as `opacity:0` (often with an offset transform). In the pre-rendered page nothing ever animates
 * it in, so drop those hidden-start styles; the live app re-renders everything on mount anyway.
 */
function revealMotionInitialStyles(html: string): string {
  return html.replace(/ style="([^"]*)"/g, (_m, css: string) => {
    if (!/opacity:\s*0(?![.\d])/.test(css)) return _m;
    const kept = css
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !/^opacity:\s*0(?![.\d])/.test(d) && !/^transform:/.test(d) && !/^clip-path:/.test(d) && !/^filter:\s*blur/.test(d));
    return kept.length ? ` style="${kept.join(';')}"` : '';
  });
}

function buildSitemap(): string {
  // No <lastmod>: the build has no reliable per-page modification date (CodeBuild gets a source zip,
  // not git history), and Google ignores lastmod that changes on every deploy. <priority> and
  // <changefreq> are ignored by Google, so they are omitted too.
  const urls = SITEMAP_ROUTES.map((r) => `<url><loc>${SITE_URL}${r === '/' ? '/' : r}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

const prerenderPagesPlugin = (mode: string): Plugin => ({
  name: 'prerender-pages',
  apply: 'build',
  async closeBundle() {
    const indexPath = resolve(distDir, 'index.html');
    if (!existsSync(indexPath)) return; // the build failed; let its own error surface
    const base = readFileSync(indexPath, 'utf8');

    // Build the page renderer as an SSR bundle (Rollup resolves CommonJS dependencies the same way
    // the browser build does), then import it in Node. Written to a temp dir and removed afterwards,
    // so nothing from it can reach dist/.
    const ssrOutDir = resolve(__dirname, 'node_modules/.cache/prerender');
    await build({
      configFile: false,
      root: __dirname,
      mode,
      logLevel: 'error',
      plugins: [react()],
      resolve: { alias: appAliases },
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      ssr: { noExternal: true },
      build: {
        ssr: resolve(__dirname, 'src/prerender-entry.tsx'),
        outDir: ssrOutDir,
        emptyOutDir: true,
        copyPublicDir: false,
        rollupOptions: { output: { entryFileNames: 'prerender-entry.mjs', format: 'es', inlineDynamicImports: true } },
      },
    });
    try {
      const { renderRouteBody, PRERENDER_BODY_PAGES } = (await import(
        pathToFileURL(resolve(ssrOutDir, 'prerender-entry.mjs')).href
      )) as typeof import('./src/prerender-entry');

      const setAttr = (html: string, selector: RegExp, value: string) => {
        if (!selector.test(html)) throw new Error(`[prerender-pages] tag not found in index.html: ${selector}`);
        return html.replace(selector, (_m, pre: string, post: string) => `${pre}${escapeHtml(value)}${post}`);
      };
      const banner = smartAppBannerContent();

      const renderPage = (route: string, seo: RouteSeo, canonical: string | null): string => {
        const image = `${SITE_URL}${seo.image ?? DEFAULT_SHARE_IMAGE}`;
        const imageAlt = seo.imageAlt ?? DEFAULT_SHARE_IMAGE_ALT;
        let html = base;
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
        html = setAttr(html, /(<meta name="description" content=")[^"]*(")/, seo.description);
        if (seo.noindex) html = setAttr(html, /(<meta name="robots" content=")[^"]*(")/, 'noindex,nofollow');
        if (canonical) {
          html = setAttr(html, /(<link rel="canonical" href=")[^"]*(")/, canonical);
          html = setAttr(html, /(<meta property="og:url" content=")[^"]*(")/, canonical);
        } else {
          html = html.replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '').replace(/\s*<meta property="og:url" content="[^"]*" \/>/, '');
        }
        html = setAttr(html, /(<meta property="og:title" content=")[^"]*(")/, seo.title);
        html = setAttr(html, /(<meta property="og:description" content=")[^"]*(")/, seo.description);
        html = setAttr(html, /(<meta property="og:image" content=")[^"]*(")/, image);
        html = setAttr(html, /(<meta property="og:image:secure_url" content=")[^"]*(")/, image);
        html = setAttr(html, /(<meta property="og:image:alt" content=")[^"]*(")/, imageAlt);
        html = setAttr(html, /(<meta name="twitter:title" content=")[^"]*(")/, seo.title);
        html = setAttr(html, /(<meta name="twitter:description" content=")[^"]*(")/, seo.description);
        html = setAttr(html, /(<meta name="twitter:image" content=")[^"]*(")/, image);
        html = setAttr(html, /(<meta name="twitter:image:alt" content=")[^"]*(")/, imageAlt);
        const extraHead: string[] = [];
        if (banner) extraHead.push(`<meta name="apple-itunes-app" content="${escapeHtml(banner)}" />`);
        if (seo.jsonLd) {
          const ld = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
          extraHead.push(`<script type="application/ld+json" data-seo="page">${ld}</script>`);
        }
        if (extraHead.length) html = html.replace('</head>', `    ${extraHead.join('\n    ')}\n  </head>`);
        if (PRERENDER_BODY_PAGES[route]) {
          if (!html.includes('<div id="root"></div>')) throw new Error('[prerender-pages] <div id="root"></div> not found in index.html');
          const body = revealMotionInitialStyles(renderRouteBody(route));
          html = html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
        }
        return html;
      };

      for (const route of ['/', ...PRERENDER_ROUTES]) {
        const html = renderPage(route, ROUTE_SEO[route], `${SITE_URL}${route}`);
        const dir = route === '/' ? distDir : resolve(distDir, route.replace(/^\//, ''));
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'index.html'), html);
      }
      writeFileSync(resolve(distDir, '404.html'), renderPage('/404', NOT_FOUND_SEO, null));
      writeFileSync(resolve(distDir, 'sitemap.xml'), buildSitemap());
    } finally {
      await rm(ssrOutDir, { recursive: true, force: true });
    }
  },
});

const appAliases = [
  { find: '@', replacement: resolve(__dirname, 'src') },
  { find: /onehook-api-client\/dist-es\/runtimeConfig$/, replacement: 'onehook-api-client/dist-es/runtimeConfig.browser' },
];

const leanMediaPrunePlugin = (): Plugin => ({
  name: 'lean-media-prune',
  apply: 'build',
  async closeBundle() {
    const pruneTargets = [
      'media/aerial-view-of-the-city-in-the-fog-5ZBZNUT.jpg',
      'media/man-playing-guitar-close-up.jpg',
      'media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS.jpg',
      'media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar.jpg',
      'media/onehook.png',
      'media/onehook-1024.png',
      'media/onehook_white_inside.png',
      'media/onehook_white_inside-1024.png',
      'media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc.mp4',
    ];

    await Promise.all(
      pruneTargets.map(async (relativePath) => {
        await rm(resolve(distDir, relativePath), { force: true });
      })
    );
  },
});

export default defineConfig(({ mode }) => {
  resolveApiClient();

  let appsyncApiId = '';
  if (mode === 'development') {
    try {
      const output = execSync('AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:4566 --region us-east-1 appsync list-graphql-apis', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const apis = JSON.parse(output);
      const chatApi = apis.graphqlApis?.find((api: any) => api.name === 'OneHook-Chat-local-ChatApi');
      if (chatApi) {
        appsyncApiId = chatApi.apiId;
      }
    } catch {
      // AppSync disabled or unavailable in LocalStack community edition
    }
  }

  return {
    root: resolve(__dirname),
    publicDir: 'public',
    plugins: [
      react(),
      tailwindcss(),
      ensureOutDirPlugin(),
      leanMediaPrunePlugin(),
      // Writes per-route HTML (head + rendered body), 404.html and sitemap.xml. robots.txt is
      // public/robots.txt, copied as-is.
      prerenderPagesPlugin(mode),
    ],
    server: {
      fs: {
        // The onehook-api-client SDK is symlinked to the backend repo; allow Vite
        // to read/serve those files during dev.
        allow: [resolve(__dirname), resolve(__dirname, '..', 'OneHookBackend')],
      },
      proxy: {
        '/profile': {
          target: 'https://api.gamma.onehook.club',
          changeOrigin: true,
          secure: true,
        },
        '/state': {
          target: 'https://api.gamma.onehook.club',
          changeOrigin: true,
          secure: true,
        },
        '/matching': {
          target: 'https://api.gamma.onehook.club',
          changeOrigin: true,
          secure: true,
        },
        '/identity': {
          target: 'https://api.gamma.onehook.club',
          changeOrigin: true,
          secure: true,
        },
        '/chat': {
          target: 'https://api.gamma.onehook.club',
          changeOrigin: true,
          secure: true,
        },
        '/api/localstack/chat': {
          target: 'https://hmlzbhd52r.execute-api.localhost.localstack.cloud:4566',
          changeOrigin: true,
          rewrite: (path) => `/prod${path.replace(/^\/api\/localstack/, '')}`,
          configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
        },
        '/api/localstack/matching': {
          target: 'https://czulfcrdg5.execute-api.localhost.localstack.cloud:4566',
          changeOrigin: true,
          rewrite: (path) => `/local${path.replace(/^\/api\/localstack/, '')}`,
          configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
        },
        '/api/localstack/profile': {
          target: 'https://6nba2c6zzn.execute-api.localhost.localstack.cloud:4566',
          changeOrigin: true,
          rewrite: (path) => `/prod${path.replace(/^\/api\/localstack/, '')}`,
          configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
        },
        '/api/localstack/identity': {
          target: 'https://rmd3ijnj8t.execute-api.localhost.localstack.cloud:4566',
          changeOrigin: true,
          rewrite: (path) => `/prod${path.replace(/^\/api\/localstack/, '')}`,
          configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
        },
        ...(appsyncApiId ? {
          '/graphql': {
            target: `http://localhost.localstack.cloud:4566/graphql/${appsyncApiId}`,
            changeOrigin: true,
            ws: true,
            rewrite: () => '',
            configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
          }
        } : {}),
        '/api/localstack': {
          target: 'http://localhost:4566',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/localstack/, ''),
          configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', 'http://localhost:4566')),
        },
      },
    },
    optimizeDeps: {
      // Pre-bundle the linked SDK (and its @smithy deps) so dev doesn't serve
      // dozens of unbundled ESM files over /@fs, which made first load very slow.
      include: ['onehook-api-client'],
    },
    build: {
      assetsInlineLimit: 4096,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['motion', 'lucide-react'],
          },
        },
      },
    },
    resolve: {
      alias: appAliases,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
