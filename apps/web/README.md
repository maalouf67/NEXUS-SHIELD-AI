# Web application structure

This is a Next.js App Router application. The `app/` directory is the canonical
home for pages, layouts, and route handlers; a legacy `pages/` directory is
intentionally not created because it would duplicate routing.

| Concern | Location | Responsibility |
| --- | --- | --- |
| Pages and routes | `app/` | Screens, layouts, and server-side API route handlers |
| API client | `api/` | Typed same-origin requests from browser components |
| Reusable UI | `components/` | Shared visual components |
| Global session | `context/` | Authenticated user and session lifecycle |
| Static configuration | `data/` | Non-secret product limits and role rules |
| React hooks | `hooks/` | Reusable React accessors |
| Static assets | `public/assets/` | Approved images, icons, and fonts |
| Redux Toolkit | `redux/` | Deliberately deferred; see its README |
| Business/API services | `services/` | Typed product-level API operations |
| Helpers | `utils/` | Formatting and pure helper functions |

Browser code calls only same-origin `/api/*` routes. Private service addresses
and service tokens remain server-side; never expose them through `NEXT_PUBLIC_*`.
