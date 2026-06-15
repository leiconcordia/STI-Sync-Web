Here's the complete Figma prompt for the **Event Proposal Review — View Details** in the SAO Admin Panel:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Event Proposal Review System** for the **STI Sync SAO Admin Panel** — specifically the View Details flow where the SAO Adviser can read every detail of an officer's submitted event proposal, write remarks, and make an approval decision (Approve, Return for Revision, or Reject). This is one of the most consequential screens in the entire admin panel because every campus event must pass through this review before it becomes real.
>
> The review experience must feel deliberate and thorough — the adviser should never feel rushed. Every piece of submitted information must be readable, organized, and easy to cross-reference. The decision buttons must feel weighty and intentional — not something accidentally clicked.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons. Optimized for 1440px desktop web.

---

## ENTRY POINT — EVENT APPROVALS LIST

> **Route:** `/admin/events`
>
> Before designing the detail view, establish the entry point clearly.
>
> **Event Approvals List Page (existing, enhanced):**
>
> **Page Header:**
> "Event Approvals" Dark Navy bold 22px. Breadcrumb "Dashboard > Event Approvals." Right side: "Bulk Approve" Green outline button (`ti-checks` icon) + "Export List" Dark Navy button.
>
> **Status Pipeline Tabs (horizontal, count badges):**
> All / Pending Review / Approved / Returned / Rejected / Completed. Active tab: Dark Navy bg, white text, Golden Yellow 3px bottom underline. Count badges: Pending = amber, Approved = green, Returned = amber, Rejected = red-orange, Completed = gray.
>
> **Filter Bar:**
> Organization dropdown + Event Type dropdown + Date Range picker + Search input (placeholder "Search event title or officer name...") + Sort dropdown (Newest / Oldest / Alphabetical).
>
> **Event Proposal Cards (list view, full width, stacked with 12px gap):**
> Each card: white bg, 0.5px `#E0E0E0` border, 16px radius, 20px padding.
>
> Card layout (single horizontal row):
> Left section (40%): event type color dot (8px circle, Violet/Cobalt/Coral/Teal by type) + event title Dark Navy bold 16px + organization name Violet 13px below title + proposal reference number gray 11px ("PROP-2026-0042").
>
> Center section (35%): four inline meta items with Tabler icons (gray 14px icon + gray 13px text, 20px gap between items): `ti-calendar` date range + `ti-map-pin` venue + `ti-users` expected attendees + `ti-receipt` budget request (₱ amount).
>
> Right section (25%): status pill (top-right of this section) + submitted by row (officer avatar 24px circle + officer name gray 12px + "submitted [relative time]" gray 11px) + action buttons row (bottom-right): "**View Details**" — Violet filled button (44px height, 8px radius, `ti-eye` icon, white text bold 14px) + `ti-dots-vertical` more options dropdown (Quick Approve, Quick Return, Export).
>
> Status pills: Pending Review = amber gradient pill + `ti-clock` icon. Approved = green gradient + `ti-check`. Returned = Cobalt pill + `ti-arrow-back`. Rejected = Red-Orange gradient + `ti-x`. Completed = gray + `ti-circle-check`.
>
> If status is "Returned": a small red-orange note strip appears below the card's bottom border: `ti-message` icon + "Returned X days ago — Officer has not yet resubmitted." red-orange 12px italic.
>
> If status is "Pending Review" and submission date is older than 3 days: amber strip: `ti-alert-triangle` + "Pending for X days — review recommended." amber 12px.
>
> **Clicking "View Details"** navigates to the full Event Proposal Review Page.

---

## MAIN SCREEN — EVENT PROPOSAL REVIEW PAGE

> **Route:** `/admin/events/{eventId}/review`
>
> **Full browser viewport. Uses the existing admin shell (sidebar + topbar). Main content area is the review layout.**

---

> ### PAGE HEADER

> Full width, white bg, 0.5px bottom border `#E0E0E0`, 64px height, 24px horizontal padding.
>
> Left side:
> `ti-arrow-left` Dark Navy icon button (32px, `#F5F5F5` hover bg, 8px radius) + "Back to Event Approvals" Dark Navy 14px text link, 12px gap. A thin vertical `#E0E0E0` divider (20px tall), 16px gap. Breadcrumb: "Dashboard > Event Approvals > [Event Title truncated to 40 chars]" gray 12px.
>
> Right side:
> Proposal reference pill: Golden Yellow bg, Dark Navy bold monospace 13px "PROP-2026-0042". 16px gap. Current status pill (large version, 44px height, 16px horizontal padding): Pending Review = amber gradient, `ti-clock` white icon + "Pending Review" white bold 14px. 16px gap. "Export Proposal PDF" Dark Navy outline button (36px, 8px radius, `ti-download` icon, Dark Navy text 13px).

