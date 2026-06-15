Here's the complete Figma prompt for the **Academic Year & Semester System + Budget Management**:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Academic Year & Semester Lifecycle System** with **Budget & Fund Management** for both the **SAO Admin Panel** and the **Officer Dashboard** of STI Sync. This prompt covers semester rollover, fresh restart flows, historical semester browsing, school-level budget management (admin), club-level budget management (officer), and student payables tracking per organization. These two systems are deeply connected — semester changes affect budget periods, payable cycles, and financial reporting.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons. Optimized for 1440px desktop web.

---

# PART 1 — ADMIN PANEL: ACADEMIC YEAR & SEMESTER

---

## SCREEN 1 — ACADEMIC YEAR & SEMESTER SETTINGS PAGE

> **Route:** `/admin/settings/academic-semester`
>
> **Page Header:**
> "Academic Year & Semester" Dark Navy bold 22px. Breadcrumb "Settings > Academic Year & Semester." Right side: "Run Semester Rollover" prominent Violet button (`ti-refresh` icon, 44px height, 8px radius) — this is the most important action on this page, always visible.

---

> ### ACTIVE SEMESTER BANNER (Full Width, Always at Top)

> This banner is the single source of truth for what semester the system is currently operating in. It is always visible at the top of this settings page.
>
> **State A — Active Semester (Normal Operations):**
> Dark Navy `#001A4D` to Violet `#83358E` gradient card (full width, 16px radius, 24px padding).
> Left side: `ti-school` Golden Yellow icon (40px) + "Currently Active Semester" white 12px uppercase label + "2nd Semester · A.Y. 2025–2026" white bold 28px + semester date range white 14px at 80% opacity (e.g., "January 6, 2026 — May 29, 2026") + "X days remaining in this semester" Golden Yellow pill badge.
> Right side: three mini stat chips in white bg at 15% opacity (12px radius, 12px padding each): "X Active Students" / "X Active Organizations" / "X Events This Semester." Below chips: "Semester is healthy — no action required." white 12px italic.
>
> **State B — Semester Ending Soon (within 14 days of end date):**
> Amber gradient card. `ti-alert-triangle` white icon + "Semester Ending Soon" white bold 20px + end date + "X days remaining." + "Prepare for semester rollover." white 13px. "Run Semester Rollover" Dark Navy button right side of banner.
>
> **State C — Rollover Needed (end date has passed, no rollover run yet):**
> Red-Orange gradient card + `ti-alert-circle` white icon + "Semester Has Ended — Rollover Required" white bold 20px + "The current semester end date has passed. Run the semester rollover to begin the new semester." + "Run Semester Rollover Now" Golden Yellow button (Dark Navy text, prominent).
>
> **State D — Rollover In Progress (re-enrollment period active):**
> Cobalt Blue gradient. `ti-refresh` animated spinning white icon + "Semester Rollover In Progress" white bold + "A.Y. 2026–2027 · 1st Semester" + re-enrollment progress bar (Violet fill, white track, "342/500 students confirmed" label). "View Re-enrollment Status" white outline button.

---

> ### SEMESTER MANAGEMENT SECTION

> **Section Header Row:**
> "Semester Records" Dark Navy bold 16px + Violet 4px left accent + Active/Archived tabs (Active = Dark Navy bg white text, Archived = amber bg 15% opacity amber text) + "+ Add Semester" Dark Navy bg Golden Yellow text button (36px, 8px radius, `ti-plus` icon) — right aligned.
>
> **Active Semesters Table (full width, white card, 0.5px border, 16px radius):**
> Column headers (gray 11px uppercase, `#F8F8F8` bg, `#E0E0E0` bottom border): Status / Academic Year / Semester / Start Date / End Date / Duration / Events / Students / Actions.
>
> Each row (52px height, `#E0E0E0` bottom divider, hover = Light Violet `#F3E8FF`):
> - Status: "ACTIVE" green gradient pill (current) / "UPCOMING" Cobalt pill / "COMPLETED" gray pill
> - Academic Year: Dark Navy bold 14px (e.g., "A.Y. 2025–2026")
> - Semester: Dark Navy 14px (e.g., "2nd Semester")
> - Start Date: gray 13px
> - End Date: gray 13px
> - Duration: gray 13px (e.g., "21 weeks")
> - Events: Cobalt bold 13px count
> - Students: Dark Navy bold 13px count
> - Actions column: three icon buttons (appear on row hover, 32px each, 8px radius hover):
>   - `ti-eye` Cobalt — "View Semester Data" (opens semester history view)
>   - `ti-edit` gray — "Edit Semester" (opens Edit Modal, disabled for Active semester — tooltip "Cannot edit active semester. Run rollover first.")
>   - `ti-archive` amber — "Archive" (disabled for Active semester)
>
> **Active semester row** has a special treatment: Golden Yellow 4px left border accent, Light Violet bg tint, and a "CURRENT" Golden Yellow badge in the Status column.
>
> **Completed semester rows** show a `ti-eye` "View Historical Data" Cobalt button that opens the Semester History View.

---

> ### ADD SEMESTER MODAL (560px)

> Centered modal, white, 16px radius, `rgba(0,0,0,0.55)` overlay.
>
> **Header (56px, Dark Navy gradient):**
> `ti-calendar-plus` Golden Yellow (20px) + "Add Academic Semester" white bold 16px. `ti-x` white close right.
>
> **Body (20px padding, fields stacked 16px gap):**
> - Academic Year (text input, required, placeholder "e.g. 2026–2027", duplicate check inline — green `ti-check` when unique, red error "This academic year already exists in the system"). Helper: "Format: YYYY–YYYY"
> - Semester (dropdown, required): 1st Semester / 2nd Semester / Summer Term. Duplicate check: warns if same year + semester combination already exists.
> - Semester Label (text input, auto-generated but editable, placeholder "e.g. AY2026-2027-1S"). Helper: "Used in reports, exports, and all system labels."
> - Start Date (date picker, required). Must be after end date of most recent completed semester — shows amber warning if gap detected: "Gap detected between last semester end and this start date."
> - End Date (date picker, required, must be after start date). Helper auto-computes: "Duration: X weeks."
> - Status (radio: Upcoming / Active). Warning shown if "Active" selected while another semester is already active: Red-Orange card "Setting this semester as Active will end the current active semester. This is equivalent to running a manual rollover. Are you sure?"
> - Re-enrollment Deadline (date picker, optional): "Date by which students must confirm enrollment for this semester."
> - Notes (textarea, 2 rows, optional, placeholder "Internal notes about this semester...")
>
> **Footer:** "Cancel" gray left + "Save Semester" Dark Navy bg Golden Yellow text `ti-device-floppy` icon right (44px).

