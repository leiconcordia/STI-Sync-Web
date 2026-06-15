Here's the complete Figma prompt for the **EDMS (Electronic Document Management System)**:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Electronic Document Management System (EDMS)** for **STI Sync** — a two-way digital document pipeline between Student Organization Leaders and the Student Affairs Services (SAS) administration. This module completely replaces the manual routing of physical papers. Officers submit documents upward to SAS for review and approval. SAS broadcasts official documents downward to clubs. Both sides have their own dedicated interface within the existing STI Sync dashboard shells.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E` · **Light Violet** `#F3E8FF`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons. Optimized for 1440px desktop web.

---

## SIDEBAR NAVIGATION UPDATES

---

> ### OFFICER SIDEBAR — NEW NAV ITEM

> Insert between "Announcements" and "Settings":
> `ti-files` — Documents (EDMS)
>
> Active state: Light Violet `#F3E8FF` bg pill, Violet text + icon, Violet 3px left accent. Badge: red count badge showing number of new documents received from SAS that haven't been opened yet.
>
> Updated Officer sidebar full list:
> - `ti-layout-dashboard` — Dashboard
> - `ti-calendar-event` — Event Management
> - `ti-qrcode` — Attendance Logs
> - `ti-cash` — Finance Center
> - `ti-certificate` — Certificates
> - `ti-users` — Member Directory
> - `ti-coin` — Dues & Payables
> - `ti-building` — Organization Profile
> - `ti-files` — **Documents** *(NEW)*
> - `ti-bell` — Announcements
> - `ti-settings` — Settings

---

> ### ADMIN SIDEBAR — NEW NAV ITEM

> Insert between "Reports & Analytics" and "Announcements":
> `ti-files` — Document Management
>
> Active state: Golden Yellow 4px left accent + Royal Blue 20% opacity bg + white text. Badge: red count badge showing total pending documents awaiting SAS review.
>
> Updated Admin sidebar full list:
> - `ti-layout-dashboard` — Dashboard Overview
> - `ti-building` — Organization Management
> - `ti-calendar-event` — Event Approvals
> - `ti-qrcode` — Attendance Monitoring
> - `ti-receipt` — Financial Liquidations
> - `ti-users` — Student Registry
> - `ti-chart-bar` — Reports & Analytics
> - `ti-files` — **Document Management** *(NEW)*
> - `ti-bell` — Announcements
> - `ti-shield` — Audit Logs
> - `ti-settings` — System Settings

---

# PART 1 — OFFICER EDMS INTERFACE

---

## SCREEN 1 — OFFICER DOCUMENTS HUB

> **Route:** `/officer/documents`
>
> **Page Header:**
> "Documents" Dark Navy bold 22px. Breadcrumb "Dashboard > Documents." Right side: "+ Submit Document" primary Violet button (44px height, 8px radius, `ti-upload` white icon left, white bold text 14px) — this is the most important action on this page, always visible and prominent.

---

> ### CONTEXT BANNER (Full Width)

> Light Violet `#F3E8FF` bg, Violet 1px border, 16px radius, 16px padding. `ti-files` Violet icon (24px) left + "Electronic Document Management System" Violet bold 14px + "Submit documents to the SAS for approval and receive official files, memos, and guidelines directly from the Student Affairs Services." Dark Navy 13px line-height 1.5. Right side: two small stat chips (white bg, 0.5px Violet border, 8px radius, 12px padding): "X Submitted" Dark Navy + `ti-arrow-up` Violet icon / "X Received from SAS" Dark Navy + `ti-arrow-down` Cobalt icon.

---

> ### FOUR METRIC STAT CARDS (Horizontal Row, White Cards)

> Each card: white bg, 0.5px `#E0E0E0` border, 16px radius, 20px padding. Top: colored Tabler icon (24px) top-right + gray 12px label top-left. Bottom: bold 28px number + gray 12px note below.
> - "Pending Review" — Amber number + `ti-clock` amber icon + "awaiting SAS decision" note
> - "Approved" — Green number + `ti-circle-check` green icon + "this semester" note
> - "Rejected" — Red-Orange number + `ti-x` red icon + "require resubmission" note
> - "From SAS (Unread)" — Cobalt number + `ti-mail` Cobalt icon + "new documents from SAS" note. A small animated Cobalt dot pulses if count > 0.

---

> ### TWO-TAB LAYOUT (Main Content)

> Horizontal tabs below metric cards: "My Submissions" (active by default) / "From SAS — Inbox." Active tab: Dark Navy bg, white text, Violet 3px bottom underline. Inactive: white bg, Dark Navy text, hover `#F5F5F5`.

---

> ### TAB 1 — MY SUBMISSIONS