---

> ### REVIEW PAGE LAYOUT (Three-Column)

> The review page uses a **three-column layout** inside the main content area:
>
> **Left Column (4/12 — 380px) — Proposal Navigator:**
> Sticky scroll. Lets the adviser jump between proposal sections without scrolling. Acts like a table of contents.
>
> **Center Column (5/12 — flexible) — Full Proposal Content:**
> All submitted event details displayed in organized, readable sections. Scrollable independently.
>
> **Right Column (3/12 — 300px) — Decision Panel:**
> Sticky. The adviser writes remarks and makes the final decision from here. Always visible regardless of scroll position.

---

## LEFT COLUMN — PROPOSAL NAVIGATOR

> White bg, 0.5px right border `#E0E0E0`, sticky, full height, 20px padding.
>
> **Navigator Header:**
> "Proposal Sections" Dark Navy bold 14px + `ti-list` gray icon right.
>
> **Section Navigation List (vertical, 8px gap):**
> Each nav item: a clickable row (full width, 40px height, 8px radius, 12px horizontal padding). Active (currently in view): Light Violet `#F3E8FF` bg, Violet text bold 13px, Violet 3px left accent. Inactive: white bg, Dark Navy 13px, hover = `#F5F5F5`. A completion indicator dot (8px circle) on the right of each item: green = section has complete data, amber = section has partial data, red = section has missing required data.
>
> Navigator items (in order):
> 1. `ti-info-circle` — Event Overview
> 2. `ti-calendar` — Schedule & Venue
> 3. `ti-users` — Participants & Audience
> 4. `ti-shield` — Event Team & Scanners
> 5. `ti-receipt` — Budget Request
> 6. `ti-file-text` — Submitted Documents
> 7. `ti-history` — Submission History
>
> Clicking any item smoothly scrolls the center column to that section and sets it as active.
>
> **Review Progress Card (below nav list, Light Violet bg, Violet border 1px, 12px radius, 14px padding):**
> `ti-clipboard-check` Violet icon (20px) + "Review Progress" Violet bold 13px. Below: a mini checklist of what the adviser has done so far in this review session:
> - "Viewed all sections" — gray circle turns Violet check when all 7 nav items have been visited
> - "Remarks written" — turns Violet when remarks textarea has content
> - "Decision made" — turns green check only after final decision button clicked
>
> "Review checklist helps ensure thorough evaluation." gray italic 11px below checklist.
>
> **Officer Contact Card (below review progress, white bg, 0.5px border, 12px radius, 14px padding):**
> "Submitting Officer" Dark Navy bold 13px. Officer avatar (40px circle) + officer name Dark Navy bold 14px + student ID gray 12px + organization Violet 12px + "Officer" Violet pill. Contact row: `ti-mail` gray icon + email gray 12px (tapping opens email client). `ti-phone` gray icon + contact number gray 12px.
> "Send Message" Cobalt Blue outline button (full width, 36px, 8px radius, `ti-message` icon) — opens announcement/notification compose addressed to this officer.

---

## CENTER COLUMN — FULL PROPOSAL CONTENT

> White bg, 24px horizontal padding, 24px top padding. Scrollable independently (CSS overflow-y: auto). Each section separated by 32px vertical gap.
>
> **Section header pattern (consistent for all 7 sections):**
> A full-width section divider row: Violet 4px left accent bar (24px tall, rounded) + section title Dark Navy bold 18px + section completion badge (green "Complete" pill or amber "Incomplete" pill or red "Missing Required Data" pill, 11px text) — right-aligned. Below title: gray 13px subtitle describing what this section covers. A thin `#E0E0E0` line below the subtitle.

---

> ### SECTION 1 — EVENT OVERVIEW