---

> ### EDIT SEMESTER MODAL (560px)

> Same structure as Add. Header: "Edit Semester" + Cobalt Blue "Editing: 2nd Semester A.Y. 2025–2026" pill. All fields pre-filled.
>
> Additional read-only section at bottom of body: "Semester Statistics" Dark Navy bold 13px. Four read-only chips: Events Created / Students Enrolled / Liquidations Filed / Certificates Issued. Gray italic note: "These counts are for reference only and do not change when you edit semester dates."
>
> Constraint: Active semester cannot have its Start Date or Status changed. Those fields are read-only (gray bg, `ti-lock` icon) with tooltip "Cannot modify active semester dates. Run rollover to end this semester."

---

> ### SEMESTER ROLLOVER MODAL (Full Multi-Step, 680px)

> Triggered by "Run Semester Rollover" button anywhere in the system. This is the most consequential action in STI Sync.
>
> **Modal structure:** white, 680px max-width, 20px radius, `rgba(0,0,0,0.7)` overlay (darker than other modals — signals importance).
>
> **Modal Header (80px, Dark Navy `#001A4D` to Violet `#83358E` gradient):**
> `ti-refresh` white animated icon (32px, subtle rotation) centered left in Golden Yellow circle (52px) + "Semester Rollover" white bold 22px + "A.Y. 2025–2026 → A.Y. 2026–2027" Golden Yellow 14px (or same year if going from 1st to 2nd semester).
>
> **Step indicator row (below header, white bg, 56px):**
> Four step pills connected by lines: Step 1 "Select New Semester" / Step 2 "Review Impact" / Step 3 "Configure Rollover" / Step 4 "Confirm & Execute." Active step: Violet filled circle + white number + Violet bold label. Completed: green filled circle + white `ti-check`. Upcoming: gray circle + gray label.

---

> **ROLLOVER STEP 1 — SELECT NEW SEMESTER:**
> White body, 24px padding.
>
> "Which semester are you starting?" Dark Navy bold 18px. "Select or confirm the semester that will become active after this rollover." gray 14px.
>
> Two large selection cards side by side (radio behavior):
>
> **Closing Semester Card (left, read-only, gray bg `#F8F8F8`, 16px radius, 20px padding):**
> `ti-lock` gray icon (16px) top-right. "Closing" gray 11px uppercase label. "2nd Semester" Dark Navy bold 20px + "A.Y. 2025–2026" gray 16px + start-end dates gray 13px + "500 Active Students · 24 Events" gray 12px chips.
>
> **Opening Semester Card (right, selectable, white bg, Violet border 2px when selected, 16px radius, 20px padding):**
> Radio button top-right (Violet selected). "Opening" Violet 11px uppercase label. Dropdown to select which semester to open: "1st Semester A.Y. 2026–2027" (suggested, pre-selected) or "Summer Term A.Y. 2025–2026" or other configured upcoming semesters. Shows selected semester's start/end dates below dropdown.
>
> If no upcoming semester configured: amber warning card "No upcoming semester configured. Add a semester in the Semester Records table first before running rollover." + "Add Semester Now" Violet button. Step 1 Next button disabled.
>
> "Next: Review Impact →" Violet button full width, 52px, bottom of body.

---

> **ROLLOVER STEP 2 — REVIEW IMPACT:**
> "What will happen during this rollover?" Dark Navy bold 18px.
>
> Two-column grid of impact cards (equal width, 12px gap):
>
> Left column — "What Resets (Fresh Start):" Dark Navy bold 14px + Red-Orange left accent (3px):
> Impact items as rows (each 40px, `#E0E0E0` bottom divider): `ti-refresh` Red-Orange icon (16px) + description Dark Navy 13px:
> - All 500 active student accounts → Pending Re-enrollment
> - Student compliance scores → Reset to 0%
> - Student attendance rates → Reset to 0%
> - Organization compliance checklists → Reset
> - Active event proposal queue → Closed (pending proposals flagged as semester-expired)
> - Current semester budget tracking → Closed (new allocations needed)
> - Scanner activation codes → Invalidated
>
> Right column — "What Carries Over (Preserved):" Dark Navy bold 14px + Green left accent (3px):
> Impact items: `ti-check` Green icon + description:
> - All event records and outcomes → Accessible via semester filter
> - All attendance logs → Preserved in full
> - All payment records and outstanding balances
> - All fine records and outstanding fines
> - All liquidation records (overdue ones remain flagged)
> - All student identity and verification data
> - All certificate records
> - All audit logs and adviser decisions
> - All organization membership records
>
> **Outstanding Items Warning (full width, amber bg 10% opacity, amber border, 12px radius, 14px padding, 12px top margin):**
> `ti-alert-triangle` amber + "Outstanding Items Before Rollover" amber bold 14px. Three warning rows (if applicable):
> - "X liquidation reports are overdue and unsubmitted. These will remain flagged." amber 13px
> - "X students have outstanding payment balances of ₱[total]. These carry over." amber 13px
> - "X event proposals are still pending SAO review. These will be marked as semester-expired." amber 13px
>
> If all clear: Green card "✓ No outstanding critical items. System is ready for rollover." green 13px.
>
> "← Previous" gray outline left + "Next: Configure →" Violet right.