> **Filter and Search Bar:**
> Search input (placeholder "Search by document title or reference...") + Category filter dropdown (All / Activity Letter / Accreditation Paper / Waiver / Financial Report / Event Proposal / Certificate Request / Memorandum / Other) + Status filter pills (All / Pending / Approved / Rejected / Resubmitted) + Date Range picker + Sort dropdown (Newest First / Oldest First / Title A–Z). "Showing X documents" gray 12px count right.
>
> **Submissions Table (full width, white card, 0.5px border, 16px radius):**
>
> Table column headers (gray 11px uppercase, `#F8F8F8` bg row, `#E0E0E0` bottom border):
> Reference # / Document Title / Category / Date Submitted / Last Updated / Status / SAS Remarks / Actions
>
> Each data row (52px height, `#E0E0E0` bottom divider, hover = Light Violet `#F3E8FF` bg):
>
> - **Reference #:** gray monospace 12px (e.g., "DOC-2026-0089")
>
> - **Document Title:** Dark Navy bold 14px. Below it: file type chip (small, 10px — PDF = Red-Orange bg, white "PDF" text / DOCX = Cobalt bg, white "DOCX") + file size gray 11px side by side.
>
> - **Category:** colored category pill (each category has assigned color — Activity Letter = Violet / Accreditation = Cobalt / Waiver = Amber / Financial Report = Green / Event Proposal = Dark Navy / Certificate Request = teal / Memo = gray / Other = light gray).
>
> - **Date Submitted:** gray 13px + relative time italic 11px below (e.g., "Mar 15, 2026" + "3 days ago").
>
> - **Last Updated:** gray 13px (date of last status change).
>
> - **Status:** Large colored pill badge (36px height, 12px horizontal padding, 100px radius, bold 12px text + icon left):
>   - Pending: Amber gradient pill + `ti-clock` white icon + "Pending Review"
>   - Approved: Green gradient pill + `ti-check` white icon + "Approved"
>   - Rejected: Red-Orange gradient pill + `ti-x` white icon + "Rejected"
>   - Resubmitted: Cobalt pill + `ti-refresh` white icon + "Resubmitted"
>   - Draft: gray pill + `ti-pencil` white icon + "Draft"
>
> - **SAS Remarks:** Three states:
>   - If no remarks yet (Pending): "—" gray italic centered
>   - If approved with remarks: `ti-message-check` green icon button (32px tap target) + "View" green text link — clicking opens Remarks Modal
>   - If rejected: `ti-message-x` red-orange icon (32px) + "View Reason" red-orange text link (underlined) — this is visually prominent to ensure officer sees it
>
> - **Actions column** (icon buttons, appear on row hover, 32px each, 8px radius, `#F5F5F5` hover bg):
>   - `ti-eye` Cobalt — View document details + preview
>   - `ti-download` Dark Navy — Download original file
>   - `ti-refresh` Violet — Resubmit (only visible on Rejected rows + Draft rows)
>   - `ti-trash` gray — Delete (only on Draft rows — Submitted docs cannot be deleted)
>
> **Row expansion (clicking anywhere on row except actions):** the row smoothly expands inline (not a new page) showing a mini detail panel:
> - File preview thumbnail or document icon (if PDF: red-orange `ti-file-type-pdf` large icon 48px + filename / if DOCX: Cobalt `ti-file-type-doc`)
> - Submission notes (if any were added at upload)
> - Full SAS remarks text (if any)
> - Submission timeline mini stepper: Submitted → Under Review → Decision (Approved/Rejected)
> - Action buttons repeated for convenience
>
> **Pagination row** (below table): "Showing 1–20 of 47 submissions" gray 12px left + Previous/Next buttons right (white bg, `#E0E0E0` border, 32px height, 8px radius).

---

> ### TAB 2 — FROM SAS (INBOX)

> **Inbox Context Card (full width, Cobalt bg 8% opacity, Cobalt border 1px, 12px radius, 14px padding):**
> `ti-mail` Cobalt icon + "Official Documents from SAS" Cobalt bold 14px. "These are official memos, guidelines, approved forms, and files sent directly to your organization by the Student Affairs Services." Dark Navy 13px. "Mark All as Read" Cobalt text link right-aligned.
>
> **Filter Bar:** Search input + Category filter + Date Range + "Show Unread Only" toggle (Violet, OFF default).
>
> **Inbox Table (full width, white card, 0.5px border, 16px radius):**
>
> Column headers: Document Title / Sent By / Category / Date Sent / For / Opened / Actions
>
> Each row (52px height, `#E0E0E0` bottom divider):
>
> - Unread rows: Light Cobalt `#E6F1FB` bg tint + a small Cobalt filled dot (8px) left of document title.
> - Read rows: white bg, no dot.
>
> - **Document Title:** Dark Navy bold 14px. File type chip + size gray 11px below.
>
> - **Sent By:** "SAS Admin" with SAO Adviser avatar chip (24px circle) + "Ms. R. Lucanas" gray 12px.
>
> - **Category:** Memo = gray pill / Policy = Dark Navy pill / Approved Form = green pill / Guidelines = Cobalt pill / General = light gray pill.
>
> - **Date Sent:** gray 13px + "X days ago" italic 11px.
>
> - **For:** "Your Organization" Violet pill (if sent specifically to this org) or "All Organizations" Dark Navy pill (broadcast).
>
> - **Opened:** Green `ti-eye-check` icon (if read) or amber `ti-eye-off` icon (if unread) + read date gray 11px.
>
> - **Actions:** `ti-eye` Cobalt (View + Preview) + `ti-download` Dark Navy (Download) + `ti-bell-off` gray (Mute notifications for this doc — rarely needed).
>
> **Empty state (no inbox documents):** centered `ti-mailbox` Cobalt (48px) + "Your inbox is empty" Dark Navy bold 18px + "Documents sent to your organization by the SAS will appear here." gray 14px.

---

## SCREEN 2 — SUBMIT DOCUMENT MODAL (Officer)

> Triggered by the prominent "+ Submit Document" button. Centered modal, 600px wide, white, 16px radius, `rgba(0,0,0,0.6)` overlay.

---

> **Modal Header (64px, Violet `#83358E` to deep purple `#5B1F6B` gradient):**
> `ti-upload` white icon (24px) in semi-transparent white circle (40px, 20% opacity) left + "Submit Document to SAS" white bold 18px. Below title: "Student Affairs Services — STI College Ormoc" white 12px at 80% opacity. `ti-x` white close button right (24px, 32px tap target).

---