> Section header: `ti-info-circle` icon + "Event Overview" + completion badge.
>
> **Event Identity Card (full width, white, 0.5px border, 16px radius, 20px padding):**
>
> **Card Top — Visual Identity Row:**
> If event banner uploaded: full-width banner image (full card width, 180px height, 16px top radius, object-fit cover). If not uploaded: `#F3E8FF` gradient placeholder (same dimensions, centered `ti-photo` Cobalt icon 48px + "No banner uploaded" gray 14px).
>
> Below banner: two side-by-side image containers (if both uploaded):
> - Event Banner thumbnail (120px × 68px, 8px radius, Dark Navy border 1px) + "Event Banner" gray 11px label above
> - Promotional Poster thumbnail (68px × 96px portrait, 8px radius, Dark Navy border) + "Promotional Poster" gray 11px label above
> Each thumbnail has a `ti-eye` Cobalt icon overlay on hover — clicking opens full-size preview modal.
>
> **Card Body — Event Details (two-column grid, 24px gap):**
> Left column:
> - "Event Title" gray 11px uppercase label + event title Dark Navy bold 20px (large, prominent)
> - "Event Subtitle" gray 11px + subtitle Dark Navy 15px (or "Not provided" gray italic if empty)
> - "Description" gray 11px + description text Dark Navy 14px line-height 1.7 (full text, no truncation — adviser must read everything)
>
> Right column (structured info rows, each 44px height with `#E0E0E0` bottom divider, icon + label + value):
> - `ti-tag` — Event Type: Violet pill (e.g., "Academic")
> - `ti-bookmark` — Category: gray pill (e.g., "Seminar")
> - `ti-building` — Organization: Violet bold text + org avatar (24px)
> - `ti-eye` — Visibility: "Public" green pill or "Private" gray pill
> - `ti-certificate` — Certificate: "Enabled" green pill or "Disabled" gray pill
> - `ti-qrcode` — QR Attendance: "Required" Cobalt pill or "Not Required" gray pill
> - `ti-scan` — Require Scan-Out: "Yes" Cobalt pill or "No" gray pill
>
> **Objectives Card (full width, Light Violet bg, Violet left border 3px, 12px radius, 16px padding, 12px top margin):**
> "Event Objectives" Violet bold 14px + `ti-target` Violet icon right. Objectives rendered as a numbered list: each objective as a row with a Violet numbered circle (24px, Violet bg, white bold number, 8px radius) + objective text Dark Navy 14px, line-height 1.5.

---

> ### SECTION 2 — SCHEDULE & VENUE

> Section header: `ti-calendar` + "Schedule & Venue."
>
> **Academic Context Card (white, 0.5px border, 12px radius, 16px padding):**
> Horizontal row (3 equal sections, vertical dividers): School Year Dark Navy bold 14px / Semester Dark Navy bold 14px / Proposal Submission Date Dark Navy bold 14px. Gray 11px labels above each value.
>
> **Registration Window Card (white, 0.5px border, 12px radius, 16px padding, 12px top margin):**
> "Registration Window" Dark Navy bold 14px. Two-column: Registration Opens (date + time, Cobalt bold) / Registration Closes (date + time, Cobalt bold). A horizontal timeline bar below: left dot "Opens" (Cobalt) → fill bar → right dot "Closes" (Cobalt) → dashed line → right dot "Event Day" (Violet). Timeline proportional to actual date distances.
>
> **Sessions Cards (stacked vertically, 8px gap, 12px top margin):**
> Section label "Event Sessions" Dark Navy bold 14px + session count badge (Violet pill, e.g., "2 Sessions").
>
> Each session: white card, Violet 3px left border, 16px radius, 16px padding:
> - Session header: "Session [N]" Violet bold 14px + session name Dark Navy bold 16px right
> - Four inline meta items (icon + label + value, 24px gap): `ti-calendar` date / `ti-clock` start–end time / `ti-hourglass` duration (auto-computed, e.g., "4 hours 30 min") / `ti-players` status (Active/Postponed/Cancelled pill)
>
> **Venue & Logistics Card (white, 0.5px border, 12px radius, 16px padding, 12px top margin):**
> Two-column grid:
> Left: "Requested Venue" gray 11px label + venue name Dark Navy bold 16px + building/floor gray 13px + `ti-users` capacity gray 12px. Venue availability badge below: green "No Conflicts Detected" or red-orange "Conflict Detected — [conflicting event name]."
>
> Right: "Event Format" gray 11px + format pill (In-Person Violet / Online Cobalt / Hybrid Dark Navy) + "Online Meeting Link" (shown if online/hybrid): Cobalt text link with `ti-external-link` icon.
>
> **Equipment Requested Card (white, 0.5px border, 12px radius, 16px padding, 12px top margin):**
> "Equipment Requested" Dark Navy bold 14px. Requested items as pill chips (2-column wrap): each chip Dark Navy bg, Golden Yellow text, `ti-check` icon left, 11px text. If no equipment requested: "No equipment requested." gray italic.
>
> **Notes to Adviser Card (amber bg 10% opacity, amber 1px border, 12px radius, 14px padding, 12px top margin):**
> `ti-message` amber icon + "Notes from Officer" amber bold 13px. Officer's notes text in Dark Navy 14px italic line-height 1.6. If no notes: "No additional notes provided." gray italic.

---

