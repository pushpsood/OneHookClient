import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { rm } from 'fs/promises';
import { mkdirSync } from 'fs';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import Sitemap from 'vite-plugin-sitemap';

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
 * `@onehook/api-client` is a `file:` link into the sibling OneHookBackend repo's generated Smithy
 * output. It is a HARD requirement: there is deliberately no stub/mock fallback, because a build
 * that silently substitutes fake API behaviour can reach production looking healthy. Fail loudly
 * instead, with the command needed to generate it.
 */
function assertApiClientAvailable(): void {
  try {
    createRequire(import.meta.url).resolve('@onehook/api-client');
  } catch {
    throw new Error(
      '[onehook] @onehook/api-client is not available.\n' +
        'Generate the SDK from the API contract before building:\n' +
        '  cd ../OneHookBackend/packages/api-models && mvn -q exec:java\n' +
        '  npm install   # re-links the file: dependency\n' +
        'No stub fallback exists by design — see "No test code in production" in README.md.'
    );
  }
}

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
  assertApiClientAvailable();

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
      Sitemap({
        hostname: 'https://onehook.club',
        dynamicRoutes: [
          '/',
          '/privacy',
          '/terms',
          '/contact',
          '/careers',
          '/login',
          '/redeem',
        ],
        outDir: 'dist',
      }),
    ],
    server: {
      fs: {
        // The @onehook/api-client SDK is symlinked to the backend repo; allow Vite
        // to read/serve those files during dev.
        allow: [resolve(__dirname), resolve(__dirname, '..', 'OneHookBackend')],
      },
      proxy: {
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
      include: ['@onehook/api-client'],
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
        { find: /@onehook\/api-client\/dist-es\/runtimeConfig$/, replacement: '@onehook/api-client/dist-es/runtimeConfig.browser' },
      ],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
