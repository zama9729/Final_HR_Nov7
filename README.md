# Modern Dashboard Integration Guide

This update replaces the legacy dashboard content while preserving the existing sidebar/topbar layout. The new UI follows a component-driven architecture powered by React, Next.js, Tailwind CSS, and `@tanstack/react-query`.

## File Map

```
styles/tokens.css                     # Shared design tokens (spacing, colors, radii)
lib/api.js                            # Client-side API adapters
components/Dashboard/*.jsx            # Dashboard components (cards, charts, activity, etc.)
pages/dashboard/index.jsx             # Page entry, keeps Sidebar + Topbar
```

## Installing Dependencies

```bash
npm install @tanstack/react-query recharts framer-motion lucide-react tailwindcss
```

Tailwind should already be configured. Import `styles/tokens.css` once in `_app.js` (or global CSS) to ensure tokens exist application-wide.

```js
// pages/_app.js
import "@/styles/tokens.css";
import "@/styles/globals.css";
```

## How to Swap In the Dashboard

1. **Mount new content**  
   Replace the old dashboard page export with the new `pages/dashboard/index.jsx`. This file already mounts the existing `<Sidebar />` and `<Topbar />` components, so no changes are required inside those files.

2. **Provide initial data**  
   `getServerSideProps` calls `fetchDashboardSummary()` from `lib/api.js`. If your backend lives elsewhere, update the fetch URL or proxy accordingly. The page passes the hydrated data into `<Dashboard initialSummary={...} />`.

3. **Connect to live APIs**  
   Update `lib/api.js` endpoints to point to your backend:

   ```js
   export async function fetchDashboardSummary() {
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/summary`, { credentials: "include" });
     if (!res.ok) throw new Error("Failed to load dashboard summary");
     return res.json();
   }
   ```

   The other helpers (`fetchPayroll`, `fetchRevenue`, etc.) follow the same pattern.

4. **Keep existing layout state**  
   If you already expose a `useSidebarState()` hook for collapsed/expanded mode, consume it inside `pages/dashboard/index.jsx` and apply the offset to the main content container. The current example uses the CSS token `var(--sidebar-width)` so alignment stays pixel-perfect.

5. **Optional filter modal & export**  
   - The “Filters” button is a placeholder. Hook it to your modal or state machine.  
   - `exportDashboardCSV()` downloads `/api/export/dashboard?range=` and triggers a file download. Update the endpoint if needed.

## API Contract (Mock)

```
GET /api/dashboard/summary
  → { totalEmployees, totalAttendance, leaveRequests, totalProjects, lastUpdated }

GET /api/dashboard/payroll?range=monthly
  → { series: [{ name:'Cost', data:[...] }, { name:'Expense', data:[...] }], months: [...] }

GET /api/dashboard/revenue
  → { categories:[{ name, amount, percent }], total }

GET /api/dashboard/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
  → [{ id, title, day, date, startTime, endTime, avatars:[url] }]

GET /api/dashboard/activity
  → [{ id, name, role, time, avatar, action }]

GET /api/export/dashboard?range=
  → CSV blob
```

## Component Overview

- `SummaryCard` – gradient metric cards with icon + trend pill.
- `PayrollChart` – dual-series area chart (Recharts) with custom tooltip.
- `RevenueDonut` – donut chart plus legend.
- `ScheduleTimeline` – horizontal timeline with avatar chips.
- `ActivityLog` – compact list of user actions.
- `Dashboard/index.jsx` – orchestrates data fetching (react-query) and layout composition.

## Styling Notes

- Tailwind classes + `styles/tokens.css` keep colors, spacings, and rounded corners consistent.
- Cards use `rounded-3xl`, `shadow-lg`, and pastel gradients to match the provided visual.
- Responsive breakpoints: at `lg` the cards collapse automatically via CSS grid; mobile inherits standard stacking.
- Buttons and chips use subtle borders (rgba borders from tokens).

## Troubleshooting

- **Charts not rendering**: confirm `Recharts` is installed and that you’re only rendering charts client-side (Next.js handles this automatically).
- **SSR fetch errors**: ensure API routes are reachable from the server environment or proxy through Next’s API routes.
- **Sidebar overlap**: verify `--sidebar-width` matches your existing layout token, or replace with `useSidebarState()` width.

With these steps you can drop the new dashboard into the existing shell while keeping all prior navigation and auth behavior intact.