> ### SECTION 3 — PARTICIPANTS & AUDIENCE

> Section header: `ti-users` + "Participants & Audience."
>
> **Participant Limits Card (white, 0.5px border, 12px radius, 16px padding):**
> Three equal columns (vertical dividers): Maximum Participants (Dark Navy bold 24px number or "Unlimited" gray) / Minimum Required (Dark Navy bold 24px or "Not set" gray) / Expected Attendance (Dark Navy bold 24px, from venue/schedule step). Gray 11px labels above each.
>
> **Target Audience Card (white, 0.5px border, 12px radius, 16px padding, 12px top margin):**
> "Target Audience" Dark Navy bold 14px.
>
> Two rows:
> - "Target Departments" gray 11px label + department chips (Violet bg, white text, 12px font — each dept as a pill). If all departments: single "All Departments" Violet bold pill.
> - "Target Year Levels" gray 11px label + year level pills (Dark Navy bg, Golden Yellow text). If all: "All Year Levels."
>
> "Open to All Students" status row: `ti-globe` Cobalt icon + "Open to all students regardless of department/year" green text (if ON) or "Restricted to targeted audience only" gray text (if OFF).
>
> **Estimated Reach Card (Light Violet bg, Violet border 1px, 12px radius, 14px padding, 12px top margin):**
> `ti-chart-bar` Violet icon + "Estimated Reach" Violet bold 13px. Horizontal bar chart (simplified, read-only): each department as a bar showing estimated eligible student count. Total estimated reach: Violet bold 18px number right-aligned.
>
> **Attendance Rules Card (white, 0.5px border, 12px radius, 16px padding, 12px top margin):**
> "Attendance Rules" Dark Navy bold 14px. Three-column grid:
> - Late Threshold: amber bold number + "minutes" gray 12px
> - Grace Period: Cobalt bold number + "minutes"
> - Auto-Absent Timer: red-orange bold number + "minutes"
> Below: Scan-In Required (green `ti-check` or gray `ti-x`) + Scan-Out Required (green `ti-check` or gray `ti-x`) — shown as labeled row.
>
> **Certificate Rules Card (shown only if certificate enabled, Light Violet bg, Violet border):**
> `ti-certificate` Violet + "Certificate Settings" Violet bold 13px. Award criteria as green pill chips. Threshold % if applicable. Template name if selected.

---

> ### SECTION 4 — EVENT TEAM & SCANNERS

> Section header: `ti-shield` + "Event Team & Scanners."
>
> **Core Team Card (white, 0.5px border, 16px radius, 20px padding):**
> "Proposed Core Team" Dark Navy bold 14px. Team members as a structured list. Each row (52px height, `#E0E0E0` bottom divider):
> - Left: role label in Violet bold 13px (fixed width 180px)
> - Center: member avatar (36px circle, photo or initials) + member name Dark Navy bold 14px + student ID gray 12px + course/year gray 11px
> - Right: "Assigned" green pill if filled or "Not Assigned" gray pill if empty
>
> Roles listed: Event Head / Co-Head / Secretary / Treasurer / Logistics Officer / Program Coordinator / Safety Officer + any custom roles.
>
> If Event Head not assigned: red-orange warning row: `ti-alert-circle` red icon + "Event Head is required — proposal cannot be approved without an Event Head." red-orange 13px.
>
> **Scanner Officers Card (white, 0.5px border, 16px radius, 20px padding, 16px top margin):**
> "Proposed Scanner Officers" Dark Navy bold 14px + scanner count badge.
>
> Each scanner: white card with Violet 3px left border (12px radius, 16px padding, 8px gap between scanner cards):
> - Header row: scanner role pill (Primary/Secondary/Backup — Violet/Cobalt/gray pills) + scanner name Dark Navy bold 14px right
> - Info row: avatar (40px) on left + name Dark Navy bold + student ID gray 12px + course/year gray 11px + contact number gray 11px
> - Permissions row (below info, 12px top padding, `#E0E0E0` top border): four permission pills showing what was requested:
>   - "Scan In" green pill (if enabled) or gray outline "Scan In" (if disabled)
>   - "Scan Out" green/gray
>   - "View Logs" Cobalt/gray
>   - "Export Data" Dark Navy/gray
>
> If no scanners assigned: amber warning card: `ti-alert-triangle` amber + "No scanner officers assigned. At least one scanner is required for QR attendance events." amber 13px.

---

> ### SECTION 5 — BUDGET REQUEST