> **Modal Body (24px padding, fields stacked 16px gap):**
>
> **Document Information Section (Violet 4px left accent, "Document Details" Dark Navy bold 14px):**
>
> - Document Title (text input, required, 44px height, `#E0E0E0` border, 8px radius, Violet 2px focus ring, floating label, placeholder "e.g. Activity Letter for IT Guild GenAss 2026", max 150 chars, character counter bottom-right). Error: "Document title is required" red-orange 12px below.
>
> - Category (dropdown, required, 44px height). Each option shows a colored category dot left:
>   - 🟣 Activity Letter
>   - 🔵 Accreditation Paper
>   - 🟡 Waiver / Permission Slip
>   - 🟢 Financial Report
>   - ⬛ Event Proposal
>   - 🩵 Certificate Request
>   - ⚫ Memorandum / Official Letter
>   - ⬜ Other (reveals "Specify Category" text input below when selected)
>   Placeholder: "Select document category..."
>
> - Academic Year + Semester (two dropdowns side by side, 50% width each, required). Shows current semester pre-selected.
>
> - Submission Notes (textarea, 3 rows, optional, placeholder "Add any context or instructions for the SAS Adviser reviewing this document... (optional)"). Helper: "These notes are visible to the SAS Adviser during review."
>
> **File Attachment Section (16px top margin, Violet left accent, "Attach Document" Dark Navy bold 14px):**
>
> Large drag-and-drop upload zone (full width, 140px height, `#F3E8FF` bg, Violet dashed border 2px, 12px radius):
> - Default empty state: `ti-cloud-upload` Violet icon (48px, centered top) + "Drag and drop your file here" Dark Navy bold 14px centered + "or" gray 12px + "Browse Files" Violet text link (underlined) centered.
> - Accepted formats note: "`ti-info-circle` gray Accepted: PDF, DOCX, DOC · Maximum file size: 25MB" gray 12px italic centered bottom of zone.
>
> Uploaded state (replaces the zone): a horizontal file card (white bg, Violet 2px border, 12px radius, 14px padding): file type icon left (56px × 56px, rounded 12px — PDF = Red-Orange bg `ti-file-type-pdf` icon / DOCX = Cobalt bg `ti-file-type-doc`) + filename Dark Navy bold 14px + file size gray 12px + "Ready to submit" green 12px + `ti-check` green icon + `ti-x` Red-Orange icon button right (removes file, resets zone). A thin Violet progress bar below the filename (animated fill from 0% to 100% during upload, then disappears and shows "Uploaded ✓").
>
> Error states: file too large = red-orange card "File exceeds 25MB limit. Please compress or use a smaller file." / wrong format = red-orange card "Only PDF and DOCX files are accepted."
>
> **Submission Reference Preview (shown after all required fields filled, 12px top margin):**
> Light Violet bg card (12px radius, 12px padding): `ti-receipt` Violet icon + "Your submission reference will be:" Violet 12px + auto-generated reference "DOC-2026-0090" Golden Yellow bold monospace 14px (shown as preview). "This reference number will be used to track your document." gray 11px italic.

---

> **Modal Footer (56px, white, 1px top border `#E0E0E0`):**
> Left: "Save as Draft" white bg, Violet border 1px, Violet text, `ti-device-floppy` icon, 36px height, 8px radius.
> Right: "Submit to SAS" Violet bg, white bold text 15px, `ti-send` white icon, 44px height, 8px radius. Disabled (gray bg, gray text) until: Title filled + Category selected + File uploaded. On click: button shows loading state (spinner + "Submitting...") → success animation.

---

> **Post-Submit Success State (replaces modal body):**
> Green gradient card fills the modal body (keeping header visible): `ti-circle-check` white icon (56px, centered) + "Document Submitted Successfully!" white bold 20px centered + reference number "DOC-2026-0090" Golden Yellow bold 16px + "The SAS Adviser has been notified and will review your submission." white 13px centered. Footer becomes: "Submit Another" Violet outline button left + "View My Submissions" Dark Navy bg Golden Yellow text button right.

---

## SCREEN 3 — OFFICER DOCUMENT DETAIL VIEW

> Opened when clicking `ti-eye` on any document row or clicking the document title. Full-page view, not a modal.
>
> **Route:** `/officer/documents/{docId}`
>
> **Page Header:**
> `ti-arrow-left` back button + breadcrumb "Documents > [Document Title truncated]." Right: "Download File" Dark Navy outline button (`ti-download` icon).
>
> **Two-column layout (7/12 + 5/12):**

---

> **Left Column (7/12) — Document Preview & Info:**
>
> **Document Preview Card (full width, white, 0.5px border, 16px radius, 20px padding):**
> Card header: "Document Preview" Dark Navy bold 14px + `ti-external-link` Cobalt text link "Open in New Tab" right.
>
> Preview area (full width, 480px height, `#F8F8F8` bg, 8px radius, centered):
> - If PDF: embedded PDF viewer (iframe or PDF.js integration) showing the document. Zoom controls bottom: `ti-minus` + "100%" + `ti-plus` + "Fit to Width" icon.
> - If DOCX: `ti-file-type-doc` Cobalt icon (80px) centered + filename Dark Navy bold 16px + "DOCX files cannot be previewed inline." gray 13px + "Download to View" Cobalt button (44px).
> - If preview unavailable: centered placeholder with document icon + "Preview not available" gray + download button.
>
> **Document Information Card (full width, white, 0.5px border, 16px radius, 20px padding, 16px top margin):**
> "Document Details" Dark Navy bold 14px + Violet left accent. Structured rows (each 40px, `#E0E0E0` bottom divider, Tabler icon gray left + label gray 12px + value Dark Navy 14px right):
> - `ti-hash` — Reference: "DOC-2026-0089" monospace Golden Yellow bold
> - `ti-tag` — Category: category colored pill
> - `ti-calendar` — Submitted: date + time
> - `ti-refresh` — Last Updated: date + time
> - `ti-school` — Semester: "2nd Semester · A.Y. 2025–2026"
> - `ti-building` — Submitted To: "Student Affairs Services — STI College Ormoc"
> - `ti-file` — File: filename + size + type chip
> - `ti-notes` — Notes: submission notes (or "No notes added." gray italic)

