# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start development server
npm run build    # Build production bundle
npm test         # Run tests in interactive watch mode
```

No separate lint command — ESLint runs automatically during `npm run build` via `react-scripts`.

## Architecture

**ZIVA Production Management System** — a React SPA for fabric issuance and acceptance tracking in a garment factory. The backend is a Google Apps Script web app; all data lives in Google Sheets.

### Backend Integration

All API calls go through `src/api.js`, which sends requests to the `REACT_APP_SCRIPT_URL` endpoint (set in `.env`). Every call posts an `action` parameter to the Google Apps Script endpoint. Functions: `loginUser`, `submitIssuance`, `submitAcceptance`, `adminOverride`, `getRecords`, `getDropdowns`. The app uses the native Fetch API (not axios, despite it being installed).

### Auth & Routing (`App.js`)

Session-based auth stored in `sessionStorage`. After login, users are redirected by role:
- `PP` → `/issue` (PPView)
- `Cutting` → `/accept` (CuttingView)
- `Admin` → `/admin` (AdminView)

Routes are protected — unauthenticated users see only the login page.

### Role-Based Views (`src/pages/`)

| File | Role | Responsibility |
|------|------|----------------|
| `Login.js` | — | Auth entry point |
| `PPView.js` | PP Dept | Submit fabric issuance forms, view own records |
| `CuttingView.js` | Cutting Dept | Accept/reject fabric, log discrepancies |
| `AdminView.js` | Admin | View all records, filter/search, override with audit log |

### Data Model

Records use PascalCase underscore-separated field names: `Record_ID`, `Issue_Date`, `PO_Number`, `JO_Number`, `Lot_Number`, `Receiving_Vendor`, `Garment_Type`, `Fabric_Name`, `Fabric_Color`, `Qty_Issued`, `Unit`, `Issue_Status`, `Acceptance_Status`, `Qty_Received`, `Discrepancy`, `Fabric_Condition`, `Issued_By`, `Accepted_By`, `No_of_Thaan`.

Acceptance statuses: `"Accepted"`, `"Partial"`, `"Rejected"`, or empty string (pending).

### Styling

Single CSS file at `src/styles/main.css`. Utility classes: `.btn`, `.card`, `.badge`, `.alert`. Responsive breakpoint at 600px. Status badges are color-coded to match acceptance status.

## Tech Stack

- React 19 + React Router 7
- Create React App (react-scripts 5) — no eject
- Google Apps Script backend + Google Sheets database