> Section header: `ti-receipt` + "Budget Request."
>
> **Budget Ceiling Reference Card (full width, amber bg 10% opacity, amber 1px border, 12px radius, 14px padding):**
> `ti-info-circle` amber + "Budget Reference" amber bold 13px. "This organization's SAO-approved semester budget ceiling is ₱[amount]." Dark Navy 13px. Below: "Requested Total" row: "₱[X] requested vs ₱[Y] ceiling" — comparison bar: Violet fill (requested) vs full width (ceiling). If over ceiling: bar turns Red-Orange + "⚠ Budget request EXCEEDS the approved ceiling by ₱[Z]." red-orange bold 13px.
>
> **Budget Overview Cards (4 mini stat cards, 2×2 grid, 12px gap, 12px top margin):**
> Each card: white bg, 0.5px border, 12px radius, 14px padding:
> - "Total Requested" — Violet bold ₱ number, `ti-cash` icon
> - "From SAO Budget" — Cobalt bold ₱, `ti-building` icon
> - "From Org Funds" — Green bold ₱, `ti-wallet` icon
> - "From Sponsorship" — Golden Yellow bold ₱, `ti-star` icon
>
> **Itemized Budget Table (full width, white, 0.5px border, 12px radius, 16px top margin):**
> "Itemized Budget Breakdown" Dark Navy bold 14px.
>
> Table (full width, no outer padding, inside card):
> Column headers (gray 11px uppercase, `#F8F8F8` header row, `#E0E0E0` bottom border): # / Category / Description / Qty / Unit Cost / Total / Funding Source / Justification.
>
> Each data row (44px height, `#E0E0E0` bottom divider, hover = Light Violet `#F3E8FF` bg):
> - #: gray 12px number
> - Category: colored pill (small, 10px text) matching category color
> - Description: Dark Navy 13px, max 2 lines
> - Qty: Dark Navy 13px centered
> - Unit Cost: Dark Navy 13px right-aligned
> - Total: Dark Navy bold 13px right-aligned
> - Funding Source: gray 12px
> - Justification: gray 12px italic (truncated, full text on hover tooltip)
>
> Summary row (Dark Navy bg, white text, no border): "Total" bold left span + total amount Golden Yellow bold right.
>
> **Admin Budget Adjustment Panel (full width, Light Violet bg, Violet border 2px, 16px radius, 20px padding, 16px top margin — ADMIN ONLY):**
> `ti-edit` Violet icon + "Budget Review (SAO Adviser)" Violet bold 14px. Description: "You may adjust individual line item approval amounts before approving. Officers will see your adjustments." gray 12px italic.
>
> A simplified table showing only: Item # / Description / Requested Amount / **Approved Amount (editable ₱ input, Violet focus ring)** / Approval Status (dropdown per row: Approved / Reduced / Rejected). Each row also has an "Admin Remarks on Item" short text input (placeholder "Note for officer...").
>
> Total Approved Amount auto-computed from individual approvals: shown in Violet bold below the table. "Reset All to Requested Amounts" gray text link right-aligned.

---

> ### SECTION 6 — SUBMITTED DOCUMENTS

> Section header: `ti-file-text` + "Submitted Documents."
>
> **Documents Grid (2-column, 12px gap):**
> Each document: white card, 0.5px border, 12px radius, 16px padding.
>
> Card layout:
> Left side (56px): document type icon container (56px × 56px, rounded 12px). PDF = Red-Orange bg 15% opacity, `ti-file-type-pdf` Red-Orange icon. DOCX = Cobalt bg 15%, `ti-file-type-doc` Cobalt icon. Image = Violet bg 15%, `ti-photo` Violet icon.
>
> Right side: document title Dark Navy bold 14px + document type label gray 12px (e.g., "Event Proposal Document — Required") + file name gray 11px italic + file size gray 11px + upload date gray 11px.
>
> Bottom action row (8px top margin, `#E0E0E0` top border, 8px top padding): "Preview" Cobalt text link (`ti-eye` icon) + "Download" Dark Navy text link (`ti-download` icon) + "Open in New Tab" gray text link (`ti-external-link` icon).
>
> **Required documents** (3): have a green "Required ✓" badge top-right of card if uploaded, red-orange "Required — Missing" badge if not uploaded.
>
> **Optional documents** (5): gray "Optional" badge if not uploaded, Cobalt "Uploaded" badge if uploaded.
>
> **Missing Documents Warning (shown if any required docs missing, full width, Red-Orange bg 8% opacity, Red-Orange 1px border, 12px radius, 14px padding, 12px top margin):**
> `ti-alert-circle` red icon + "Missing Required Documents" red-orange bold 14px. Lists the missing document names as red-orange bullet points. "Approval cannot proceed without all required documents. Return this proposal for correction." red-orange 13px.

---

