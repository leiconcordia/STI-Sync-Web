Here's the complete and detailed Figma prompt for the **Student Registration & Verification System** in the SAO Admin Panel:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Student Registration & Verification System** module for the **STI Sync SAO Admin Panel**. This module handles the full lifecycle of student accounts — from first-time registration review, identity verification, semester re-enrollment management, to account status control. This is one of the most operationally critical modules in the entire system because every student who uses the mobile app must pass through here before they can access any STI Sync features.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons.

---

## GLOBAL LAYOUT

> This module lives inside the existing SAO Admin Panel shell (sidebar + topbar). The sidebar nav item "ti-users — Student Registry" now has a sub-menu that expands when active:
> - ti-clock — Pending Verification
> - ti-refresh — Re-enrollment Management
> - ti-user-check — Active Students
> - ti-user-off — Inactive & Suspended
> - ti-archive — Archived / Graduates
>
> Each sub-item shows a count badge. "Pending Verification" and "Re-enrollment Management" show red and amber badges respectively when there are items requiring action.

---

## SCREEN 1 — MODULE DASHBOARD

> The landing screen when the adviser clicks "Student Registry" in the sidebar. A high-level overview of the entire student account ecosystem before diving into any specific queue.
>
> **Page Header:**
> Title "Student Registry" in Dark Navy bold 22px. Breadcrumb: "Dashboard > Student Registry." Right side: "Run Semester Rollover" Violet button with ti-refresh icon (high-impact action — opens confirmation modal) + "Export Registry" Dark Navy button with ti-download icon.
>
> **Semester Rollover Status Banner (full width, shown conditionally):**
> Three possible states:
>
> State A — Rollover Needed (shown at start of new semester):
> Dark Navy gradient bg, Golden Yellow left border (6px). White bold title: "New Semester Detected — Rollover Required." White body: "Academic Year 2026–2027, 1st Semester has been set as active. Run the semester rollover to reset student enrollment statuses and begin re-enrollment confirmation." Golden Yellow "Run Semester Rollover Now" button with ti-refresh icon. Gray "Remind Me Later" text link.
>
> State B — Rollover In Progress (shown during active re-enrollment period):
> Cobalt Blue gradient bg. White title: "Re-enrollment In Progress — A.Y. 2026–2027, 1st Semester." A full-width white progress bar showing re-enrollment completion: "342 of 500 students confirmed (68%)" — Violet fill, gray track, percentage label. White subtitle: "Re-enrollment deadline: [date]. Students who have not confirmed will be automatically set to Inactive." Golden Yellow "Send Reminder to Unconfirmed Students" button. "View Re-enrollment Status" white outline text link.
>
> State C — All Clear (normal operations):
> Green gradient bg. White title: "All Systems Active — A.Y. 2025–2026, 2nd Semester." White body: "500 students active. No pending actions required." No action buttons needed.
>
> **Five Status Metric Cards (gradient style, full reference):**
> Large rounded cards, gradient bg, white text, semi-transparent icon box top-left, count number bold 48px center, label below, comparison note at bottom:
> - "Pending Verification" — Red-Orange gradient (`#EF4444` → `#F97316`), ti-clock icon, "Awaiting SAO Review" note, "Review Now" amber pill top-right
> - "Pending Re-enrollment" — Amber gradient (`#FFC107` → `#F59E0B`), ti-refresh icon, "Awaiting student confirmation" note, "Deadline in X days" pill
> - "Active Students" — Green gradient (`#22C55E` → `#16A34A`), ti-user-check icon, "+X this semester" comparison note
> - "Inactive Students" — Dark Navy gradient (`#001A4D` → `#0C3C8A`), ti-user-off icon, "Did not re-enroll" note
> - "Suspended Accounts" — Cobalt Blue gradient, ti-ban icon, "Under SAO action" note
>
> **Two-column section below metrics:**
>
> Left column (7/12) — "Pending Verification Queue Preview" card:
> White card, Violet header bar with white title "Needs Your Review" + count badge. Shows the top 5 most recent pending registrations as preview rows. Each row: student selfie circle avatar (40px), full name Dark Navy bold, student ID gray, course and year gray, submission timestamp muted, and a Violet "Review" button. A "View All Pending" Golden Yellow text link at bottom right. If queue is empty: centered ti-circle-check Cobalt icon + "All registrations reviewed. No pending submissions." gray text.
>
> Right column (5/12) — "Recent Activity Feed" card:
> White card, Dark Navy header "Recent Account Activity." Vertical feed of last 10 account actions: colored left border dot (green = approved, red = rejected, amber = returned, blue = reactivated), action description in Dark Navy 13px (e.g., "Juan dela Cruz — Account Approved"), timestamp in gray 12px. "View Full Audit Log" Cobalt text link at bottom.