---

> **Right Column (5/12) — Status & Timeline:**
>
> **Status Card (white, 0.5px border, 16px radius, 20px padding):**
> Current status displayed prominently: the status pill at 48px height, full width, centered. Below: last updated date + "by SAS Admin" gray 12px.
>
> **SAS Remarks Card (white, 0.5px border, 16px radius, 20px padding, 12px top margin):**
> "SAS Adviser Remarks" Dark Navy bold 14px + Violet left accent.
>
> If Pending: `ti-clock` amber icon (24px) centered + "Awaiting SAS review." amber 13px italic centered.
>
> If Approved with remarks: green `ti-message-check` icon (24px) + full remarks text in Dark Navy 14px line-height 1.6 in a light green bg card. "Remarks from Ms. R. Lucanas" green bold 12px above the card. Remarks timestamp gray 11px below.
>
> If Approved with no remarks: green `ti-check-circle` icon + "Approved without additional remarks." green 13px italic.
>
> If Rejected: prominent red-orange treatment. `ti-message-x` Red-Orange icon (32px) + "Rejection Reason" red-orange bold 14px. Full rejection reason text in red-orange bg 10% opacity card (12px radius, 16px padding) — Dark Navy 14px line-height 1.7. Timestamp + "by [adviser name]" gray 11px below.
>
> **Resubmit Section (shown below remarks card ONLY when status = Rejected):**
> Full-width Violet bg card (12px radius, 16px padding): `ti-refresh` white icon + "Ready to Resubmit?" white bold 14px + "Address the feedback above, then upload a corrected version." white 13px. "Resubmit Document" white text Violet-border button (full width, 44px) — clicking opens Resubmit Modal.
>
> **Submission Timeline Card (white, 0.5px border, 16px radius, 20px padding, 12px top margin):**
> "Document Timeline" Dark Navy bold 14px + Violet left accent.
> Vertical stepper:
> - "Draft Saved" (if applicable): gray circle, `ti-pencil` icon, timestamp, "by [officer name]"
> - "Submitted to SAS": Cobalt circle, `ti-send` icon, timestamp
> - "Received by SAS": golden yellow circle, `ti-eye` icon, "Opened by SAS Admin" + opened timestamp (or "Not yet opened" if pending)
> - "Decision Made": Green circle `ti-check` (Approved) / Red-Orange circle `ti-x` (Rejected) / Golden Yellow pulsing (Under Review) / gray dashed (Awaiting)
> - "Resubmitted" (if applicable): Violet circle `ti-refresh` + timestamp
>
> Connecting lines: completed = matching color, upcoming = gray dashed.

---

## SCREEN 4 — RESUBMIT DOCUMENT MODAL (Officer)

> Triggered by "Resubmit Document" button. Centered modal, 560px, white, 16px radius.
>
> **Header (56px, Violet gradient):**
> `ti-refresh` white + "Resubmit Document" white bold 16px + "Addressing SAS Feedback" white 12px at 80%. `ti-x` close right.
>
> **Body (20px padding):**
>
> **Rejection Reason Reminder Card (full width, red-orange bg 8% opacity, red-orange border 1px, 12px radius, 14px padding):**
> `ti-message-x` Red-Orange icon + "Rejection Reason" red-orange bold 13px. Original rejection remarks shown in Dark Navy 13px italic. "Submitted [date] by [adviser name]" gray 11px below.
>
> **What Changed? (textarea, required, 4 rows, Violet focus ring, placeholder "Describe what you changed or corrected in the new version... (required)"):** Error: "Please describe your changes before resubmitting." red-orange 12px. Helper: "This message is sent to the SAS Adviser alongside your resubmission."
>
> **New File Upload Zone (same drag-and-drop design as Submit Modal):**
> Label: "Upload Corrected Document" Dark Navy bold 13px. Same zone design. Note below zone: `ti-info-circle` amber + "The original rejected file is preserved for records. Only upload the corrected version." amber 12px.
>
> **Document title and category** shown as read-only chips below the upload zone (cannot change title/category on resubmission — if different document type needed, officer must create a new submission).
>
> **Footer:** "Cancel" gray + "Submit Corrected Document" Violet bg white text `ti-send` icon.

---

# PART 2 — SAS ADMIN EDMS INTERFACE

---

## SCREEN 5 — ADMIN DOCUMENT MANAGEMENT HUB

> **Route:** `/admin/documents`
>
> **Page Header:**
> "Document Management" Dark Navy bold 22px. Breadcrumb "Dashboard > Document Management." Right: "Broadcast Document to Clubs" Dark Navy bg Golden Yellow text button (44px, 8px radius, `ti-broadcast` icon left, Golden Yellow bold text) — this is the SAO's primary outbound action.

---

> ### ADMIN CONTEXT BANNER (Full Width)

> Dark Navy gradient card (full width, 16px radius, 16px padding). Left: `ti-files` Golden Yellow icon (32px) + "Electronic Document Management System" white bold 16px + "Centralized document routing between Student Organizations and the Student Affairs Services. Review incoming submissions and broadcast official documents to clubs." white 13px at 80% opacity, line-height 1.5. Right: two action chips (white bg at 15% opacity, 8px radius, 12px padding, white text 12px): "X Pending Review" amber `ti-clock` icon + "X Sent This Semester" Cobalt `ti-send` icon.

---

