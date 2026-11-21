# AI ACADAMIX — RADX

React + TypeScript + Vite starter for the AI ACADAMIX school management interface.

## Current opening flow

1. A one-second AI ACADAMIX welcome screen.
2. Login screen with School ID, verification area, role selection, email and password.
3. Register-school screen with school name and admin credentials.
4. School ID format preview: `YEARRADXIDQUEUE` (example: `2026RADXID000001`).

## Run locally

```bash
npm install
npm run dev
```

## Current implementation boundary

The welcome, login and registration screens are frontend UI. School ID lookup, queue-based ID allocation, account creation, and credential authentication are not connected to Supabase yet. The interface intentionally does not simulate successful verification, registration, or login. Connect those actions to the reviewed school registry and authentication flow before production use.

The existing dashboard component is retained in `src/App.tsx`; it is not opened from the login form until real authentication is implemented.