---

## SCREEN 2 — PENDING VERIFICATION QUEUE

> The most important screen in this module. Every new student registration lands here first.
>
> **Page Header:**
> Title "Pending Verification" with breadcrumb. Right side: "Bulk Actions" dropdown button (Dark Navy, ti-chevron-down) with options: "Approve Selected", "Reject Selected", "Export Queue" + "Refresh" icon button.
>
> **Filter Bar:**
> Search input (placeholder: "Search by name, student ID, or email..."), Course filter dropdown, Year Level dropdown, Submission Date Range picker, Sort dropdown (Newest First / Oldest First / Name A–Z). A "Showing X pending registrations" gray count label on the right.
>
> **Verification Cards Grid (2-column grid, full width):**
> Each pending registration is a prominent white card with 0.5px `#E0E0E0` border, 12px radius. Cards are larger than typical list rows because the adviser needs to make identity judgments.
>
> Each card layout:
>
> **Card Top Section — Identity Comparison Panel (most important area):**
> Two side-by-side photo containers with a "VS" divider between them:
> - Left container (labeled "Selfie Photo" in gray 12px above): the student's live selfie photo, 120px × 120px, rounded square (12px radius), with a Dark Navy subtle border
> - Right container (labeled "School ID Photo" in gray 12px above): the uploaded ID card photo, 120px × 120px, same styling
> Below both photos: a light violet `#F3E8FF` bg card with Violet ti-eye icon + "Compare these photos carefully before approving." Violet italic text
>
> **Card Middle Section — Submitted Information:**
> Two-column info grid below the photos:
> - Full Name (Dark Navy bold)
> - Student ID (Dark Navy bold + copy icon)
> - Course (gray)
> - Year Level & Section (gray)
> - Department (gray)
> - Email Address (gray + ti-mail icon)
> - Contact Number (gray + ti-phone icon)
> - Submission Date & Time (muted gray italic)
>
> **Card Bottom Section — Verification Checklist:**
> Three checkbox rows the adviser manually checks before approving:
> - "Selfie photo matches School ID photo" (checkbox, Violet checked state)
> - "Student ID number appears legitimate" (checkbox)
> - "Submitted information appears complete and accurate" (checkbox)
> All three must be checked before the Approve button activates. If not all checked: Approve button stays gray/disabled with tooltip "Complete the verification checklist first."
>
> **Card Action Row (bottom of card):**
> Three buttons:
> - "Approve" — Green gradient button, white text, ti-user-check icon, full width of left 2/3 of action row. Disabled (gray) until all three checklist items are checked.
> - "Request Correction" — Amber outline button, Dark Navy text, ti-edit icon, right 1/3
> - "Reject" — red text link below the two buttons, centered, ti-x icon. Less prominent because rejection should be a last resort.
>
> A "View Full Submission" Cobalt Blue text link at very bottom of card — opens the Full Review Side Panel.
>
> **Full Review Side Panel (480px, slides in from right):**
> Triggered by "View Full Submission" or by clicking anywhere on the card body.
>
> Dark Navy gradient header (56px): white "Student Verification Review" title + Golden Yellow submission reference number (e.g., "REG-2026-0089") + white ti-x close button.
>
> Panel body (scrollable):
>
> **Identity Verification Section:**
> Large side-by-side photo comparison (160px × 160px each) with the same "VS" divider. Below photos: a "Photo Match Confidence" row — three radio options the adviser selects: "Clear Match ✓" (green), "Possible Match — Proceed with Caution" (amber), "No Match ✗" (red). This selection auto-checks/unchecks the first checklist item.
>
> **Submitted Details Section:**
> Full structured display of all submitted fields in labeled rows with Dark Navy values. Each field has a small ti-flag icon on hover — clicking it flags that specific field as needing correction (used for Request Correction flow).
>
> **Enrollment Verification Section (admin-only, read-only):**
> A card labeled "Cross-Reference Check" with Cobalt Blue header. Shows whether the student ID number exists in the system's enrolled student database (if integrated) — "✓ Student ID found in enrollment records" (green) or "⚠ Student ID not found — manual verification required" (amber). If no integration: shows "Manual verification required — check institutional records."
>
> **Verification Checklist (full panel version):**
> Same three checkboxes but larger and more prominent. Below the checklist: an "Adviser Notes" textarea (placeholder: "Add internal notes about this verification — visible only to SAO staff..."). Notes are saved to the student's permanent record.
>
> **Decision Buttons (sticky at bottom of panel):**
> Full-width stack:
> - "Approve Account" — Green gradient, white bold, ti-user-check, full width. Disabled until all checklist items checked.
> - "Request Correction" — Amber bg at 15% opacity, amber border, Dark Navy text, ti-edit icon, full width
> - "Reject Registration" — Red-Orange gradient, white text, ti-x icon, full width
>
> **Approve Action:**
> Clicking "Approve Account" shows an inline confirmation within the panel (no separate modal needed since the checklist already served as confirmation): a green success card slides in: "Account Approved ✓ — [Student Name] will be notified and can now log in to STI Sync." Panel auto-closes after 2 seconds. The card disappears from the Pending queue.
>
> **Request Correction Action:**
> Opens a "Correction Request" form within the panel:
> - Flagged Fields (multi-select checklist of all submitted fields — adviser checks which ones need correction): Profile Photo, School ID Photo, Full Name, Student ID, Course, Year Level, Section, Email, Contact Number
> - Correction Instructions (textarea, required, placeholder: "Explain specifically what needs to be corrected and how..."): "e.g., Your school ID photo is blurry. Please retake a clear photo of your physical STI ID card."
> - "Send Correction Request" amber button — sends in-app notification and email to student with specific instructions. Student's account status changes to "Correction Required." They can resubmit only the flagged fields.
>
> **Reject Action:**
> Opens a "Rejection" form within the panel:
> - Rejection Reason (dropdown): Fraudulent ID Submitted, Student ID Does Not Match Records, Photo Identity Mismatch, Duplicate Account Detected, Not an Enrolled Student, Incomplete Submission, Other
> - Detailed Explanation (textarea, required): "This message will be sent to the student."
> - Allow Resubmission (toggle, ON by default): "Student can submit a new registration after X days" + number input
> - "Confirm Rejection" Red-Orange gradient button. Student receives notification with the rejection reason.