> ### FIVE METRIC STAT CARDS (Gradient Style, Horizontal Row)

> Large rounded gradient cards (reference style — gradient bg, white icon box top-left, white bold 40px number, white label, comparison note):
> - "Pending Documents" — Amber gradient, `ti-clock` icon, "requires your review" note, "Review Now" amber pill top-right with pulse animation if > 0
> - "Approved This Semester" — Green gradient, `ti-circle-check` icon, "+X this week" note
> - "Rejected" — Red-Orange gradient, `ti-x` icon, "X awaiting resubmission" note
> - "Documents Broadcast to Clubs" — Cobalt gradient, `ti-broadcast` icon, "sent by SAS this semester" note
> - "Total Organizations Submitting" — Dark Navy gradient, `ti-building` icon, "active submitters" note

---

> ### TWO-TAB MAIN CONTENT AREA

> Horizontal tabs: "Incoming Queue" (active, with amber count badge) / "Sent to Clubs." Active: Dark Navy bg, white text, Golden Yellow 3px underline. Inactive: white bg, Dark Navy text.

---

> ### TAB 1 — INCOMING QUEUE (SAS Review Center)

> **Filter Bar (full width, white card, 0.5px border, 12px radius, 14px padding):**
> Row of filters: Search input (placeholder "Search document title, org name, or reference...") + Organization filter dropdown (All Organizations / [list of active orgs with avatars]) + Category filter (same category list as officer submit modal) + Status filter pills (All / Pending / Approved / Rejected / Resubmitted) + Date Range picker + Sort (Newest / Oldest / Organization A–Z). "Showing X documents" gray count right.
>
> **Master Document Table (full width, white card, 0.5px border, 16px radius):**
>
> Column headers: Reference # / Document Title / Organization / Category / Submitted By / Date Submitted / Status / Actions
>
> Each row (56px height, `#E0E0E0` bottom divider, hover = Light Violet `#F3E8FF`):
>
> **Pending rows get special visual treatment:**
> - Golden Yellow 4px left border accent on the row
> - A small pulsing amber dot (8px) beside the Reference # in the first column
>
> - **Reference #:** gray monospace 12px
>
> - **Document Title:** Dark Navy bold 14px. Below: file type chip (PDF/DOCX) + file size gray 11px.
>
> - **Organization:** org avatar circle (28px, colored initials) + org name Dark Navy 13px + org type gray 11px below.
>
> - **Category:** colored category pill.
>
> - **Submitted By:** officer avatar (24px) + officer name gray 13px + "Officer" Violet pill 10px.
>
> - **Date Submitted:** gray 13px + relative time italic 11px + "X days in queue" amber 11px italic (if pending > 2 days).
>
> - **Status:** same pill style as officer view but from admin perspective: Pending = amber pulse animation on the pill.
>
> - **Actions column:**
>   - `ti-eye` Cobalt — "Review Document" (main action, opens Document Review Page)
>   - `ti-download` Dark Navy — Download file
>   - `ti-check` green — Quick Approve (single click, opens Quick Approve confirmation popover inline)
>   - `ti-x` red — Quick Reject (opens Quick Reject inline popover requiring remarks)
>
> **Quick Approve Popover (inline, 280px, appears above/below the row on `ti-check` click):**
> White bg, 0.5px border, 12px radius, `box-shadow: 0 4px 16px rgba(0,0,0,0.12)`. Green gradient header strip (32px): `ti-check` white icon + "Quick Approve?" white bold 13px. Body (14px padding): "Approve [Document Title] from [Org Name]?" Dark Navy 13px. Optional remarks textarea (3 rows, placeholder "Optional approval remarks..."). Two buttons row: "Cancel" gray text link + "Approve" Green gradient button (36px).
>
> **Quick Reject Popover (inline, 320px, appears on `ti-x` click):**
> Red-Orange gradient header strip: `ti-x` white + "Quick Reject" white bold 13px. Body: document name + org name. Required remarks textarea (3 rows, placeholder "Rejection reason — required..."). Error appears below textarea if empty. "Cancel" text link + "Reject" Red-Orange button. Remarks required before Reject enables.
>
> **Bulk Action Bar (slides up from bottom when checkboxes selected):**
> Dark Navy bg bar (56px): "X documents selected" white 14px + action buttons: "Approve Selected" Green gradient (44px) + "Export Selected" gray outline + `ti-x` dismiss selection gray icon right.

---

> ### TAB 2 — SENT TO CLUBS

> **Filter Bar:** Search + Organization filter + Category + Date Range + Sort.
>
> **Sent Documents Table (full width, white card, 0.5px border, 16px radius):**
>
> Columns: Reference # / Document Title / Category / Date Sent / Sent To / Read By / Actions
>
> - **Sent To:** "All Organizations" Dark Navy pill with count badge / or specific org avatars (up to 3 visible, "+N more" chip if more).
>
> - **Read By:** a row of small org avatar chips (28px circles) showing which organizations have opened the document. Gray circles = not opened. Colored = opened. "X of Y orgs opened" gray 12px below the avatars.
>
> - **Actions:** `ti-eye` View / `ti-download` Download / `ti-send` Resend (opens broadcast modal pre-filled) / `ti-archive` Archive.

---

## SCREEN 6 — DOCUMENT REVIEW PAGE (Admin Full View)

> The most important screen in the admin EDMS. Opened when adviser clicks `ti-eye` "Review Document" on any submission.
>
> **Route:** `/admin/documents/{docId}/review`

---

