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

## September 2026 Session Updates
### Tech Stack & Architecture Shifts
- **Database Migrated**: Moved away from Google Apps Script / Google Sheets. The backend now uses **PostgreSQL** hosted on **Supabase**.
- **Backend API**: The API has been migrated to Node.js serverless functions (located in the pi/ directory) and deployed via **Vercel**.
- **Roles**: Added more specialized roles including PP, Cutting, Admin, Finishing, Accounts, Supervisor, and CEO.

### Recent Workflow & Feature Changes

#### 1. Payment Calculations & Worker Management
- **Cutting Department Payment Fix**: Fixed a bug in CuttingView.js where selecting multiple operations (e.g., Shirt and Trouser) duplicated payment entries and double-charged. It now submits a single combined string (e.g., 'Shirt, Trouser') mapping to the single cutting rate.
- **Finishing Worker Management**: Created a full "Workers" management tab (Tab 5) in FinishingView.js for adding and editing workers.
- **Worker Types**: Updated pi/stitchers.js to ensure the worker_type property is saved correctly to the database upon creation.
- **Finishing API Permissions**: Fixed a 403 Access Denied bug that prevented the Finishing role from creating workers. Added Finishing to the role whitelist for both POST and PUT endpoints in pi/stitchers.js.

#### 2. PO Management Refinements (PPView)
- **Optional Fields**: Made Collection Name and Article Name optional across the board.
- **Frontend Changes**: Removed the required * labels and form validation blocks in PPView.js.
- **Backend Changes**: Loosened POST validation in pi/po-master.js to only require po_number, ensuring empty collection names are gracefully stored as NULL.

#### 3. Stitcher Management in CuttingView
- **Status Toggle & Editing**: Zain's module (CuttingView.js) lacked the ability to deactivate workers. Added a full Edit Modal to the Stitcher table allowing modification of Name, Phone, Specialization, and Status (Active/Inactive).
- **Integration**: Hooked up the updateStitcher API call to persist status changes to Supabase so inactive workers correctly stop showing up in payment dropdowns.

### Deployment Process
- All code is pushed to the main branch of the InfoFintrack/ziva-production GitHub repository.
- **Vercel Webhooks**: Vercel automatically watches main for deployments. If deployments halt, ensure Vercel's Git connection hasn't shifted to a personal fork.
