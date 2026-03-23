# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
│   └── mobile/             # Expo React Native mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- **Navimedi API Relay**: `app.all("/api/navimedi/{*path}")` proxies requests to `https://navimedi.org/api` with raw body passthrough (no JSON re-encoding). Supports all HTTP methods (GET, POST, PUT, DELETE). Placed before `express.json()` middleware to avoid body consumption.
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/mobile` (`@workspace/mobile`)

Expo React Native mobile app — NaviMED Patient Health Portal by Argilette. Multi-EHR support with adapter pattern.

- **Screens**: Login (with EHR provider selector), Home (Dashboard), Profile (editable), Appointments (with calendar sync), Prescriptions, Lab Results, Bills, Messages (with compose), Visit Summaries, Request Appointment
- **Auth**: `context/AuthContext.tsx` manages login/logout/profile state with AsyncStorage token persistence. Supports biometric auth on app resume and push notification registration on login.
- **EHR Integration**: `lib/ehr/` — adapter pattern for multi-EHR support. `context/EHRContext.tsx` manages active provider. Built-in adapters: `NavimediAdapter` (Navimedi API), `FHIRAdapter` (any FHIR R4 server). Registry in `lib/ehr/registry.ts` with built-in providers (Navimedi, HAPI FHIR, SMART Health IT). Users can add custom FHIR endpoints.
- **API Client**: `lib/api.ts` — typed API client that delegates to the active EHR adapter. Falls back to direct Navimedi API calls when no adapter is set. Includes `updateProfile()`, `getVisitSummaries()`, `requestAppointment()`.
- **Proxy**: On web, API calls route through the API server's relay endpoint at `/api/navimedi/...` to avoid CORS restrictions from the Navimedi API
- **Theme**: Dark mode support via `context/ThemeContext.tsx` with system/light/dark toggle. Colors defined in `constants/colors.ts` with full light/dark palettes. All screens use `useTheme()` hook.
- **Data fetching**: React Query (`@tanstack/react-query`)
- **Navigation**: Expo Router with NativeTabs (liquid glass on iOS 26+), Stack for other screens
- **i18n**: Multi-language support via `lib/i18n.ts` with 10 languages (en, fr, es, pt, ar, zh, de, it, ja, ko). Translation files in `lib/translations/`. Language selector in profile settings. Uses React Context + AsyncStorage persistence.
- **Key Components**:
  - `ScreenHeader` — gradient header with LinearGradient
  - `StatusBadge` — theme-aware status badges
  - `CalendarStrip` — horizontal scrolling calendar for appointments with date-based filtering
  - `SkeletonLoader` — shimmer animation skeleton screens (Card, Profile, Home, List variants)
  - `AnimatedCard` — staggered fade-in/slide-up card animation
  - `Avatar` — initials-based user avatar
  - `SearchBar` — filterable search with focus border animation
- **Profile Editing**: Users can edit personal info (name, email, phone, address, gender, DOB, emergency contact). Read-only fields (MRN, blood type) are clearly marked.
- **Calendar Sync**: Appointments screen has calendar strip view showing which dates have appointments. Toggle between calendar day view and full list view.
- **Biometrics**: `lib/biometrics.ts` — Face ID/fingerprint authentication for quick sign-in. Toggle in profile settings (always visible, with disabled state explanation when hardware not available).
- **Push Notifications**: `lib/notifications.ts` — registers for push notifications on login with token persistence.
- **Medication Reminders**: `lib/notifications.ts` — schedule/cancel/toggle/mark-taken with AsyncStorage. `app/(tabs)/reminders.tsx` — prescription picker modal, time picker, reminder cards with daily progress tracking. Android notification channel "medication-reminders". All 10 language files include 26 reminder-related translation keys.
- **Branding**: Powered by Argilette. App name is NaviMED. Logo subtitle reads "by Argilette".

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