> **Page Header (full width, white, 0.5px bottom border, 64px):**
> Left: `ti-arrow-left` back + breadcrumb "Document Management > Review > [Doc Title truncated 40 chars]." Right: "Previous" `ti-chevron-left` gray outline button + "[X] of [Y] pending" gray 13px + "Next" `ti-chevron-right` gray outline button (navigate between pending documents without returning to the queue) + `ti-download` Dark Navy outline "Download" button. These navigation arrows let the adviser work through the pending queue efficiently.

---

> ### THREE-COLUMN LAYOUT (3/12 + 6/12 + 3/12)

---

> **LEFT COLUMN (3/12) — Submission Info Panel:**
> White bg, 0.5px right border, sticky, 24px padding.
>
> **Submitter Identity Card (white, 0.5px border, 16px radius, 16px padding):**
> "Submitted By" Dark Navy bold 13px + Violet left accent. Officer avatar (56px circle, white border 2px) centered + officer name Dark Navy bold 14px centered + student ID gray 12px + "Organization Officer" Violet pill. Below avatar: info rows with Cobalt icons: `ti-building` org name + `ti-mail` email + `ti-calendar` submission date/time.
>
> **Document Metadata Card (white, 0.5px border, 16px radius, 16px padding, 12px top margin):**
> "Document Information" Dark Navy bold 13px + Violet left accent. Structured info rows (36px each, `#E0E0E0` divider): `ti-hash` Reference # (Golden Yellow monospace bold) / `ti-tag` Category pill / `ti-school` Semester / `ti-file` Filename + size / `ti-clock` Time in queue (amber bold "X days" if pending).
>
> **Submission Notes Card (shown if officer added notes, white, 0.5px border, 12px radius, 14px padding, 12px top margin):**
> `ti-notes` Cobalt icon + "Officer's Submission Notes" Cobalt bold 12px. Notes text Dark Navy 13px italic line-height 1.5.
>
> **Document History Card (white, 0.5px border, 16px radius, 14px padding, 12px top margin):**
> "Document History" Dark Navy bold 13px. Mini vertical timeline: Draft (if applicable) → Submitted → Opened by Admin (timestamp) → Decision. Same stepper style as officer view.
>
> If this is a resubmission: amber card above timeline: `ti-refresh` amber + "Resubmission #[N]" amber bold 12px + "Officer's change notes:" + change description in Dark Navy 12px italic.

---

> **CENTER COLUMN (6/12) — Document Preview:**
> White bg, 24px padding.
>
> **Preview Card (full width, white, 0.5px border, 16px radius, 20px padding):**
> Card header row: "Document Preview" Dark Navy bold 14px + `ti-external-link` Cobalt "Open Full Screen" text link right + `ti-download` Dark Navy "Download" text link right.
>
> **Preview Area (full width, 600px height, `#F8F8F8` bg, 8px radius):**
> - PDF: embedded PDF viewer showing the full document. Scrollable. Zoom controls bottom-center: `ti-zoom-out` + "100%" + `ti-zoom-in` + "Fit Page" + "Full Screen." Page navigation: "Page X of Y" with prev/next arrows.
> - DOCX: `ti-file-type-doc` Cobalt icon (80px) centered + "DOCX — Cannot preview inline" Dark Navy bold 16px + "Download to review in Microsoft Word." gray 13px + "Download DOCX" Cobalt button (52px, 8px radius).
>
> **Document Annotation Bar (below preview, white, 0.5px border, 12px radius, 12px padding):**
> `ti-note` gray icon + "Private Annotation" gray 12px italic + text input (full width minus 100px, 36px height, placeholder "Add a private note about this document (visible to SAS staff only)...") + "Save Note" Cobalt button (80px, 32px height, 8px radius).
> If annotation saved: shows below the input as a Light Violet card: `ti-note` Violet icon + annotation text + "Saved [time]" gray 11px + `ti-x` delete note button.

---

> **RIGHT COLUMN (3/12) — Decision Panel:**
> White bg, 0.5px left border, sticky, 24px padding.
>
> **Panel Header:**
> `ti-gavel` Dark Navy icon (24px) + "Review Decision" Dark Navy bold 16px. Gray 13px: "Review the document before making your decision."
>
> **Document Summary Chip Row (3 chips, stacked, 8px gap):**
> Each chip: white bg, 0.5px border, 8px radius, 10px padding, 12px font. `ti-building` org name / `ti-tag` category / `ti-calendar` submission date.
>
> **Remarks / Comments Box (full width, white, 0.5px border, 12px radius, 16px padding, 16px top margin):**
> "Adviser Remarks" Dark Navy bold 14px + Violet left accent. Required indicator `*` appears in red-orange when Reject is the intended action.
>
> Textarea (full width, 7 rows, `#E0E0E0` border, 8px radius, Violet 2px focus ring, placeholder "Write your feedback, instructions, or approval remarks for the submitting officer. These will be sent with your decision."): Dark Navy 14px, line-height 1.6.
>
> Character counter: "X / 1000" gray 11px right-aligned below textarea.
>
> Remarks visibility note (Light Violet bg, Violet border, 10px padding, 8px radius, 8px top margin): `ti-eye` Violet + "Remarks are sent directly to the officer and stored permanently in the document record." Violet italic 11px.
>
> **THREE DECISION BUTTONS (stacked, 12px gap, 20px top margin):**
>
> **Button 1 — APPROVE:**
> Full width, 56px, 12px radius. Green gradient `#22C55E` → `#16A34A`. `ti-circle-check` white icon (20px) left + "Approve Document" white bold 16px. On hover: darkens. On click: loading spinner → success.
> Below button: gray 11px italic "Officer will be notified. Document marked as approved in their submissions log."
>
> **Button 2 — REJECT:**
> Full width, 52px, 12px radius. White bg, Red-Orange `#EF4444` border 1.5px, Red-Orange text bold 15px. `ti-x` Red-Orange icon left + "Reject Document." Requires remarks: if textarea empty on click, textarea border turns Red-Orange + "Remarks are required when rejecting a document." red-orange 12px error below textarea. Intentionally smaller/less prominent than Approve.
> Below button: gray 11px italic "Officer receives your remarks and can resubmit a corrected version."
>
> **Button 3 — REQUEST MORE INFO:**
> Full width, 44px, 12px radius. Cobalt Blue border 1px, Cobalt Blue text 14px, `ti-question-mark` Cobalt icon left + "Request More Information." Opens a specific remarks context: textarea placeholder changes to "Specify what additional information or documents are needed..." Status set to "Info Requested" — a new Cobalt status pill distinct from Pending/Approved/Rejected.
> Below: gray 11px "Document stays in queue. Officer is notified to provide more details."
>
> **Decision Made State (after any decision):**
> All three buttons replaced by status card:
> - Approved: Green gradient card, `ti-circle-check` white (40px) + "Document Approved" white bold 18px + timestamp.
> - Rejected: Red-Orange gradient card, `ti-x` white + "Document Rejected" white bold + timestamp.
> - Info Requested: Cobalt gradient card, `ti-question-mark` white + "More Info Requested" + timestamp.
>
> "Undo Decision" gray text link (available 5 minutes only) + "Next Pending Document" Cobalt button (full width, 44px) — navigates to next in queue.