> ### SECTION 7 — SUBMISSION HISTORY

> Section header: `ti-history` + "Submission History."
>
> **Submission Timeline (full width, white, 0.5px border, 16px radius, 20px padding):**
> A vertical timeline showing the complete proposal lifecycle. Each event as a timeline node:
>
> Node structure: colored circle (24px) on left with connecting vertical line + timestamp (date + time) gray 12px below node + event label Dark Navy bold 14px right of node + actor (officer or adviser name) gray 12px below label + notes/remarks gray 13px italic below actor (if any).
>
> Timeline events (in chronological order, most recent at top):
> - Draft Created: gray circle, `ti-pencil` white icon, "Draft Created" label + "by [Officer Name]"
> - Submitted for Review: Cobalt circle, `ti-send` white icon, "Submitted for Review"
> - Under Review: Golden Yellow circle, `ti-eye` Dark Navy icon, "Under SAO Review"
> - (if returned previously) Returned for Revision: amber circle, `ti-arrow-back` white icon, "Returned — [return reason category]" + adviser remarks shown as italic quote below
> - (if revised) Resubmitted: Cobalt circle, `ti-send` icon, "Resubmitted by Officer"
> - (current) Under Review: Golden Yellow pulsing circle (animated), "Currently Under Review — Awaiting Decision"
>
> If this is a first submission with no prior history: only Draft Created + Submitted + Under Review nodes.
>
> **Resubmission Count Badge (shown if proposal has been returned before):**
> Full width amber card (12px radius, 12px padding, 12px top margin): `ti-refresh` amber icon + "This proposal has been returned X time(s) and resubmitted. Review the revision history above carefully." amber 13px. "Resubmission X of [max allowed]" amber bold right-aligned.

---

## RIGHT COLUMN — DECISION PANEL

> White bg, 0.5px left border `#E0E0E0`, sticky (fixed while center column scrolls), full height, 24px padding.
>
> The decision panel has three visual states: Default (blank remarks), Remarks Written (remarks field has content), and Decision Made (after a button is clicked).

---

> ### DECISION PANEL — DEFAULT STATE

> **Panel Header:**
> `ti-gavel` Dark Navy icon (24px) + "Adviser Decision" Dark Navy bold 16px. Gray 13px subtitle: "Review all sections before making your decision."
>
> **Adviser Remarks Card (full width, white, 0.5px border, 12px radius, 16px padding):**
> "Adviser Remarks" Dark Navy bold 14px + Violet 4px left accent. Required indicator for Return/Reject (red `*` appears when those buttons are active).
>
> Textarea (full width, 8 rows, `#E0E0E0` border 0.5px, 8px radius, Violet 2px focus ring, placeholder "Write your remarks, feedback, or instructions for the officer here. These will be sent directly to the submitting officer with your decision."): Dark Navy 14px, line-height 1.6.
>
> Character counter below textarea: "X / 1000 characters" gray 11px right-aligned.
>
> **Remarks visibility note** (Light Violet bg, Violet border 1px, 12px radius, 10px padding, 8px top margin): `ti-eye` Violet icon + "Remarks are visible to the submitting officer and stored in the proposal record." Violet italic 11px.
>
> **Decision History Note (shown if proposal was previously reviewed):**
> Collapsible section below textarea: "Previous Remarks" gray 13px + `ti-chevron-down` toggle. Expanded: shows all previous adviser remarks with dates as a mini timeline.

---

> ### THREE DECISION BUTTONS (stacked, 12px gap, 16px top margin)

> Each button is large and visually distinct — the decisions are consequential and must never feel accidental.

---

> **Button 1 — APPROVE:**
> Full width, 56px height, 12px radius. Green gradient background `#22C55E` → `#16A34A`. White bold text 16px "Approve Proposal". `ti-circle-check` white icon (20px) left inside button. On hover: gradient darkens 10%. On click: button shows loading state (spinner + "Processing...").
>
> Below button: gray 11px italic "Officer will be notified immediately. Event will be published to the student feed."

---

> **Button 2 — RETURN FOR REVISION:**
> Full width, 56px height, 12px radius. Amber `#FFC107` background at 100% opacity. Dark Navy bold text 16px "Return for Revision". `ti-arrow-back` Dark Navy icon left. On hover: bg darkens. On click: if remarks textarea is empty: textarea border turns Red-Orange + error message appears below textarea "Remarks are required when returning a proposal — explain what needs to be corrected." and button does NOT proceed. If remarks filled: shows loading state.
>
> Below button: gray 11px italic "Officer will receive your remarks and can revise and resubmit."

---