---

> **ROLLOVER STEP 3 — CONFIGURE ROLLOVER:**
> "Configure the new semester settings." Dark Navy bold 18px.
>
> **Re-enrollment Configuration Card (white, 0.5px border, 12px radius, 16px padding):**
> "Student Re-enrollment" Dark Navy bold 14px + Violet left accent.
> - Re-enrollment Deadline (date picker, required, default 14 days from today): "Students must confirm enrollment by this date."
> - Reminder Schedule (checkbox group, all checked by default): "Send reminder at 7 days remaining" / "Send reminder at 3 days remaining" / "Send reminder at 1 day remaining"
> - Auto-Inactivate Students Who Don't Confirm (toggle, ON default): reveals "After [number input] days past deadline" helper.
> - Notification Message (textarea, pre-filled, editable): "The message students receive with their re-enrollment prompt."
>
> **Budget Configuration Card (white, 0.5px border, 12px radius, 16px padding, 16px top margin):**
> "Budget Setup for New Semester" Dark Navy bold 14px + Violet left accent.
> - Carry Over Unspent Org Budgets (toggle): "Add remaining balances from this semester to next semester's allocation." ON = each org's unspent balance rolls over. OFF = fresh start at ₱0 until new allocations are set.
> - Set School-Level Budget for New Semester Now (toggle): reveals a ₱ input for total school budget (links to Budget & Fund section).
> - Auto-assign Last Semester's Dues to All Members (toggle): "Automatically recreate the same dues structure from this semester for all organizations."
>
> **Organization Configuration Card (white, 0.5px border, 12px radius, 16px padding, 16px top margin):**
> "Organization Settings" Dark Navy bold 14px + Violet left accent.
> - Require Organization Re-registration for New Academic Year (toggle — only shown when rolling over from 2nd Semester to 1st Semester of new academic year)
> - Flag Officer Roles for Re-assignment Review (toggle, ON default): "Notify SAO that organization officer positions should be reviewed and updated."
> - Reset Organization Compliance Scores (toggle, ON default)
>
> "← Previous" + "Next: Confirm →" Violet.

---

> **ROLLOVER STEP 4 — CONFIRM & EXECUTE:**
> "Final confirmation before executing rollover." Dark Navy bold 18px.
>
> **Summary Card (full width, Dark Navy bg, white text, 16px radius, 20px padding):**
> "Rollover Summary" Golden Yellow bold 14px uppercase. Structured rows (each 36px, white at 10% opacity bottom divider):
> - From: "2nd Semester · A.Y. 2025–2026" white 14px
> - To: "1st Semester · A.Y. 2026–2027" Golden Yellow bold 14px
> - Students affected: "500 accounts → Pending Re-enrollment" white 13px
> - Re-enrollment deadline: "[date]" white 13px
> - Budget carry-over: "Yes — unspent balances roll over" or "No — fresh start" white 13px
> - Auto-inactivate: "After 14 days of no confirmation" white 13px
> - Execution time: "Estimated 2–5 minutes" white 13px italic
>
> **Adviser Authorization Card (white, 0.5px border, 16px radius, 16px padding, 16px top margin):**
> Required checkbox (Violet checked, large 22px): "I, [Adviser Name], authorize this semester rollover. I understand this will affect all 500 student accounts, reset semester-specific data, and begin the A.Y. 2026–2027 1st Semester. This action cannot be undone."
> Auto-filled: adviser name + current date/time.
>
> **Footer (sticky, white, 1px top border):**
> "← Previous" gray outline left + "Execute Semester Rollover" Dark Navy bg button right (56px, 12px radius, Golden Yellow `ti-refresh` icon + Golden Yellow text bold 16px). Disabled until checkbox checked. A small red note beside button: "This action cannot be undone." On click: shows progress overlay.

---

> ### ROLLOVER EXECUTION PROGRESS OVERLAY

> Full-screen overlay (`rgba(0,0,0,0.85)`). Centered white card (480px, 20px radius, 32px padding).
>
> Dark Navy gradient header (64px): `ti-refresh` animated spinning Golden Yellow icon (36px) + "Executing Rollover..." white bold 18px.
>
> Progress steps (vertical list, each step row 48px):
> Step rows animate sequentially: gray `ti-clock` icon → Violet spinning `ti-loader` icon (active) → green `ti-check` icon (complete):
> 1. "Closing 2nd Semester A.Y. 2025–2026..."
> 2. "Updating 500 student account statuses..."
> 3. "Resetting semester compliance scores..."
> 4. "Processing budget carry-over..."
> 5. "Generating re-enrollment notifications..."
> 6. "Activating 1st Semester A.Y. 2026–2027..."
> 7. "Updating system configuration..."
> 8. "Writing audit log entry..."
>
> Overall progress bar (full width, 8px height, Violet fill, `#E0E0E0` track, 12px radius) below step list. "Step X of 8" gray 12px right.
>
> **Completion State (all steps green):**
> Green gradient card replaces progress: `ti-circle-check` white (48px) + "Semester Rollover Complete!" Dark Navy bold 20px + "1st Semester A.Y. 2026–2027 is now active." gray 14px. Stats row: "500 students notified / 12 organizations updated / New semester activated" as green chips.
> "View New Semester Dashboard" Dark Navy bg Golden Yellow text button (full width, 52px) + "View Re-enrollment Status" Cobalt outline button.

---

> ### SEMESTER HISTORY VIEW (Full Page Modal or Route)