---

> ### APPROVE CONFIRMATION MODAL (640px)

> Centered modal, white, 16px radius, `rgba(0,0,0,0.6)` overlay.
>
> **Header (64px, Green gradient):**
> `ti-circle-check` white icon (28px) in white semi-transparent circle (44px) + "Confirm Document Approval" white bold 18px + document title Golden Yellow 13px.
>
> **Body (24px padding):**
> Green bg 8% opacity card (12px radius, 16px padding): `ti-check` green icon + "You are approving this document. The following will happen:" Dark Navy bold 14px.
>
> Impact list (Dark Navy 13px, green `ti-check` icons, line-height 1.7, 16px top margin):
> - Document status → "Approved"
> - [Officer name] notified via in-app + push notification
> - Document available for download in officer's submissions log
> - Approval timestamp recorded with your name
> - Audit log entry created
>
> "Optional Approval Remarks" (pre-filled with whatever was in the textarea, editable): textarea 3 rows. "These will be sent to the officer with the approval notification." gray 12px.
>
> **Footer:** "Cancel" gray outline + "Confirm Approval" Green gradient bold `ti-send` icon (52px).

---

> ### REJECT CONFIRMATION MODAL (560px)

> **Header (64px, Red-Orange gradient):**
> `ti-x` white icon in semi-transparent white circle + "Confirm Document Rejection" white bold 18px + document title Golden Yellow 13px.
>
> **Body:**
> Red-Orange bg 8% opacity card: `ti-alert-circle` red icon + "This document will be rejected and returned to the officer with your remarks." Dark Navy 14px.
>
> "Rejection Reason Category" dropdown (required, full width, 44px): Document Incomplete / Wrong Format / Wrong Category / Missing Attachments / Requires Revision / Does Not Meet Requirements / Duplicate Submission / Other.
>
> "Allow Resubmission" toggle (ON default): "Officer can submit a corrected version." On toggle OFF: amber warning "Officer will not be able to resubmit this document."
>
> Remarks preview card (same read-only style): shows the typed remarks as a quote block.
>
> **Footer:** "Cancel" gray + "Confirm Rejection" Red-Orange gradient `ti-x` icon (52px).

---

## SCREEN 7 — BROADCAST DOCUMENT MODAL (Admin)

> Triggered by "Broadcast Document to Clubs" button. This is how SAS sends official documents downward to organizations.
>
> Centered modal, 640px, white, 16px radius. Slightly taller modal — has more fields.

---

> **Header (64px, Dark Navy `#001A4D` gradient):**
> `ti-broadcast` Golden Yellow icon (24px) + "Broadcast Document to Clubs" white bold 18px + "Student Affairs Services → Student Organizations" white 12px at 80% opacity. `ti-x` white close right.

---