---

## SCREEN 3 — RE-ENROLLMENT MANAGEMENT

> Shown at the start of every new semester after the Semester Rollover is run. Manages the process of getting returning students to confirm their continued enrollment.
>
> **Page Header:**
> Title "Re-enrollment Management" with breadcrumb. Right side: "Send Bulk Reminder" Violet button (ti-bell icon) + "Export Status" Dark Navy button.
>
> **Semester Re-enrollment Progress Card (full width, Dark Navy gradient header):**
> Header: "A.Y. 2026–2027 — 1st Semester Re-enrollment" white bold title + "In Progress" Golden Yellow animated pill badge.
>
> White card body:
> - Large progress bar (full width, 20px height, Violet fill, gray track, 12px radius): "342 / 500 students confirmed" label left, "68%" label right
> - Four mini stat cards below the bar in a row:
>   - "Confirmed" — Green gradient mini card, count number
>   - "Pending" — Amber gradient mini card, count
>   - "Overdue" — Red-Orange gradient mini card (students past reminder deadline), count
>   - "Auto-Inactivated" — Dark Navy gradient mini card, count
> - Re-enrollment Deadline row: ti-calendar icon + date in Dark Navy bold + "X days remaining" amber pill if close, green pill if plenty of time, red pill if past deadline
> - "Extend Deadline" Cobalt Blue text link (opens a date picker modal)
>
> **Re-enrollment Status Tabs:**
> Horizontal tabs with count badges: All / Confirmed / Pending / Overdue / Auto-Inactivated. Active tab: Dark Navy bg, white text, Violet underline. Count badges: Confirmed = green, Pending = amber, Overdue = red-orange, Auto-Inactivated = gray.
>
> **Re-enrollment Table (full width):**
> Columns: Checkbox, Profile Avatar + Student Name, Student ID, Previous Year Level → New Year Level (shows an arrow between old and new, e.g., "2nd Year → 3rd Year" — highlighted in Violet if changed), Course, Section, Re-enrollment Status (pill badge), Confirmation Date (timestamp or "—" if not yet confirmed), Actions.
>
> Status pills:
> - Confirmed — green gradient pill, ti-check icon
> - Pending — amber pill, ti-clock icon
> - Overdue — red-orange pill, ti-alert icon (past reminder threshold, still not confirmed)
> - Auto-Inactivated — dark gray pill, ti-user-off icon (deadline passed, system auto-set to Inactive)
> - Info Updated — Cobalt Blue pill, ti-edit icon (student confirmed but updated their details — adviser should review the changes)
>
> Row hover: light violet `#F3E8FF` highlight. Sortable headers. Pagination.
>
> **Bulk Action Bar (appears when checkboxes selected):**
> Dark Navy bg bar slides up from bottom: "X students selected" white text + action buttons:
> - "Send Re-enrollment Reminder" — Golden Yellow bg, Dark Navy text, ti-bell icon
> - "Mark as Confirmed" — Green outline, white text (manual override for students who confirmed verbally)
> - "Set to Inactive" — Red-Orange outline, white text
> - "Export Selected" — gray outline
>
> **Info Updated Review Panel (slides in when adviser clicks "Info Updated" status row):**
> Shows a diff comparison of the student's previous vs. new submitted information. Changed fields highlighted: previous value in gray strikethrough on the left, new value in Dark Navy bold on the right with a Golden Yellow highlight background. Adviser actions: "Accept Changes" green button + "Reject Changes — Keep Previous" red outline button + "Flag for Manual Review" amber button.