> Triggered by `ti-eye` on any completed semester row.
>
> **Route:** `/admin/settings/academic-semester/{semesterId}/history`
>
> **Persistent amber banner at top of entire content area:**
> `ti-archive` amber icon + "Viewing Historical Data: 1st Semester · A.Y. 2025–2026. All data in this view is read-only." amber bold 14px. "Return to Current Semester" Dark Navy text link right.
>
> **Semester History Header Card (full width, Dark Navy gradient, 16px radius):**
> "1st Semester · A.Y. 2025–2026" white bold 24px + date range white 14px + "COMPLETED" gray gradient pill. Four stat chips (white bg 15% opacity): Events Held / Students Active / Liquidations Filed / Certificates Issued.
>
> **Four History Tab Modules (horizontal tabs):**
> Events / Attendance / Financial / Students. Each tab shows a read-only summary of that semester's data with export capabilities.
>
> **Events tab:** Approved events list (read-only, all cards gray-tinted with "Completed" or "Cancelled" status pills). No action buttons.
>
> **Attendance tab:** Overall attendance rate donut chart + department breakdown bar chart + top attended events list.
>
> **Financial tab:** Total budget allocated vs spent bar chart + organization financial summary table + liquidation status breakdown.
>
> **Students tab:** Enrollment count, active/inactive breakdown, compliance rate, re-enrollment confirmation rate from that semester.
>
> **Export Card (full width, white, 0.5px border, 12px radius, 16px padding, 16px top margin):**
> "Generate Historical Report" Dark Navy bold 14px. Three export buttons: "Export Full Semester Report (PDF)" Dark Navy button + "Export Financial Summary (Excel)" Cobalt outline + "Export Attendance Data (CSV)" gray outline.

---

# PART 2 — ADMIN PANEL: SCHOOL-LEVEL BUDGET & FUND MANAGEMENT

---

## SCREEN 2 — ADMIN BUDGET & FUND SETTINGS

> **Route:** `/admin/settings/budget-fund`
>
> **Page Header:**
> "Budget & Fund Management" Dark Navy bold 22px. Breadcrumb. Right: "+ Add School Budget Allocation" Dark Navy bg Golden Yellow text button (`ti-plus` icon, 44px).
>
> **Important Context Banner (full width, Cobalt bg 10% opacity, Cobalt border 1px, 12px radius, 14px padding):**
> `ti-info-circle` Cobalt + "School-Level Budget" Cobalt bold 14px. "This section manages the overall school fund that the SAO Adviser controls. This is the institutional budget — NOT individual club budgets. Club budgets are managed by each organization's officers in their own dashboard. The SAO sets the allocation ceiling for each club from this school budget." Dark Navy 13px line-height 1.6.

---

> ### SCHOOL BUDGET OVERVIEW CARD (Full Width)

> Dark Navy gradient header (80px, 16px top radius): `ti-building-bank` Golden Yellow icon (40px) + "STI College Ormoc — Student Affairs Services Budget" white bold 18px + "A.Y. 2025–2026 · 2nd Semester" Golden Yellow 13px. Right side: "Edit School Budget" white outline button (36px).
>
> White card body (24px padding, four stat columns with vertical `#E0E0E0` dividers):
> - "Total School Budget" Dark Navy bold 28px ₱ amount / "For current semester" gray 12px below
> - "Allocated to Organizations" Violet bold 28px ₱ / "distributed across X orgs" gray 12px
> - "Remaining Unallocated" Green bold 28px ₱ / "available for new allocations" gray 12px
> - "Total Disbursed" Cobalt bold 28px ₱ / "actually released to orgs" gray 12px
>
> Allocation progress bar (full width, 12px height, Violet fill, `#E0E0E0` track, 8px radius, below stat columns): "₱X allocated of ₱Y total school budget ([Z]%)" Dark Navy 13px left + percentage Golden Yellow bold right.

---

> ### SEMESTER BUDGET RECORDS TABLE (Full Width, White Card)

> **Active/Archived tabs** + semester filter dropdown ("Current Semester / All Semesters / Specific Semester...") + "+ Add School Budget Allocation" button.
>
> Table columns: Semester, School Year, Total Budget (₱), Allocated to Orgs (₱), Unallocated (₱), Disbursed (₱), Utilization Rate (thin progress bar), Status pill, Actions (`ti-eye` View / `ti-edit` Edit / `ti-archive` Archive).
>
> Current semester row: Golden Yellow 4px left accent + Light Violet tint. Edit enabled. Archive disabled.
> Past semesters: gray text, `ti-eye` only (read-only).

---

> ### ADD SCHOOL BUDGET ALLOCATION MODAL (560px)

> **Header (56px, Dark Navy gradient):**
> `ti-building-bank` Golden Yellow + "Add School Budget Allocation" white bold. `ti-x` close right.
>
> **Body (20px padding):**
> - Semester (dropdown, required — shows all configured semesters: "1st Semester A.Y. 2026–2027" etc.). DUPLICATE CHECK: "A budget allocation already exists for this semester. Edit the existing record instead." red error if duplicate.
> - School Year (auto-filled from selected semester, read-only)
> - Total School Budget for This Semester (₱ currency input, required, min ₱1). Helper: "This is the total SAS fund available for student organization activities this semester."
> - Notes / Source of Funds (textarea, 2 rows, optional, placeholder "e.g. Annual institutional allocation from school administration")
> - Carry Over Unspent Balance from Previous Semester (toggle): reveals "Unspent from previous semester: ₱[auto-computed]" read-only row below toggle. When ON: Total Effective Budget = input amount + carry-over.
>
> **Organization Allocation Preview (below main fields, Light Violet bg, Violet border, 12px radius, 14px padding):**
> `ti-info-circle` Violet + "After saving, you can distribute this budget to individual organizations from the Organization Budget Allocation section below." Violet 12px italic. "Organizations not yet allocated will have ₱0 ceiling until you assign them." gray 11px.
>
> **Footer:** "Cancel" gray + "Save Budget Allocation" Dark Navy bg Golden Yellow text.

---

> ### EDIT SCHOOL BUDGET MODAL (560px)

> Same fields pre-filled. Header: "Edit School Budget" + "Editing: 2nd Semester A.Y. 2025–2026" Cobalt pill. Additional read-only stats row: "Already Allocated to Orgs: ₱X. Editing total cannot go below this amount." Shows red error if new total < already allocated amount: "Cannot reduce total school budget below ₱X — that amount is already allocated to organizations."

---

