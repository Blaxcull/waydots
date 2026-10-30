# Gemini Mandates: Waydots

This document serves as the foundational guide for Gemini CLI's operations within this repository. These mandates take precedence over general defaults.

## Project Context
A polished scheduling workspace built with React 19, TypeScript, and Vite. It features multiple calendar views, goal tracking, and recurring event handling, using Zustand for state and Supabase for authentication.

## Technical Stack & Standards
- **Framework:** React 19 (Function Components).
- **Language:** TypeScript (Strict typing preferred).
- **Styling:** Tailwind CSS v4.
- **State Management:** Zustand (Stores located in `src/store/`).
- **Backend/Auth:** Supabase (`src/lib/supabase.ts`).
- **Icons/Assets:** Custom SVGs and PNGs in `src/assets/`.
- **Fonts:** SF Pro and Space Mono (stored in `public/fonts/`).

## Architectural Guidelines
- **Path Aliases:** Always use `@/` for imports from `src/` (e.g., `@/store/eventsStore`).
- **Module Organization:**
  - `src/Day_view/`, `src/Week_view/`, etc. for view-specific logic.
  - `src/SideBar/` for the main interaction panel.
  - `src/components/ui/` for shared Radix-based primitives.
  - `src/store/` for business logic and state (e.g., recurrence generation).
- **Code Style:** Match surrounding file indentation (usually 2 spaces). Use `PascalCase` for components and `camelCase` for utilities/hooks.

## Development & Validation
- **Commands:**
  - Build: `npm run build`
  - Lint: `npm run lint`
  - Test: `npm run test:run` (CI-style) or `npm run test` (watch mode).
- **Testing:** Use Vitest and React Testing Library. Place tests (`*.test.ts/tsx`) next to the implementation or in a nearby `__tests__/` folder. Prioritize store logic and utility functions.
- **Safety:** Never hardcode secrets. Respect `.env` and `.env.example`.

## Workflow Mandates
- **Directives vs. Inquiries:** Assume all requests are Inquiries unless they contain explicit implementation instructions.
- **Surgical Edits:** Use `replace` for targeted changes. Maintain idiomatic quality even in small updates.
- **Verification:** Always run `npm run lint` and relevant tests after making changes.