---

## SCREEN 4 — ACTIVE STUDENTS

> The master directory of all fully verified and currently enrolled students.
>
> **Page Header:**
> Title "Active Students" with breadcrumb. Right side: "Import Students (CSV)" outline button + "+ Add Student Manually" Violet button + "Export Directory" Dark Navy button.
>
> **Summary Bar (full width, white card, single row):**
> Four inline stats separated by vertical dividers: Total Active Students (Dark Navy bold number), This Semester's New Registrations (green number + ti-trending-up icon), Average Attendance Rate (Violet number + "%"), Students with Outstanding Fines (red-orange number + ti-alert icon).
>
> **Search and Filter Bar:**
> Search input, Course dropdown, Year Level dropdown, Section dropdown, Organization filter dropdown (shows students by org membership), Payment Status filter (All / Paid / Outstanding / Partial), Sort dropdown (Name A–Z / Most Recent / Year Level).
>
> **Active Students Table (full width):**
> Columns: Checkbox, Profile Photo (circle avatar 36px) + Full Name + Student ID (stacked), Course & Year, Section, Department, Organizations (Violet membership chips, max 2 visible + "+N more" overflow chip), Payment Status (colored pill), Account Status (green "Active" pill), Last Active (timestamp), Actions (ti-eye View, ti-dots-vertical More).
>
> "More" dropdown per row: Edit Details, View Attendance History, View Payment Records, Send Notification, Suspend Account, Archive Account.
>
> **Student Profile Full Page (opened on View):**
>
> Three-column layout:
>
> **Left Column — Identity Card:**
> A Dark Navy gradient card header (120px tall): large circle avatar (80px, centered, white border), student name white bold 18px below avatar, student ID Golden Yellow below name, "Active" green pill badge.
>
> White card body below header (structured info rows with Cobalt Blue icons):
> - Email (ti-mail)
> - Contact Number (ti-phone)
> - Course & Year Level (ti-book)
> - Section (ti-users)
> - Department (ti-building)
> - Date Registered (ti-calendar)
> - Last Login (ti-clock)
> - Verification Date (ti-shield-check) — date the SAO approved their registration
> - Verification Notes (ti-notes) — adviser's notes from original verification
>
> **Organization Memberships Card (below identity):**
> List of organizations the student belongs to. Each row: org avatar circle, org name Dark Navy bold, student's role in org (Violet pill), date joined gray, active/inactive status pill. If no orgs: "Not a member of any organization" gray italic centered.
>
> **Account Status Actions Card (below memberships):**
> Three action buttons stacked:
> - "Send Notification" — Cobalt Blue outline, ti-bell icon
> - "Suspend Account" — Amber outline, ti-ban icon. Opens suspension modal.
> - "Archive Account" — Red-Orange outline, ti-archive icon. Opens archive modal with consequence warning.
>
> **Center Column — Academic Activity:**
>
> Attendance Summary Card:
> Circular progress ring (Cobalt Blue fill, gray track, percentage center in Dark Navy bold 20px): overall attendance rate. Below ring: three mini stats in a row — Events Registered, Events Attended, Events Absent. Color coded: attended = green, absent = red.
>
> Event History Table:
> Compact table — Event Name, Organization, Date, Check-In, Check-Out, Status pill. Sortable. "Show All" Violet text link if more than 5 rows.
>
> Semester History Selector:
> A small pill tab row above the attendance ring: "Current Semester / Previous Semester / All Time" — selecting a period updates all activity data in the center column.
>
> **Right Column — Financial Summary:**
>
> Payment Status Card:
> A status header row: "Payment Status" Dark Navy bold + large status pill (Paid = green gradient, Outstanding = red-orange gradient, Partial = amber gradient). Total Dues Billed in gray, Total Paid in green bold, Outstanding Balance in red-orange bold (large, prominent).
>
> Payment History Table:
> Compact table — Due Item, Organization, Amount, Due Date, Paid Date, Status pill. Sortable.
>
> Fines & Penalties Card (below payment history):
> List of fines: fine type, amount in red-orange bold, issue date, due date, status (Unpaid = red pill, Paid = green pill, Disputed = amber pill). Total outstanding fines in red-orange bold at bottom. "Issue New Fine" Violet text button.

