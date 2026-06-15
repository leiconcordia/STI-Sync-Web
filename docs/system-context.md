# STI Sync — System Context

> **Purpose:** One-stop reference for any agent or developer to understand the full system without scanning source files. Read this first.

---

## 1. What Is STI Sync?

STI Sync is a Student Activity Office (SAO) management web application for **STI College Ormoc**. It manages student organizations, events, attendance, financial liquidations, certificates, and announcements.

There are **two distinct user panels**:
1. **SAO Admin Panel** — used by the SAO Adviser / SAO Administrator to create, approve, and oversee all activities
2. **Officer Panel** — used by Organization Officers (presidents, secretaries, treasurers) to propose events, manage members, track attendance, and submit liquidations

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite (dev server auto-running; do NOT run `vite build` or `npm run dev`) |
| Routing | React Router v7 (`react-router`, not `react-router-dom`) |
| Styling | Tailwind CSS v4 (no `tailwind.config.js`) |
| Icons | `lucide-react` |
| UI Components | Custom + shared components in `src/app/components/ui/` |
| Package Manager | `pnpm` |
| Design system | `@make-kits` scope (check `package.json`) |

---

## 3. Directory Structure

```
src/
├── app/
│   ├── admin/                        # SAO Admin panel
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Layout.tsx        # Admin shell (Sidebar + TopNav + Outlet)
│   │   │   │   ├── Sidebar.tsx       # Dark navy sidebar, 260px
│   │   │   │   └── TopNav.tsx        # White top bar with search + user menu
│   │   │   ├── certificates/         # Certificate module components
│   │   │   │   ├── CertificateDashboard.tsx
│   │   │   │   ├── TemplateLibrary.tsx
│   │   │   │   ├── TemplateEditor.tsx
│   │   │   │   ├── GenerateCertificates.tsx
│   │   │   │   ├── PreviewModal.tsx
│   │   │   │   └── ExportModal.tsx
│   │   │   ├── sao-event-steps/      # Multi-step SAO event creation wizard steps
│   │   │   │   ├── Step1EventDetails.tsx
│   │   │   │   ├── Step2Schedule.tsx
│   │   │   │   ├── Step3Participants.tsx
│   │   │   │   ├── Step4Staff.tsx
│   │   │   │   ├── Step5Budget.tsx
│   │   │   │   ├── Step6Documents.tsx
│   │   │   │   └── Step7Publish.tsx
│   │   │   ├── SaoEventCreationModal.tsx   # 7-step wizard modal
│   │   │   ├── EventDetailView.tsx         # Event detail + student payment tabs
│   │   │   └── CreateOrganizationModal.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Organizations.tsx
│   │       ├── EventApprovals.tsx     # Lists events; opens SaoEventCreationModal & EventDetailView
│   │       ├── AttendanceMonitoring.tsx
│   │       ├── FinancialLiquidations.tsx
│   │       ├── StudentRegistry.tsx
│   │       ├── ReportsAnalytics.tsx
│   │       ├── Certificates.tsx       # Certificate module page (admin)
│   │       ├── Announcements.tsx
│   │       ├── AuditLogs.tsx
│   │       └── SystemSettings.tsx
│   │
│   ├── officer/                       # Officer panel
│   │   ├── components/
│   │   │   ├── OfficerLayout.tsx      # Officer shell
│   │   │   └── OfficerSidebar.tsx     # White sidebar, 240px
│   │   └── pages/
│   │       ├── OfficerDashboardPage.tsx
│   │       ├── EventManagement.tsx
│   │       ├── AttendanceLogs.tsx
│   │       ├── OfficerCertificates.tsx  # Certificate module (officer view)
│   │       ├── FinancialLiquidation.tsx
│   │       ├── MemberDirectory.tsx
│   │       ├── OfficerAnnouncements.tsx
│   │       └── OfficerSettings.tsx
│   │
│   ├── components/                    # Shared across admin + officer
│   │   ├── ui/                        # shadcn-style primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── input.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ...
│   │   └── figma/
│   │       └── ImageWithFallback.tsx  # Use instead of <img> for all images
│   │
│   ├── auth/                          # Login pages
│   │   ├── LandingPage.tsx
│   │   ├── SASAdminLogin.tsx
│   │   └── OfficerLogin.tsx
│   │
│   ├── routes.tsx                     # All React Router routes
│   ├── App.tsx                        # Root app component
│   └── ErrorPage.tsx
│
├── styles/
│   ├── theme.css                      # CSS custom properties, base typography
│   └── fonts.css                      # Font imports only (add @import here)
│
└── imports/                           # Figma-imported assets
    └── figma:asset/...                # Use figma:asset/hash.png import scheme
```