> **Body (24px padding, three distinct sections):**
>
> **Section A — Document Details (Dark Navy bold 14px + Violet 4px left accent):**
> - Document Title (text input, required, placeholder "e.g. Updated Activity Letter Template / Campus Policy Memo No. 12-2026")
> - Category (dropdown — same categories as submission but with additional SAS-specific options): Memo / Policy / Guidelines / Approved Template / Signed Approval Form / Announcement / Reminder / Report / Other
> - Description / Message to Clubs (textarea, 4 rows, optional, placeholder "Add a message to accompany this document — clubs will see this in their inbox alongside the file.")
> - Academic Year + Semester (dropdowns, current pre-selected)
>
> **Section B — File Attachment (same upload zone design, 12px top margin):**
> Same drag-and-drop zone. Accepted: PDF, DOCX, XLSX, JPG, PNG. Max 50MB (larger limit for official SAS documents). Multiple files toggle: "Attach Multiple Files" toggle — when ON: zone allows up to 5 files, shows list of attached files below zone.
>
> **Section C — Distribution (Violet 4px left accent, "Send To" Dark Navy bold 14px, 16px top margin):**
>
> Large segmented selector (radio behavior, three options as large pill tabs full width, 52px height each, 8px gap):
>
> **Option A — "All Organizations":**
> `ti-building-community` Violet icon + "All Organizations" Dark Navy bold 14px + "Broadcast to all X active student organizations" gray 12px. Selected = Violet border 2px, Light Violet bg. Shows preview below when selected: "This will be sent to: [org 1 avatar] [org 2 avatar] [org 3 avatar] +X more" chips row.
>
> **Option B — "Specific Organizations":**
> `ti-building` Cobalt icon + "Specific Organizations" Dark Navy bold 14px + "Choose which clubs receive this document" gray 12px. Selected = Cobalt border 2px, light Cobalt bg. When selected: reveals a searchable multi-select org picker:
> - Search input (placeholder "Search organization name...")
> - Scrollable list of all orgs (each: checkbox left + org avatar + org name + org type pill). Checked = Violet checkbox.
> - Selected count chip above the list: "X organizations selected" Violet pill + "Clear All" gray text link.
>
> **Option C — "By Organization Type":**
> `ti-tag` amber icon + "By Organization Type" Dark Navy bold 14px + "Send to all clubs of a specific type" gray 12px. Selected = amber border 2px. Reveals org type multi-select (same pill checkboxes as admin org type settings): Academic / Civic / Cultural / Sports / etc.
>
> **Notification Settings (below distribution, 12px top margin):**
> Three toggle rows (each: label Dark Navy bold 13px + description gray 12px + Violet toggle right):
> - Send Push Notification to Officers — "Officers receive an immediate push notification." (ON default)
> - Send In-App Notification — "Appears in officers' notification bell." (ON default)
> - Send Email Notification — "Email sent to registered officer email addresses." (OFF default)
>
> **Broadcast Preview Card (full width, Light Violet bg, Violet border 1px, 12px radius, 14px padding, 12px top margin):**
> `ti-eye` Violet + "Broadcast Preview" Violet bold 13px. Shows exactly how this will appear in the officer's "From SAS" inbox:
> - Mini inbox row preview: org avatar "SAS Admin" + "Ms. R. Lucanas" + document title Dark Navy bold 13px + category pill + "Just now" gray 11px + "Unread" blue dot.

---

> **Footer (56px, white, 1px top border):**
> Left: "Save as Draft" Violet outline (36px). Right: "Broadcast to [X] Organization(s)" Dark Navy bg Golden Yellow text bold `ti-broadcast` icon (44px, 8px radius). Disabled until: Title filled + File uploaded + Distribution selected. Shows "0 organizations selected" gray disabled note when no distribution chosen. On click: loading → success.

---

> **Post-Broadcast Success State (replaces modal body):**
> Dark Navy gradient fills body: `ti-broadcast` Golden Yellow icon (56px, centered) + "Document Broadcast Successful!" white bold 20px + "[X] organizations notified." white 14px + document reference Golden Yellow monospace bold. Footer: "Broadcast Another" white outline + "View Sent Documents" Golden Yellow filled button.

---

## SCREEN 8 — ADMIN EDMS DASHBOARD WIDGET (Integration)

> The admin main Dashboard Overview (Screen 1 of admin panel) gains a new widget in the layout.
>
> **"Pending Documents" Widget (right column of dashboard, white card, 0.5px border, 16px radius, 20px padding):**
>
> Card header: Violet 4px left accent + "Pending Documents" Dark Navy bold 14px + amber count badge + "View All" Golden Yellow text link right.
>
> If 0 pending: centered `ti-files-off` Cobalt (32px) + "No pending documents." gray 13px italic.
>
> If pending documents: list of top 5 pending submissions. Each row (48px, `#E0E0E0` bottom divider):
> - Left: pulsing amber dot (8px) + document title Dark Navy bold 13px + org name gray 11px below
> - Right: days-in-queue amber pill (e.g., "2 days") + "Review" Violet text link
>
> Bottom: "View All Pending →" Violet text link full width centered.

---

## GLOBAL DESIGN NOTES FOR EDMS

> - **Document pipeline clarity:** The two-directional flow (Officers ↑ to SAS, SAS ↓ to Officers) must always be visually clear. Use `ti-arrow-up` Violet for submissions going to SAS, `ti-arrow-down` Cobalt for documents coming from SAS. Never mix these visual metaphors.
>
> - **Rejection visual priority:** When a document is rejected, the remarks/reason must be the most visually prominent element the officer sees — not buried in a small column. Red-orange treatment, icon + label + full text, never truncated.
>
> - **PDF preview inline:** The embedded PDF viewer in the admin review page is the most critical UX in this module. The adviser should never need to download a file just to review it. The preview must be large (600px height), scrollable, and zoomable.
>
> - **Queue efficiency:** The "Previous / Next pending" navigation in the admin review page lets the adviser work through the queue without returning to the list each time. This is essential for advisers with many pending documents.
>
> - **Remarks always required for rejection:** This is enforced at the UI level — the Reject button stays disabled until the remarks textarea has at least 10 characters. The Quick Reject popover also enforces this. Never allow a rejection without a reason.
>
> - **Broadcast confirmation:** Broadcasting to all organizations is a high-impact action. The modal clearly shows how many orgs will be notified and previews how it appears in their inbox. The confirm button always shows the count: "Broadcast to 12 Organizations."
>
> - **Draft support:** Both officer submissions and admin broadcasts support "Save as Draft" — allowing incomplete forms to be saved and resumed. Draft documents appear with a gray "Draft" pill in their respective tables.
>
> - **Audit trail:** Every submission, approval, rejection, broadcast, download, and preview action is logged automatically to `/audit_logs` via Cloud Function with actor, timestamp, document ID, and action details.
>
> - **File security:** Documents are stored in Firebase Cloud Storage under `/edms/{orgId}/{docId}/{filename}`. Security rules ensure officers can only access their own org's documents, SAS Admin can access all. Direct URL access without authentication returns 403.
>
> - Optimized for 1440px desktop. 24px page padding throughout. Review page uses full three-column layout. All modals centered with overlay. Modal max-height 88vh with internal scroll for longer forms.