---

## SCREEN 5 — INACTIVE & SUSPENDED

> **Page Header:**
> Title "Inactive & Suspended Accounts" with breadcrumb. Right side: "Bulk Reactivate" green outline button + "Export List" Dark Navy button.
>
> **Two Sub-tabs:**
> "Inactive (X)" and "Suspended (X)" as tab pills. Inactive tab: gray pill. Suspended tab: red-orange pill. Both show counts.
>
> **Inactive Tab Content:**
> Context card (light gray bg): "These students did not confirm re-enrollment before the semester deadline. Their accounts are preserved but they cannot log in. They can be reactivated manually or will reactivate automatically when they confirm re-enrollment next semester."
>
> Table: same columns as Active Students table but with "Inactive" gray status pill and "Inactive Since" date column replacing "Last Active." Actions per row: "Send Re-enrollment Link" Cobalt Blue button + "Reactivate Manually" green outline button + "Archive" gray button.
>
> **Suspended Tab Content:**
> Context card (amber bg 15% opacity, amber border): "These accounts have been manually suspended by the SAO Adviser. Suspended students cannot log in and are notified of their suspension status and reason."
>
> Table: same columns plus "Suspension Reason" column (truncated with tooltip showing full reason) + "Suspended On" date + "Suspended By" (adviser name) + "Suspension Duration" (e.g., "14 days remaining" amber pill or "Indefinite" red pill). Actions: "View Details" + "Lift Suspension" green outline button + "Extend Suspension" amber outline button.
>
> **Suspension Detail Side Panel (480px):**
> Dark Navy header with student name and "Suspended" red-orange badge. Panel body:
> - Student identity card (photo, name, ID, course)
> - Suspension Details card: reason, date suspended, duration, suspended by, adviser notes
> - Violation History: list of all previous suspensions and violations for this student (if any)
> - Lift Suspension form: "Lift immediately" toggle + optional "Reinstatement Note" textarea (sent to student) + "Lift Suspension" green gradient button
> - Extend Suspension form: additional days (number input) + reason (textarea) + "Extend" amber button