> ### ORGANIZATION BUDGET ALLOCATION TABLE (Full Width, White Card, 16px top margin)

> Section header: "Organization Budget Ceilings" Dark Navy bold 16px + Violet left accent + semester filter pill + "Bulk Update (CSV)" Cobalt outline button + "Auto-Distribute Equally" gray outline button.
>
> Description: "Set the maximum budget ceiling each organization can request from the school fund this semester." gray 13px.
>
> Table columns: Organization (avatar + name), Org Type (pill), Semester Ceiling (₱ — **inline editable number input**, Violet focus ring when active), Amount Requested by Org (₱, read-only from officer's budget entries), Amount Approved by SAO (₱, read-only — computed from approved liquidations), Utilization % (progress bar, Violet fill), Actions (`ti-eye` View Org Finance, `ti-edit` Edit Ceiling).
>
> "Total Allocated" summary row at bottom (Dark Navy bg, white text): sum of all ceiling amounts + "Remaining Unallocated: ₱X" Golden Yellow right.
>
> Warning row (shown inline if any org ceiling > remaining school budget): red-orange row with `ti-alert` icon.
>
> "Save All Ceilings" Violet button (full width, 52px, below table) — saves all inline edits at once.

---

> ### EDIT ORG CEILING MODAL (480px)

> **Header (56px, Violet gradient):**
> `ti-wallet` white + "Edit Budget Ceiling" white bold + org name Golden Yellow pill.
>
> **Body:**
> - Organization (read-only chip: avatar + name + type)
> - Semester (read-only: current semester label)
> - Current Ceiling (read-only, gray bg, current value shown)
> - New Ceiling Amount (₱ input, required). Validation: cannot exceed remaining unallocated school budget (shows "Remaining available: ₱X" as helper below input — updates live as user types). Cannot be less than already disbursed amount.
> - Disbursement Date (date picker, optional): "When will funds be released to this organization?"
> - Disbursement Method (dropdown: Cash / Check / Direct Transfer / Petty Cash)
> - Remarks (textarea, 2 rows, optional — sent to org officers)
> - Notify Organization Officers (toggle, ON default)
>
> **Footer:** "Cancel" + "Update Ceiling" Violet bg white text.

---

> ### BUDGET CATEGORIES TABLE (Below org allocation, white card, 16px top margin)

> Section header: "Budget Categories & Spending Rules" Dark Navy bold 14px + Active/Archived tabs + "+ Add Category" button.
>
> Table: Category Name, Description, Default Spending Limit (₱ or "No Limit"), Applies To (All Orgs / Specific Types), Overspend Action (Block/Warn/Allow pill), System Default badge, Status toggle, Actions (`ti-edit` / `ti-archive`).
>
> **Add Budget Category Modal (520px):**
> Dark Navy header: `ti-tag` Golden Yellow + "Add Budget Category" white bold.
> Fields: Category Name (required, duplicate check) + Description (textarea, 2 rows) + No Spending Limit toggle (when ON: hides amount, shows "Unlimited") + Default Spending Limit (₱ input, shown when toggle OFF) + Applies To (All Orgs / Specific Types multi-select) + Overspend Action (dropdown: Block Submission / Show Warning / Allow Silently — amber note on "Allow Silently") + Status toggle.
>
> **Edit Budget Category Modal:** Same pre-filled. System defaults: Name read-only.

---

# PART 3 — OFFICER DASHBOARD: CLUB BUDGET & PAYABLES

---

## SCREEN 3 — OFFICER FINANCIAL OVERVIEW (NEW HUB MODULE)

> This replaces the previous Financial Liquidation page as the entry point. Financial Liquidation becomes a sub-section. The new hub brings together Budget Tracking + Student Payables + Liquidation in one unified financial center.
>
> **Route:** `/officer/finance`
>
> **New sidebar nav item:**
> `ti-cash` — Finance Center (replaces `ti-receipt` Financial Liquidation as the main financial nav. Liquidation becomes a sub-page under Finance Center.)
>
> **Page Header:**
> "Finance Center" Dark Navy bold 22px. Breadcrumb. Right: semester selector pill ("2nd Semester · A.Y. 2025–2026 `ti-chevron-down`") + "Export Financial Report" Dark Navy button.
>
> **When viewing a past semester:** full-width amber banner below header: `ti-archive` amber icon + "Viewing: 1st Semester · A.Y. 2025–2026 — All data is read-only." amber bold 14px. "Return to Current Semester" Dark Navy text link right.

---

> ### FINANCE CENTER — TOP METRICS (Six Cards, Two Rows of Three)

> Each card: white bg, 0.5px `#E0E0E0` border, 16px radius, 20px padding. Top: colored Tabler icon (24px) top-right + muted gray 12px label top-left. Bottom: bold 28px colored number + gray 12px note below.
>
> Row 1 — Budget Cards:
> - "Club Budget Ceiling" — Violet bold ₱ number, `ti-building-bank` icon, "set by SAO Adviser" gray note
> - "Total Club Expenditures" — Cobalt bold ₱, `ti-trending-up` icon, "this semester" note
> - "Remaining Budget" — Green bold ₱ (red-orange if negative), `ti-wallet` icon, "unspent this semester" note
>
> Row 2 — Payables Cards:
> - "Total Payables Assigned" — Dark Navy bold ₱, `ti-coin` icon, "across X members" note
> - "Total Collected" — Green bold ₱, `ti-check` icon, "+₱X this month" note
> - "Total Outstanding" — Red-Orange bold ₱, `ti-alert-circle` icon, "across X members" note
>
> If semester has just started and no budget ceiling set yet: Violet card shows "Not Set" in place of ₱ amount + amber note: "SAO Adviser has not yet set your budget ceiling for this semester." + `ti-bell` "Request Budget Allocation" Cobalt text link.

---

> ### THREE-TAB CONTENT AREA (below metrics)

> Horizontal tabs: "Budget Tracker" / "Student Payables" / "Liquidation Reports." Active tab: Dark Navy bg, white text, Violet underline. Inactive: white bg, gray text.

---

> ### TAB 1 — BUDGET TRACKER

> **Club Budget Summary Card (full width, white, 0.5px border, 16px radius, 20px padding):**
>
> Dark Navy gradient header (64px): `ti-chart-pie` Golden Yellow + "Club Budget — [Org Name]" white bold 16px + semester label Golden Yellow 12px + edit icon (white `ti-edit`, 20px — opens Edit Club Budget Modal, only if officer has permission).
>
> White body — two-column:
>
> Left (60%) — Budget Breakdown:
> - Budget Ceiling row: "SAO-Approved Ceiling" gray 12px + ₱ amount Dark Navy bold 20px
> - Total Budgeted row: "Amount Budgeted by Club" gray 12px + ₱ amount Violet bold 20px
> - Total Spent row: "Actually Spent (Approved Liquidations)" gray 12px + ₱ amount Cobalt bold 20px
> - Remaining row: "Remaining Budget" gray 12px + ₱ amount Green bold 20px (red-orange if negative)
> - Full-width budget utilization bar (16px height, 8px radius): three-segment bar showing Spent (Cobalt fill) / Budgeted-not-yet-spent (Violet fill at 40% opacity) / Unbudgeted (gray track). Legend chips below bar. Percentage labels on each segment.
>
> Right (40%) — Budget Donut Chart:
> Donut chart showing budget breakdown by category (Venue, Food, Equipment, etc.) in Violet/Cobalt/Golden Yellow/Green/Amber/Coral. Total amount in center (Dark Navy bold). Category legend below chart with ₱ amounts and percentages.
>
> **Budget Line Items Table (full width, white card, 16px top margin):**
> Section header: "Club Budget Plan" Dark Navy bold 14px + Violet left accent + "+ Add Budget Item" Violet outline button (36px) + "Edit All" gray text link.
>
> Table columns: # / Category (colored pill) / Description / Estimated Amount (₱) / Actual Spent (₱, from approved liquidations — auto-computed, read-only) / Variance (₱ difference, green if under, red-orange if over) / Status (Planned/Approved/Overspent pill) / Actions (`ti-edit` / `ti-archive`).
>
> Summary row: Dark Navy bg, white text — Total Estimated / Total Actual / Total Variance.
>
> "Save Budget Plan" Violet button full width (52px) below table — shown when any inline edits pending.
>
> **When viewing a past semester:** table is fully read-only, no add/edit buttons, amber "Historical Data" banner above table.

---

> ### ADD / EDIT CLUB BUDGET ITEM MODAL (520px)

> **Header (56px, Violet gradient):**
> `ti-plus` white (Add) / `ti-edit` white (Edit) + "Add Budget Item" / "Edit Budget Item" white bold + org name Golden Yellow pill. `ti-x` close.
>
> **Body:**
> - Category (dropdown, required — pulls from admin-configured budget categories. Each option: colored dot + category name. "+ Request New Category" Violet text link at bottom of dropdown — submits a category request to SAO Adviser.)
> - Description (text input, required, placeholder "e.g. Venue rental for GenAss", max 200 chars)
> - Estimated Amount (₱ currency input, required, min ₱0.01). Live validator below: "Remaining unbudgeted ceiling: ₱[X]" — turns amber when within 20% of ceiling, red-orange when exceeded.
> - Funding Source (dropdown): Club Funds / SAO Budget / Sponsorship / Student Registration Fees / Donation
> - Justification (textarea, 2 rows, placeholder "Why is this expense needed?")
> - Notes (textarea, 2 rows, optional)
>
> Ceiling warning card (shown when estimated amount + current total > SAO ceiling): Red-Orange bg 8% opacity, red-orange border: "Adding this item will exceed your SAO-approved budget ceiling by ₱[X]. The SAO Adviser may reduce or reject this during liquidation review." red-orange 13px.
>
> **Footer:** "Cancel" gray + "Save Budget Item" Violet bg white text.

---

> ### EDIT CLUB BUDGET (SEMESTER SETTINGS) MODAL (520px)

> Opened from the pencil icon on the Budget Summary Card header. Sets the club's overall budget plan metadata.
>
> **Header:** Violet gradient, `ti-wallet` white + "Club Budget Settings" white bold.
>
> **Body:**
> - Club Budget Name (text input, placeholder "e.g. IT Guild Budget — 2nd Semester A.Y. 2025–2026", auto-filled but editable)
> - SAO-Approved Ceiling (read-only, gray bg, `ti-lock` icon): "₱[amount] — Set by SAO Adviser. Contact SAO to request a ceiling increase."
> - Carry Over From Last Semester (read-only info row): "Carry-over balance from 1st Semester: ₱[amount]" (gray bg, computed automatically from rollover settings).
> - Total Effective Budget (read-only, computed): Ceiling + Carry-over = ₱[total]. Dark Navy bold 16px.
> - Notes (textarea, 2 rows)
>
> **Footer:** "Cancel" + "Save" Violet.

---

> ### TAB 2 — STUDENT PAYABLES

> Full payables management hub for the organization. This is the complete view of all money owed to the club by its members.
>
> **Payables Overview Card (full width, white, 0.5px border, 16px radius, 20px padding):**
> Four inline stat columns (vertical dividers): Total Payables Assigned (₱ Dark Navy bold) / Total Collected (₱ Green bold) / Total Outstanding (₱ Red-Orange bold) / Collection Rate (Violet bold %).
>
> Collection progress bar (full width, 12px, Violet fill, `#E0E0E0` track, 8px radius): "[X]% of total payables collected this semester" label right.
>
> **Sub-tabs (below overview card):** "By Member" / "By Payable Type" / "Overdue" (red count badge on Overdue if any).

---

> #### BY MEMBER SUB-TAB

> Filter Bar: Search + Department + Year Level + Payment Status (All/Paid/Partial/Unpaid/Overdue) + Sort.
>
> **Payables Table (full width):**
> Columns: Checkbox, Avatar + Name + Student ID, Course & Year, Total Assigned (₱), Total Paid (₱ green), Outstanding (₱ red-orange bold), Last Payment Date, Payment Status pill, Actions (`ti-eye` View Profile / `ti-coin` Add Payable / `ti-check` Record Payment / `ti-bell` Send Reminder).
>
> Expandable row (click anywhere on row except actions): inline mini-table showing this member's individual payable items — Payable Name / Amount / Due Date / Paid / Status.
>
> Bulk action bar (on checkbox select): "Send Reminder to Selected" Cobalt + "Add Payable to Selected" Violet + "Record Bulk Payment" Green + "Export Selected" gray.

---

> #### BY PAYABLE TYPE SUB-TAB

> **Payable Summary Cards (responsive grid, 3 columns):**
> Each payable type as a card (white, 0.5px border, 12px radius, 16px padding): type name Dark Navy bold 14px + type pill + total assigned ₱ Violet bold 18px + collected ₱ green 14px + outstanding ₱ red-orange 14px + thin collection progress bar Violet fill + member count gray 12px + "View Breakdown" Cobalt text link bottom.
>
> Clicking "View Breakdown" opens a side panel (400px, right slide-in): payable type header + full member list table showing who paid / who hasn't for that specific payable type. Actions per member row: "Record Payment" Green button + "Send Reminder" Cobalt button.

---

> #### OVERDUE SUB-TAB

> **Context Card (full width, Red-Orange bg 8% opacity, red-orange border, 12px radius, 14px padding):**
> `ti-clock` red icon + "Overdue Payables" red-orange bold 14px + "These members have payables that are past their due date. Send reminders or record manual payments." Dark Navy 13px.
>
> **Overdue Table:** Same as By Member but filtered to overdue only. Additional columns: "Days Overdue" (red-orange bold number) + "Fine Accrued" (₱ red-orange if auto-fine enabled in settings). Bulk "Send Overdue Reminder" Red-Orange button at top.

---

> #### PAYABLES REPORT CARD (Full Width, Below Sub-tabs, 16px top margin)

> White card, 0.5px border, 16px radius, 20px padding.
> "Payables Report" Dark Navy bold 14px + Violet left accent.
> Two chart panels side by side:
> Left: Bar chart — monthly collection amounts (Violet bars) vs monthly payables assigned (Dark Navy outline bars). X-axis = months of semester.
> Right: Pie chart — collection by payable type (each type a different color). Legend below.
>
> "Export Payables Report" Dark Navy button + "Print Summary" gray outline, right-aligned below charts.

---

> ### TAB 3 — LIQUIDATION REPORTS

> This is the existing Financial Liquidation module moved here as a sub-tab. All existing functionality preserved (status pipeline tabs, liquidation report cards, create/edit form). Now contextually part of the Finance Center.
>
> Additional context card at top: "Liquidation reports must account for budget items in your Club Budget Plan. The SAO Adviser will cross-reference your liquidations against your approved budget ceiling." Light Violet bg, Violet border.

---

# PART 4 — OFFICER: SEMESTER TRANSITION EXPERIENCE

---

## SCREEN 4 — OFFICER SEMESTER TRANSITION SCREENS

> These screens appear automatically to officers when a semester rollover has been run by the SAO Adviser.

---

> ### SCREEN 4A — SEMESTER ENDED NOTIFICATION (Full-Screen Takeover)

> Shown when officer logs in after the SAO runs semester rollover but before the officer has acknowledged the transition. White background.
>
> Centered content:
> - Dark Navy gradient circle (120px), Golden Yellow `ti-refresh` icon (64px), subtle rotation animation
> - "Semester Has Ended" Dark Navy bold 28px, 20px below circle
> - "2nd Semester · A.Y. 2025–2026 has concluded." gray 16px centered, 8px below
> - "What happened to your data?" expandable collapsible card (Cobalt Blue header, chevron): lists what was preserved vs what reset — same two-column impact list as the rollover Step 2 modal.
>
> Two action cards side by side (white, 0.5px border, 16px radius, 24px padding, 20px top margin):
>
> Left card: `ti-history` Cobalt icon (40px) + "View Past Semester" Cobalt bold 16px + "Browse events, attendance, finances, and payables from the completed semester." gray 13px + "View 2nd Semester Data" Cobalt outline button (full width, 44px, 8px radius).
>
> Right card: `ti-arrow-right` Violet icon (40px) + "Start New Semester" Violet bold 16px + "Begin working in 1st Semester A.Y. 2026–2027." gray 13px + "Go to New Semester Dashboard" Violet filled button (full width, 44px).
>
> "I'll decide later" gray text link centered below both cards.

---

> ### SCREEN 4B — FRESH SEMESTER SETUP CHECKLIST

> After officer clicks "Go to New Semester Dashboard," instead of jumping straight to the dashboard, they see a **one-time semester setup checklist** for their organization. White background, 24px horizontal padding.
>
> **Header:**
> "Set Up Your Organization for 1st Semester A.Y. 2026–2027" Dark Navy bold 22px + "Complete these steps to get your organization ready for the new semester." gray 14px.
>
> **Setup Checklist Card (full width, white, 0.5px border, 16px radius, 20px padding):**
> Four checklist items (each 64px height, `#E0E0E0` bottom divider):
>
> Item 1 — "Confirm Organization Officers":
> Status: `ti-circle` gray (incomplete) → `ti-circle-check` green (done). `ti-shield` Violet icon left (40px circle, Violet bg 10%). "Confirm Organization Officers" Dark Navy bold 14px + "Verify that your organization's officer roster is up to date for this semester." gray 12px. "Update Officers" Violet outline button right (36px, 8px radius).
>
> Item 2 — "Set Club Budget Plan":
> `ti-wallet` Cobalt icon. "Set Club Budget Plan" Dark Navy bold + "Plan your organization's expenditures for the new semester." gray 12px. Status shows "SAO Ceiling: ₱[amount] set" green chip if SAO has set it, or amber "Ceiling not yet set by SAO" chip if not. "Set Budget Plan" Cobalt outline button or "View Budget" if already set.
>
> Item 3 — "Set Up Member Dues":
> `ti-coin` amber icon. "Set Up Member Dues" Dark Navy bold + "Configure the dues and registration fees for your members this semester." gray 12px. "Set Up Dues" amber outline button.
>
> Item 4 — "Assign Dues to Members":
> `ti-users` Green icon. "Assign Dues to Members" Dark Navy bold + "Once dues are configured, assign them to your active members." gray 12px. Disabled (gray) until Item 3 complete. "Assign Dues" Green outline button.
>
> Progress bar below checklist items (full width, 8px, Violet fill, `#E0E0E0` track): "X of 4 setup steps completed."
>
> "Skip Setup — I'll do this later" gray text link centered below card. "Continue to Dashboard →" Violet filled button (52px, full width, 12px radius) — enabled when at least 1 item checked, with note "You can complete remaining steps from your dashboard." gray 12px below button.

---

> ### SCREEN 4C — PAST SEMESTER VIEW (Officer)

> Triggered from semester selector dropdown in any Finance Center sub-tab OR from the transition screen.
>
> **Persistent amber banner (full width, below topbar, sticky):**
> `ti-archive` amber icon + "Viewing: 2nd Semester · A.Y. 2025–2026 — Read-Only Historical Data." amber bold 14px. "Return to Current Semester" Dark Navy text link right + semester selector pill left.
>
> All content in Finance Center (Budget Tracker, Student Payables, Liquidation) becomes read-only when viewing past semester:
> - All add/edit/delete buttons hidden
> - All inputs become read-only (gray bg)
> - Table action buttons reduced to `ti-eye` View only
> - Forms show "Historical Record — Read Only" amber badge in header
>
> **Historical Finance Summary Card (appears at top of each tab when viewing past semester):**
> Dark Navy bg card (16px radius, 16px padding). Shows the final figures for that semester: Final Budget Utilization / Total Collections / Total Outstanding (carried over) / Total Liquidations Filed. Four Golden Yellow bold numbers. "This is the final financial record for this semester." white 12px italic.
>
> **Export buttons remain active:** "Export This Semester's Report (PDF)" Dark Navy button + "Export Payables Summary (Excel)" Cobalt outline — historical exports always available.

---

# PART 5 — SEMESTER SELECTOR COMPONENT (Universal)

---

> **Semester Selector Pill (appears in all major module page headers, both Admin and Officer):**
>
> Design: a pill-shaped dropdown trigger (white bg, 0.5px `#E0E0E0` border, 8px radius, 36px height, 16px horizontal padding): `ti-calendar` Cobalt icon (16px) left + "2nd Semester · A.Y. 2025–2026" Dark Navy 13px bold + "CURRENT" green pill badge (8px font, 10px padding) right + `ti-chevron-down` gray icon far right. On hover: `#F5F5F5` bg + border darkens to Cobalt.
>
> **Dropdown (full-width panel, max 320px, white bg, 0.5px border, 12px radius, `box-shadow: 0 4px 16px rgba(0,0,0,0.12)`):**
>
> Header row (inside dropdown): "Select Semester" gray 11px uppercase + `ti-x` close icon right (20px).
>
> Semester list items (each 52px height, `#E0E0E0` bottom divider, hover = Light Violet):
> - Current: Light Violet bg, Violet text, "CURRENT" green pill right, Violet 3px left accent
> - Past completed: white bg, Dark Navy text, "COMPLETED" gray pill right
> - Future/Upcoming: white bg, Dark Navy text, "UPCOMING" Cobalt pill right (read-only, clicking shows "This semester has not started yet" tooltip)
>
> Each item: semester name Dark Navy bold 13px + school year gray 12px + date range gray 11px italic.
>
> Footer inside dropdown: "Manage Semesters" Cobalt text link (admin only) — navigates to Settings > Academic Semester.
>
> **When past semester selected:** dropdown closes, amber banner appears across page, all data refreshes to show that semester's records. The semester selector pill changes: removes "CURRENT" badge, shows selected semester name, bg tints to amber 15%.

---

## GLOBAL DESIGN NOTES

> - **Semester selector persistence:** The selected semester context persists within a session. If the officer switches to a past semester in Budget Tracker, all other Finance Center tabs also switch to that past semester automatically. A single source of semester context.
>
> - **Read-only past data:** Past semester data is always visually distinct — amber banner, grayed out inputs, hidden action buttons, "Historical Data" stamps on cards. A user should never accidentally edit historical records.
>
> - **Budget ceiling vs club budget:** These are two different concepts always shown distinctly. The ceiling (set by SAO) is always shown in a read-only format with a `ti-lock` icon. The club's own budget plan (set by officers) is editable within that ceiling. The remaining = ceiling minus total budgeted. Always label which is which.
>
> - **Outstanding balances never reset:** When the semester rollover card says "Resets" — that means compliance scores and attendance rates, not financial balances. Outstanding dues and unpaid fines from a past semester always carry forward, always shown in red-orange, always flagged until resolved.
>
> - **Rollover is an admin-only action:** Officers experience the rollover but cannot trigger it. Their semester transition experience (Screens 4A, 4B, 4C) is reactive — it happens because the SAO Adviser ran the rollover.
>
> - **All modals follow global modal patterns:** Dark Navy gradient header for admin modals, Violet gradient header for officer modals. White body, sticky footer. Archive confirmation = amber. Restore = green. Permanent delete = red-orange with "Type DELETE" confirmation.
>
> - **Empty states per semester:** If an officer switches to a past semester with no data (e.g., they joined the org this semester), show: centered `ti-calendar-off` Cobalt (48px) + "No data for this semester" Dark Navy bold + "Your organization had no activity during [semester name]." gray 14px.
>
> - Optimized for 1440px desktop. 24px page padding. 20px card padding. All modals centered with overlay. Modal max-height 85vh with internal scroll.