> **Button 3 — REJECT:**
> Full width, 52px height, 12px radius. White bg, Red-Orange `#EF4444` border 1.5px, Red-Orange text bold 15px "Reject Proposal". `ti-x` Red-Orange icon left. Intentionally smaller and less prominent than the other two buttons — rejection should be rare and deliberate. On hover: Red-Orange bg 8% opacity fill. On click: if remarks empty, same validation as Return. If remarks filled: opens Rejection Confirmation Modal before proceeding.

---

> ### REJECTION CONFIRMATION MODAL (triggered by Reject button click)

> Centered modal, 520px wide, white, 16px radius, `rgba(0,0,0,0.6)` overlay.
>
> **Modal Header (64px, Red-Orange gradient `#EF4444` → `#F97316`):**
> `ti-x` white icon (28px) centered left in semi-transparent white circle (44px) + "Confirm Rejection" white bold 18px + event title in Golden Yellow 13px below title.
>
> **Modal Body (24px padding):**
>
> Red-Orange bg 8% opacity card (12px radius, 16px padding): `ti-alert-circle` Red-Orange icon (20px) + "This action will permanently reject this event proposal. The officer will be notified and the proposal will be closed." Dark Navy bold 14px line-height 1.5.
>
> "Rejection Details" Dark Navy bold 14px + Violet left accent, 16px top margin.
>
> Rejection Reason Category (dropdown, required, 44px height, full width): Fraudulent or Misleading Information / Insufficient Documentation / Budget Exceeds Approved Limit / Scheduling or Venue Conflict / Policy Violation / Event Not Aligned with Institutional Goals / Duplicate Event / Other. Placeholder "Select rejection reason category..."
>
> Allow Resubmission (toggle row, 44px): "Allow officer to submit a new proposal for this event" Dark Navy bold 13px + gray 12px description "Officer can submit a fresh proposal after the specified waiting period." + Violet toggle right (ON by default).
>
> Resubmission Wait Period (shown when Allow Resubmission is ON, 12px top margin): "Officer can resubmit after" + number input (44px, 60px wide, center) + "days" Dark Navy 13px. Default: 7 days.
>
> Adviser Remarks Preview (read-only, gray bg `#F8F8F8`, 8px radius, 12px padding, 12px top margin): `ti-quote` gray icon + adviser's typed remarks shown as a preview quote. "The officer will receive these remarks with the rejection notice." gray 11px italic below.
>
> **Modal Footer (56px, white, 1px top border):**
> "Cancel — Go Back" gray outline button left (36px, 8px radius) + "Confirm Rejection" Red-Orange gradient button right (44px, 8px radius, `ti-x` white icon + white bold text). On Confirm: loading state → decision recorded.

---

> ### APPROVAL CONFIRMATION MODAL (triggered by Approve button click)

> Centered modal, 540px wide.
>
> **Modal Header (64px, Green gradient):**
> `ti-circle-check` white icon (28px) in semi-transparent white circle + "Confirm Approval" white bold 18px + event title Golden Yellow 13px.
>
> **Modal Body (24px padding):**
>
> Green bg 8% opacity card (12px radius, 16px padding): `ti-check` green icon + "You are about to approve this event proposal. The following will happen immediately:" Dark Navy bold 14px.
>
> Impact checklist (vertical list, 8px gap, Dark Navy 13px line-height 1.7 with green `ti-check` icon left, 16px top margin):
> - Event status set to "Approved"
> - Event published to the student discovery feed
> - Submitting officer notified via in-app + push notification
> - All assigned event team members notified of their roles
> - Scanner activation codes generated for assigned scanners
> - Budget authorization recorded: ₱[approved total amount]
> - Liquidation deadline set: [auto-computed date, X days after event end]
> - Event added to SAO master calendar
>
> **Budget Authorization Summary (white, 0.5px border, 12px radius, 14px padding, 16px top margin):**
> "Budget to be Authorized" Dark Navy bold 13px. Three rows: SAO Budget (₱ amount) + Org Funds (₱) + Sponsorship (₱) + Total Authorized (Dark Navy bold + Golden Yellow ₱ bold). If budget was adjusted in Section 5: shows "Requested: ₱X → Approved: ₱Y (adjusted)" with adjusted amount in Violet.
>
> Adviser Remarks (optional for approval): textarea pre-filled with any remarks typed in the decision panel. Label: "Optional remarks for the officer (will be included with approval notification):" gray 12px.
>
> **Modal Footer:**
> "Cancel" gray outline left + "Approve & Publish Event" Green gradient button right (48px, 12px radius, `ti-rocket` white icon + white bold text).

---

> ### RETURN FOR REVISION CONFIRMATION MODAL