---

## 4. Routing

File: `src/app/routes.tsx`

```
/                       → LandingPage
/admin/login            → SASAdminLogin
/officer/login          → OfficerLogin

/home                   → Admin Layout (Sidebar + TopNav)
  /home                 → Dashboard
  /home/organizations   → Organizations
  /home/event-approvals → EventApprovals
  /home/attendance      → AttendanceMonitoring
  /home/liquidations    → FinancialLiquidations
  /home/students        → StudentRegistry
  /home/reports         → ReportsAnalytics
  /home/certificates    → Certificates
  /home/announcements   → Announcements
  /home/audit-logs      → AuditLogs
  /home/settings        → SystemSettings

/officer                → Officer Layout (OfficerSidebar)
  /officer/dashboard    → OfficerDashboardPage
  /officer/events       → EventManagement
  /officer/attendance   → AttendanceLogs
  /officer/certificates → OfficerCertificates
  /officer/liquidation  → FinancialLiquidation
  /officer/members      → MemberDirectory
  /officer/announcements → OfficerAnnouncements
  /officer/settings     → OfficerSettings
```

Router uses `createBrowserRouter`. Import from `"react-router"` (not `"react-router-dom"`).

---

## 5. Key Modules

### 5.1 SAO Event Creation Wizard
**Entry point:** `EventApprovals.tsx` → "Create Event (SAO)" button → `SaoEventCreationModal.tsx`

A 7-step full-screen wizard modal (`max-w-[1280px] h-[90vh]`):

| Step | File | Purpose |
|------|------|---------|
| 1 | `Step1EventDetails.tsx` | Event identity, org assignment, settings, media |
| 2 | `Step2Schedule.tsx` | Academic context, sessions (date/time), venue |
| 3 | `Step3Participants.tsx` | Eligible participants, year levels, per-session attendance time windows |
| 4 | `Step4Staff.tsx` | Event core team, scanner officer assignments + permissions |
| 5 | `Step5Budget.tsx` | Budget line items, funding sources, student payables calculator |
| 6 | `Step6Documents.tsx` | Required documents upload (3 required + dynamic adds), compliance checklist, adviser authorization |
| 7 | `Step7Publish.tsx` | Final review and publish |

Modal footer has: `← Previous` | `Save as Draft` + `Next Step →` (or `Create & Publish Event` on step 7)

All steps use `grid-cols-[1fr_300px]` layout (form left, preview panel right, sticky).

#### Step 5 Special Feature — Student Payables
Clicking "Student Payables" button opens a modal (`z-[60]`) with:
- Total event budget display (₱700,000 demo)
- Editable participant count
- Live ÷ calculation (budget ÷ students = per-student suggested fee)
- "Enable Student Payable" toggle → reveals admin-set fee input field
- Summary card shows total collection + surplus/buffer vs budget
- Red QR lock policy notice: unpaid students cannot check in

### 5.2 Event Detail View
**Entry point:** Any event row "View Details" button in `EventApprovals.tsx` → `EventDetailView.tsx`

Full-screen modal (`max-w-5xl h-[90vh]`) with two tabs:

**Overview tab:**
- 6-card event info grid (date, venue, type, org, budget, participants)
- Collection progress bar (total collected vs expected)
- Paid/Unpaid counters with QR lock indicators
- Quick list of unpaid students → shortcut to Payables tab

**Student Payables tab:**
- Stats row (fee per student, paid count, unpaid count, total collected)
- QR lock info banner
- Search bar + filter pills (All / Paid / Unpaid) + Export button
- Full student table: name, student ID, course/year, payment status pill, amount, date paid, QR ticket status
- Row `⋮` menu: Mark as Paid (triggers confirmation modal with QR unlock info) / Mark as Unpaid
- Confirmation modal: shows student name + amount + QR unlock notice

### 5.3 Certificate Module
**Files:** `src/app/admin/components/certificates/` and `src/app/officer/pages/OfficerCertificates.tsx`

6 screens navigated by state (not routes):

| Screen | Component | Description |
|--------|-----------|-------------|
| Dashboard | `CertificateDashboard.tsx` | Metrics, ready-to-generate events, saved templates |
| Template Library | `TemplateLibrary.tsx` | Card grid with search/sort, template management |
| Template Editor | `TemplateEditor.tsx` | Canvas with draggable name placeholder, settings panel |
| Generate | `GenerateCertificates.tsx` | Recipient table + live preview, manual add, source pills |
| Preview Modal | `PreviewModal.tsx` | Full-screen cert preview with navigation |
| Export Modal | `ExportModal.tsx` | Config → progress → done phases, format/quality options |

