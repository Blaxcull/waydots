<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/spiral-calendar_1f5d3-fe0f.png" width="120" alt="Event Calendar icon" />
</p>

<h1 align="center">Event Calendar</h1>

<p align="center">
  <strong>A polished scheduling workspace for events, recurring plans, and goals.</strong>
</p>

<p align="center">
  Built for fast-moving teams and personal productivity workflows that need a cleaner calendar experience.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-111827?style=flat&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-2563eb?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Vite-7-7c3aed?style=flat&logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-0f172a?style=flat&logo=tailwindcss" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%26%20Data-0f172a?style=flat&logo=supabase" alt="Supabase" />
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#scripts">Scripts</a> •
  <a href="#project-structure">Project Structure</a>
</p>

---

## Overview

Event Calendar is a modern React application for planning day-to-day work across multiple calendar views while keeping goals and reminders in sync. It combines a responsive scheduling UI with recurring event handling, optimistic local-first state management, and Supabase-backed authentication.

This repository is structured as a frontend-focused product app, suitable for personal planning tools, internal productivity software, or startup-style scheduling workflows.

## Why This Repo

- Clean multi-view calendar experience instead of a basic CRUD dashboard
- Goal-aware planning that stays aligned with date ranges and event changes
- Recurring event support without forcing users into brittle manual duplication
- Production-friendly frontend stack with typed state, routing, auth, and tests

## Features

- Day, week, month, and year calendar views
- Goal planning with date-aware buckets and sidebar editing flows
- Recurring events with generated instances and exception handling
- Search and quick event management from the sidebar
- Supabase authentication for login and signup flows
- Reminder service for upcoming scheduled events
- Zustand-powered local state with cached event windows
- Responsive UI built with Tailwind CSS and Radix primitives

## Product Highlights

| Area | What it covers |
| --- | --- |
| Calendar Views | Day, week, month, and year navigation tied directly to route state |
| Event Editing | Sidebar-based event creation and update flows with recurrence handling |
| Goals | Goal buckets that adapt to weekly, monthly, yearly, and lifetime scopes |
| Reminders | Client-side early reminder checks for upcoming timed events |
| Auth | Supabase-powered login and signup flows |
| State | Zustand store with cached event windows and optimistic updates |

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Zustand
- React Router
- Supabase
- Vitest + Testing Library

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and add your Supabase values:

```bash
cp .env.example .env
```

Required variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PRICE_CURRENCY=INR
PRICE_AMOUNT=50000
COUPON_CODES_JSON={"WELCOME100":10000,"LAUNCH50":5000}
PRICE_CONFIG_JSON={"INR":50000,"USD":500,"EUR":500,"GBP":500,"SGD":700,"AED":1800}
```

If you want the Pro checkout to work, deploy the Supabase Edge Functions in `supabase/functions/` and set the same Razorpay server secrets in your Supabase project environment. `PRICE_AMOUNT` uses the smallest currency unit, so `50000` means `₹500.00`. `COUPON_CODES_JSON` is an optional server-side coupon map where the discount values use the same smallest-unit format. `PRICE_CONFIG_JSON` lets the server pick amounts by browser locale for non-UPI checkout, while the dedicated UPI path still forces `INR`.

### 3. Start the development server

```bash
npm run dev
```

The app will start on the default Vite development server.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Vite development server |
| `npm run build` | Type-check and create a production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the repository |
| `npm run test` | Start Vitest in watch mode |
| `npm run test:run` | Run the test suite once |
| `npm run test:ui` | Open the Vitest UI |

## Project Structure

```text
src/
  App.tsx
  Day_view/
  Week_view/
  Month_view/
  Year_view/
  Goal_view/
  SideBar/
  components/
  hooks/
  lib/
  pages/
  services/
  store/
public/
  fonts/
```

## Architecture Notes

- `src/store/eventsStore.ts` is the core calendar state layer and handles event caching, optimistic CRUD flows, and recurring instance generation.
- `src/lib/supabase.ts` defines the Supabase client used by the auth and data flows.
- `src/services/reminderService.ts` manages client-side reminder checks for scheduled events.
- Route-driven views in `src/components/DayViewRoute.tsx` keep the selected date and visible calendar scope aligned with the URL.

## Quality

The repo includes ESLint, Vitest, Testing Library, `jsdom`, and `happy-dom`. Existing tests cover core calendar rendering behavior, with room to expand coverage around recurrence logic, store behavior, and authenticated flows.

## Environment and Security

- Do not commit `.env` files or Supabase credentials
- Keep production configuration in deployment settings
- Use `.env.example` as the source of truth for required variables

## Status

This repo is now trimmed for normal frontend development:

- local secrets are ignored
- generated dependencies and build artifacts are ignored
- unused starter assets have been removed
- the README is rewritten to present the project like a product repository

## License

This project is private by default unless you choose to add a license.