---

## SCREEN 6 — ARCHIVED / GRADUATES

> **Page Header:**
> Title "Archived Accounts" with breadcrumb. Right side: "Archive Graduates" Violet button (ti-graduation-cap icon, opens batch archive modal) + "Export Archive" Dark Navy button.
>
> **Archive Batch Action Card (full width, shown once per academic year):**
> Dark Navy gradient card. White title: "End of Academic Year — Archive Graduates." White body: "Archive all students who have completed their program. Archived accounts are permanently deactivated but all records are preserved for institutional reporting." Golden Yellow "Select Graduates to Archive" button. "Dismiss" white text link.
>
> **Archive Table:**
> Same structure as Active Students table but with: "Archived" dark gray status pill, "Archive Date" column, "Archive Reason" column (Graduated / Transferred / Dropped / Manual). Actions: "View Record" (read-only profile) + "Restore Account" Cobalt Blue outline button (with confirmation modal explaining this will reactivate the account and require re-verification).
>
> **Archive Graduate Modal (triggered by "Archive Graduates" button):**
> A centered modal (700px wide). Title "Archive Graduating Students" Dark Navy bold. Body:
> - Graduation Batch selector (dropdown: A.Y. 2025–2026 Graduates)
> - A searchable checklist table of all final-year students: checkbox, avatar + name, student ID, course, year level. Adviser checks which students to archive.
> - "Select All 4th Year Students" Violet text button at top of list
> - Archive Reason (read-only, auto-filled: "Graduated — A.Y. 2025–2026")
> - Custom Note (optional textarea): "Added to all selected student records"
> - Impact summary at bottom: "X student accounts will be archived. All event, attendance, and financial records will be preserved."
> - "Cancel" gray button + "Archive Selected Students" Dark Navy button with ti-archive icon

---

## SCREEN 7 — SEMESTER ROLLOVER CONFIRMATION MODAL

