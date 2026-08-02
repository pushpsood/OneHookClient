# Contributing to OneHook Client

## Development Workflow

1. Create a feature branch from `develop`
2. Run `npm run dev` to start the dev server
3. Make changes — hot reload is enabled
4. Run `npm run lint` and `npm test` before committing
5. Open a PR against `develop`
6. CI will lint and test automatically
7. After merge to `main`, the frontend auto-deploys

## Project Structure

```
src/
├── api/          # API client and endpoints
├── components/   # React components
├── hooks/        # Custom React hooks
├── lib/          # Utilities (auth, etc.)
├── store/        # Zustand stores
├── tests/        # Test files
├── utils/        # Helper utilities
├── App.tsx       # Root component
├── main.tsx      # Entry point
└── types.ts      # TypeScript types
```

## Code Style

- TypeScript strict mode
- Prettier with project config (`.prettierrc`)
- Run `npm run format` before committing
