# Repository Guidelines

## Project Structure & Module Organization
This is a Vite + React 19 + TypeScript frontend. Application code lives in `src/`, organized mostly by feature and view: `Day_view/`, `Week_view/`, `Month_view/`, `Goal_view/`, `SideBar/`, `components/`, `store/`, `services/`, `hooks/`, and `lib/`. Static assets are in `src/assets/`; public files such as fonts are in `public/`. Path aliases use `@/` for `src/` imports, for example `@/store/eventsStore`.

## Build, Test, and Development Commands
Install dependencies with your lockfile-matched tool: `npm install` or `pnpm install`.

- `npm run dev`: start the local Vite dev server.
- `npm run build`: run TypeScript project builds, then create a production bundle.
- `npm run preview`: serve the built app locally for a production-style check.
- `npm run lint`: run ESLint across the repository.
- `npm run test`: start Vitest in watch mode.
- `npm run test:run`: run Vitest once for CI-style verification.
- `npm run test:ui`: open the Vitest UI.

## Coding Style & Naming Conventions
Use TypeScript and React function components. Follow the existing style: 2-space indentation is not enforced here, so match surrounding files; keep imports grouped and prefer `@/` aliases over deep relative paths. Use `PascalCase` for components (`GoalView.tsx`), `camelCase` for utilities/hooks (`useGoals.ts`, `dateUtils.ts`), and keep Zustand store logic in `src/store/`. Linting uses ESLint flat config with `typescript-eslint`, `react-hooks`, and `react-refresh`. Tailwind CSS v4 is used for styling, with shared UI primitives under `src/components/ui/`.

## Testing Guidelines
Vitest, Testing Library, `jsdom`, and `happy-dom` are installed, but there are currently no committed test files. Add tests next to the code they cover or under a nearby `__tests__/` folder, using `*.test.ts` or `*.test.tsx`. Prioritize coverage for store behavior, date utilities, recurrence logic, and route-level rendering.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries such as `weekly view` and `fix asset icon paths for production`. Keep commit messages concise and specific to one change. Pull requests should include a brief description, linked issue if applicable, screenshots or screen recordings for UI work, and the commands you ran (`npm run lint`, `npm run test:run`, `npm run build`).

## Configuration Notes
Supabase integration is configured in `src/lib/supabase.ts`. Do not hardcode secrets in source files; keep environment-specific values in local config or deployment settings. Treat calendar and reminder changes as state-sensitive work and verify auth flows before merging.
