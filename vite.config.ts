import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { rm } from 'fs/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import Sitemap from 'vite-plugin-sitemap';
import { PRERENDER_ROUTES, ROUTE_SEO, SITE_URL } from './src/config/seo-routes';

const distDir = resolve(__dirname, 'dist');

/**
 * `vite-plugin-sitemap` writes sitemap.xml / robots.txt straight into `dist`
 * from its `closeBundle` hook. Rollup runs `closeBundle` even when the build
 * FAILED — and on a failed build Vite never created `dist`, so the plugin threw
 *
 *   [vite-plugin-sitemap] ENOENT: ... open 'dist/robots.txt'
 *
 * which replaced the real build error and made CI failures impossible to
 * diagnose. Creating the directory up front keeps the genuine error visible.
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
 * the same index.html — homepage title, description and canonical — until JavaScript runs. That is a
 * real indexing risk: a crawler can read /messenger's raw HTML as "canonical: /", i.e. a duplicate of
 * the homepage. After the build this writes dist/<route>/index.html for every public route, with that
 * page's own title, description, canonical, og:/twitter: tags and JSON-LD in the raw <head>. The body
 * and scripts are untouched, so the app boots exactly as before. CloudFront maps /<route> to
 * /<route>/index.html (see infra/stacks/frontend-stack.ts).
 */
const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const prerenderRouteHeadsPlugin = (): Plugin => ({
  name: 'prerender-route-heads',
  apply: 'build',
  closeBundle() {
    const base = readFileSync(resolve(distDir, 'index.html'), 'utf8');
    const setAttr = (html: string, selector: RegExp, value: string) => {
      if (!selector.test(html)) throw new Error(`[prerender-route-heads] tag not found in index.html: ${selector}`);
      return html.replace(selector, (_m, pre: string, post: string) => `${pre}${escapeHtml(value)}${post}`);
    };
    for (const route of PRERENDER_ROUTES) {
      const seo = ROUTE_SEO[route];
      const url = `${SITE_URL}${route}`;
      let html = base;
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
      html = setAttr(html, /(<meta name="description" content=")[^"]*(")/, seo.description);
      html = setAttr(html, /(<link rel="canonical" href=")[^"]*(")/, url);
      html = setAttr(html, /(<meta property="og:url" content=")[^"]*(")/, url);
      html = setAttr(html, /(<meta property="og:title" content=")[^"]*(")/, seo.title);
      html = setAttr(html, /(<meta property="og:description" content=")[^"]*(")/, seo.description);
      html = setAttr(html, /(<meta name="twitter:title" content=")[^"]*(")/, seo.title);
      html = setAttr(html, /(<meta name="twitter:description" content=")[^"]*(")/, seo.description);
      if (seo.jsonLd) {
        const ld = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
        html = html.replace('</head>', `    <script type="application/ld+json" data-seo="page">${ld}</script>\n  </head>`);
      }
      const dir = resolve(distDir, route.replace(/^\//, ''));
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'index.html'), html);
    }
  },
});

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
      prerenderRouteHeadsPlugin(),
      Sitemap({
        hostname: 'https://onehook.club',
        // Public marketing pages are discovered from the pre-built dist/<route>/index.html files written
        // by prerenderRouteHeadsPlugin (which runs first), so they are not listed again here — listing
        // them would duplicate every entry. '/' comes from dist/index.html.
        dynamicRoutes: [],
        exclude: ['/app', '/onboarding', '/auth/setup', '/login', '/redeem'],
        // Generated robots.txt must mirror public/robots.txt (the plugin overwrites dist/robots.txt).
        robots: [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/app', '/onboarding', '/auth/', '/redeem'],
          },
        ],
        // compact output: no whitespace inside <loc>, which some validators reject
        readable: false,
        changefreq: 'weekly',
        priority: {
          '/': 1.0,
          '/science': 0.8,
          '/messenger': 0.8,
          '/pricing': 0.8,
          '/careers': 0.6,
          '/contact': 0.6,
          '/privacy': 0.4,
          '/terms': 0.4,
        },
        outDir: 'dist',
      }),
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
      alias: [
        { find: '@', replacement: resolve(__dirname, 'src') },
        { find: /onehook-api-client\/dist-es\/runtimeConfig$/, replacement: 'onehook-api-client/dist-es/runtimeConfig.browser' },
      ],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
