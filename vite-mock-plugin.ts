import type { Plugin } from 'vite';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function mockApiPlugin(): Plugin {
  return {
    name: 'mock-api-plugin',
    configureServer(server) {
      const scenario = process.env.VITE_MOCK_SCENARIO || 'default';
      setTimeout(() => {
        console.log('\n\x1b[36m======================================================');
        console.log('🚀 MOCK API SERVER ACTIVE');
        console.log(`📂 Scenario: ${scenario.toUpperCase()}`);
        console.log('------------------------------------------------------');
        console.log('💡 Quick Start Guide for Testing:');
        console.log('👤 Username    : alex@example.com (or any email)');
        console.log('🔑 Password    : any password (auth is mocked locally)');
        console.log('🎟️  Invite Code : OHK-1234');
        console.log('------------------------------------------------------');
        console.log('To test different flows, restart the server with:');
        console.log('  VITE_MOCK_SCENARIO=negative npm run dev (All APIs fail 500)');
        console.log('  VITE_MOCK_SCENARIO=wrong-login npm run dev (Login error)');
        console.log('  VITE_MOCK_SCENARIO=onboarding npm run dev (Onboarding wizard state)');
        console.log('  VITE_MOCK_SCENARIO=hooked npm run dev (Exclusive connection state)');
        console.log('  VITE_MOCK_SCENARIO=no-candidates npm run dev (Empty discovery)');
        console.log('  VITE_MOCK_SCENARIO=match-success npm run dev (Swipe right -> Match)');
        console.log('  VITE_MOCK_SCENARIO=swipe-error npm run dev (Swipe fails)');
        console.log('  VITE_MOCK_SCENARIO=chat-empty npm run dev (No chat history)');
        console.log('  VITE_MOCK_SCENARIO=chat-error npm run dev (Chat load fails)');
        console.log('  VITE_MOCK_SCENARIO=chat-send-error npm run dev (Message send fails)');
        console.log('======================================================\x1b[0m\n');
      }, 1000);

      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/mock/')) {
          const scenario = process.env.VITE_MOCK_SCENARIO || 'default';
          // Extract endpoint, e.g., /api/mock/state/upgrade -> state/upgrade
          const endpoint = req.url.split('?')[0].replace(/^\/api\/mock\//, '');
          
          let mockPath = '';

          // Function to check paths in a given scenario directory
          const findMockInScenario = (scn: string): string | null => {
            let p = resolve(__dirname, `mocks/${scn}/${endpoint}.json`);
            if (existsSync(p)) return p;

            p = resolve(__dirname, `mocks/${scn}/${endpoint}/index.json`);
            if (existsSync(p)) return p;

            // Fallback for dynamic params like /profile/123 -> /profile/default.json
            const parts = endpoint.split('/');
            if (parts.length > 1) {
              parts.pop();
              p = resolve(__dirname, `mocks/${scn}/${parts.join('/')}/default.json`);
              if (existsSync(p)) return p;
            }
            return null;
          };

          // Try the specified scenario first
          mockPath = findMockInScenario(scenario) || '';

          // If not found in the specific scenario, fallback to the 'default' scenario
          if (!mockPath && scenario !== 'default') {
            mockPath = findMockInScenario('default') || '';
          }
          
          if (mockPath && existsSync(mockPath)) {
             try {
                const data = readFileSync(mockPath, 'utf-8');
                
                // Simulate network delay
                setTimeout(() => {
                   const parsed = JSON.parse(data);
                   const status = parsed._status || 200;
                   if (parsed._status) {
                       delete parsed._status;
                   }
                   
                   res.setHeader('Content-Type', 'application/json');
                   res.statusCode = status;
                   res.end(JSON.stringify(parsed));
                }, 500);
                return;
             } catch(e) {
                console.error('Error reading mock file', e);
             }
          } else {
             console.warn(`Mock not found for ${req.url} in scenario ${scenario} or default`);
             res.statusCode = 404;
             res.setHeader('Content-Type', 'application/json');
             res.end(JSON.stringify({ message: 'Mock not found', code: 'MOCK_NOT_FOUND' }));
             return;
          }
        }
        next();
      });
    }
  };
}