Admin cert page: `Certificates.tsx` at `/home/certificates`
Officer cert page: `OfficerCertificates.tsx` at `/officer/certificates` (uses same components with `isAdmin={false}`)

---

## 6. Design System Summary

See full patterns in:
- `docs/admin-design-patterns.md` — admin-specific colors, components, rules
- `docs/officer-design-patterns.md` — officer-specific colors, components, rules

### Quick Reference

| Element | Admin | Officer |
|---------|-------|---------|
| Sidebar bg | `#001A4D` dark navy | `#FFFFFF` white |
| Primary brand | `#001A4D` navy | `#83358E` violet |
| Active nav | `#1E70E8]/20` bg + `#FFC107` left bar | `#F3E8FF` bg + `#83358E` left bar |
| CTA button | navy/violet gradient | solid violet |
| Focus ring | `focus:ring-[#83358E]` | `focus:ring-[#83358E]` |
| Section accent | `border-l-4 border-[#83358E]` | `border-l-4 border-[#83358E]` |
| Admin badge | `bg-[#83358E] text-white` | hidden |

---

## 7. Shared Components

Located in `src/app/components/`:

| Component | Import path | Notes |
|-----------|-------------|-------|
| Button | `../../components/ui/button` | shadcn-style |
| Card, CardContent | `../../components/ui/card` | |
| Badge | `../../components/ui/badge` | |
| Input | `../../components/ui/input` | Used in TopNav search |
| Tabs, TabsList, TabsTrigger, TabsContent | `../../components/ui/tabs` | Used in EventApprovals |
| ImageWithFallback | `./components/figma/ImageWithFallback` | Use instead of `<img>` |

Relative import depth depends on the calling file's location. Always calculate the correct relative path.

---

## 8. Important Conventions

### Imports
- React Router: `import { ... } from "react-router"` — **not** `react-router-dom`
- Icons: `import { X, Plus, ... } from "lucide-react"`
- Images: `import img from "figma:asset/hash.png"` (no path prefix)
- SVGs from Figma: `import paths from "../imports/svg-wg56ef214f"`

### Component conventions
- Every page component in `admin/pages/` exports a **named export** (e.g. `export function Dashboard()`)
- Every step component in `sao-event-steps/` uses a **default export**
- `App.tsx` must always have a default export
- New component files go in `src/app/admin/components/` or `src/app/officer/components/`
- New shared components go in `src/app/components/`
- Only `.tsx` files — no `.html`, `.js`, `.jsx`

### State management
- No global state library. State lives in each page/modal component with `useState`
- Multi-step wizard passes `formData` object down and merges via `onUpdate` callback
- Modal open/close controlled by `isOpen` boolean prop

### Styling rules
- Tailwind v4 — no `tailwind.config.js`; do not create one
- Do not override `theme.css` tokens unless design style explicitly changes
- Default typography (h1–h4, button, label, input sizes) comes from `src/styles/theme.css`
- Font imports only in `src/styles/fonts.css`
- Never use `grid-cols-[720px_320px]` — always `grid-cols-[1fr_300px]`

---

## 9. Mock Data Locations

No backend. All data is hardcoded mock data inside each component/page file:
- `EventApprovals.tsx` — `events[]`, `approvedEvents[]`, `rejectedEvents[]`
- `EventDetailView.tsx` — `MOCK_STUDENTS[]`, `AMOUNT_PER_STUDENT`
- `Step5Budget.tsx` — `eventBudgetTotal = 700000`, org/sao/sponsorship fund amounts
- `CertificateDashboard.tsx` — template cards, ready-to-generate events
- `GenerateCertificates.tsx` — mock recipient list

---

## 10. Known Personas

| Name | Role | Appears In |
|------|------|-----------|
| Riselle Mae B. Lucanas | SAO Adviser | Step1 (created by), Step4 (SAO Supervisor), Step6 (authorization) |
| Maria Santos | SAO Administrator | TopNav, Sidebar user profile |
| Juan Dela Cruz | Organization Officer | OfficerSidebar profile |

---

## 11. Environment Notes

- Vite dev server is **already running** — do not start it manually
- Do not run `vite build` — it will fail in this environment
- Do not create `index.html` — the entrypoint is auto-generated
- Users access the app via a preview surface, not `localhost`
- Package manager is `pnpm` — use `pnpm add <package>` to install