> Centered modal, 520px.
>
> **Modal Header (64px, Amber gradient `#FFC107` → `#F59E0B`):**
> `ti-arrow-back` Dark Navy icon (28px) in semi-transparent Dark Navy circle + "Return for Revision" Dark Navy bold 18px + event title Dark Navy 13px at 80%.
>
> **Modal Body (24px padding):**
>
> Amber bg 10% opacity card: `ti-pencil` amber icon + "The proposal will be returned to the officer with your remarks. They can revise and resubmit." Dark Navy 14px.
>
> "Flagged Items to Correct" Dark Navy bold 14px + Violet left accent, 16px top margin. Multi-select checklist (officer will see these as the specific items to correct): checkboxes with amber checked state:
> - [ ] Event Information (title, description, objectives)
> - [ ] Schedule or Venue
> - [ ] Participant Settings
> - [ ] Event Team Assignment
> - [ ] Budget Request
> - [ ] Submitted Documents
> - [ ] Other (reveals text input)
>
> "Resubmission Deadline" (optional): date picker + "Set a deadline for resubmission (optional — leave blank for no deadline)." gray 12px.
>
> Adviser Remarks Preview (same read-only preview style as rejection modal).
>
> Resubmission Count note: "This will be return #[N]. Officer has [max - N] resubmission(s) remaining." amber 12px.
>
> **Modal Footer:**
> "Cancel" gray left + "Return for Revision" Amber gradient button right (Dark Navy text bold, `ti-send` icon).

---

> ### DECISION PANEL — AFTER DECISION IS MADE

> Once any decision is confirmed, the right column Decision Panel transforms:
>
> **Decision Recorded State:**
> The three decision buttons disappear. The textarea becomes read-only (gray bg). A large status card fills the panel:
>
> If Approved: Green gradient card (full width, 80px, 16px radius). `ti-circle-check` white icon (40px) + "Proposal Approved" white bold 18px + approval timestamp white 12px.
>
> If Returned: Amber gradient card. `ti-arrow-back` Dark Navy icon (40px) + "Returned for Revision" Dark Navy bold 18px + return timestamp.
>
> If Rejected: Red-Orange gradient card. `ti-x` white icon (40px) + "Proposal Rejected" white bold 18px + rejection timestamp.
>
> Below the status card: "Undo Decision" gray text link (`ti-rotate` icon, 12px) — only available for 5 minutes after decision. After 5 minutes: link disappears and decision is permanent.
>
> "View Next Pending Proposal" Cobalt Blue outline button (full width, 44px, 8px radius, `ti-chevron-right` icon) — navigates to the next proposal in the Pending Review queue.
>
> "Back to Event Approvals" Dark Navy text link centered below.

---

## GLOBAL DESIGN NOTES FOR THIS FEATURE

> - **Read everything before deciding.** The left column navigator's "Review Progress" card that tracks which sections have been visited creates a soft nudge for the adviser to read thoroughly before clicking a decision button. The system doesn't block decisions but makes thoroughness visible.
>
> - **Remarks validation.** Return and Reject decisions require remarks — the system enforces this. Approve does not require remarks (though it's offered as optional). This reflects real institutional behavior: approvals don't need explanation, but returns and rejections do.
>
> - **Decision weight.** The three buttons are deliberately different sizes and visual weights: Approve is the largest and most prominent (green gradient, 56px), Return is medium (amber, 56px but different color energy), Reject is the smallest and most restrained (outlined, 52px). This visual hierarchy reflects the intended frequency of use.
>
> - **Confirmation modals.** All three decisions show a confirmation modal — even Approve — because the consequences are immediate and system-wide (event published, notifications sent, budgets authorized). The confirmation modal for Approve shows exactly what will happen so the adviser is never surprised.
>
> - **Document preview.** All uploaded documents can be previewed inline (in a full-screen preview modal) or downloaded. The adviser should never need to leave this page to review attachments.
>
> - **Budget adjustment.** The admin-only Budget Review panel in Section 5 allows the adviser to set approved amounts different from requested amounts per line item. This is a powerful institutional control — officers request, adviser authorizes.
>
> - **Undo window.** The 5-minute undo window after a decision is a safety net for accidental clicks. After 5 minutes, all decisions are permanent and create audit log entries.
>
> - **Audit trail.** Every view, every remark edit, and every decision in this flow is logged to `/audit_logs` via Cloud Function with timestamp, adviser ID, and full before/after state.
>
> - Optimized for 1440px desktop. Left navigator 380px fixed. Right decision panel 300px fixed. Center content fills remaining width, max ~640px effective reading width. 24px page padding throughout.