> Triggered by the "Run Semester Rollover" button. This is the most consequential action in the entire module — it affects every student account simultaneously.
>
> **Modal structure (centered, 640px wide, faux viewport wrapper):**
> Dark Navy gradient header (80px): ti-refresh white icon (32px) + "Semester Rollover" white bold title + "A.Y. 2026–2027, 1st Semester" Golden Yellow subtitle.
>
> **White modal body:**
>
> Step 1 — Confirm New Semester (shown first):
> Two large read-only info cards side by side:
> - "Closing Semester" card (gray bg): "A.Y. 2025–2026, 2nd Semester" Dark Navy bold + dates + "500 Active Students"
> - Arrow icon (ti-arrow-right, 32px, Violet, centered between cards)
> - "Opening Semester" card (light violet bg, Violet border): "A.Y. 2026–2027, 1st Semester" Violet bold + configured dates
>
> Step 2 — What Will Happen (impact preview list):
> A Dark Navy bg card with white text. Each impact item as a row: Golden Yellow bullet dot + white description:
> - "All 500 Active student accounts will be set to Pending Re-enrollment"
> - "Students will receive a push notification and email prompting re-enrollment confirmation"
> - "Students who confirm will return to Active status automatically"
> - "Students who do not confirm within [X] days will be set to Inactive"
> - "All semester-specific data (compliance scores, attendance rates) will reset"
> - "Persistent data (attendance history, payment records, identity) will be preserved"
> - "Organization officer roles will be flagged for re-assignment review"
>
> Step 3 — Re-enrollment Deadline Configuration:
> A white card below the impact list:
> - Re-enrollment Confirmation Deadline (date picker, default: 14 days from today)
> - Reminder Schedule (checkboxes): "Send reminder at 7 days remaining", "Send reminder at 3 days remaining", "Send reminder at 1 day remaining"
> - Auto-Inactivate Students Who Don't Confirm (toggle, ON by default): "Automatically set unconfirmed accounts to Inactive after the deadline"
>
> Step 4 — Adviser Confirmation (bottom of modal body):
> Required checkbox (Violet checked state): "I confirm that the new semester settings are correct and I authorize this rollover. I understand this will affect all student accounts."
> Adviser name + current date/time auto-filled below checkbox.
>
> **Modal footer (sticky):**
> "Cancel" gray outline button (left) + "Run Semester Rollover" Dark Navy button with Golden Yellow ti-refresh icon and white text (right, disabled until checkbox is checked). A small red warning note beside the button: "This action cannot be undone."

---

## GLOBAL DESIGN NOTES

> - **Identity Verification Cards**: The side-by-side selfie vs. ID photo comparison is the most critical UI element in this entire module. It must be large enough for the adviser to make a confident identity judgment — minimum 120×120px, never smaller. Never use tiny thumbnails for verification photos.
>
> - **Status Pills**: Use consistent gradient pill styles throughout — never plain flat color pills for account statuses. Active = green gradient, Pending = amber, Rejected/Suspended = red-orange gradient, Inactive = dark gray, Pending Re-enrollment = amber, Info Updated = Cobalt Blue.
>
> - **Irreversible Actions**: Archive and Reject always require a confirmation modal with a full consequence description. Approve requires completing the verification checklist first — the checklist IS the confirmation step.
>
> - **Empty States**: Each queue screen has a meaningful empty state — centered Tabler icon (Cobalt Blue, 48px) + Dark Navy bold "All clear" message + gray description. "Pending Verification" empty state: ti-circle-check + "No pending registrations. All submissions have been reviewed."
>
> - **Notification Feedback**: Every approval, rejection, correction request, suspension, and rollover action triggers both an in-app toast (bottom-right, auto-dismiss 3s) AND an entry in the Recent Activity Feed on the module dashboard.
>
> - **Audit Trail**: Every action taken in this module is automatically logged with: adviser name, action type, affected student, timestamp, and any notes. Accessible from the Audit Logs section in System Settings.
>
> - **Bulk Actions**: All tables support checkbox selection with a bulk action bar that slides up from the bottom when items are selected. Bulk actions are limited to non-irreversible operations (send reminder, export) or require an extra confirmation step (bulk approve, bulk suspend).
>
> - Optimized for 1280px and 1440px desktop widths. 24px page padding. 20px card internal padding throughout.

---

Want me to now generate the **Student Mobile App Registration & Onboarding screens** that feed into this admin verification system?