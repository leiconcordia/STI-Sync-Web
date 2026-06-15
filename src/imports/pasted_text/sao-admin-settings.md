Here's the complete and detailed Figma prompt for the **SAO Admin Settings Module**:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **System Settings Module** for the **STI Sync SAO Admin Panel** — a dynamic, data-driven settings system where the SAO Adviser configures the entire platform behavior, academic structure, permissions, notifications, and compliance rules. This is not a simple static preferences page — it is the **central control panel** of the entire STI Sync ecosystem. Every setting configured here cascades down and affects how the Officer Dashboard, Student Mobile App, and all system modules behave in real time.
>
> The settings module should feel like a **professional enterprise SaaS admin settings panel** — think Notion, Linear, or Vercel's settings pages — but styled for an institutional academic environment. Dense with options but never cluttered. Every section is purposeful, every toggle has consequences, and every value is editable.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons.

---

## GLOBAL LAYOUT

> The Settings module uses a **two-column fixed layout** inside the existing SAO Admin Panel shell (sidebar + topbar remain visible).
>
> **Left Column — Settings Navigation Panel (280px, white bg, 0.5px right border `#E0E0E0`):**
> A sticky vertical settings menu. At the top: a search input (placeholder: "Search settings...", ti-search icon, Violet focus ring) that filters the nav items in real time as the adviser types.
>
> Below the search: grouped navigation sections. Each group has a small uppercase muted gray section label (e.g., "ACADEMIC", "SYSTEM", "INTEGRATIONS"). Each nav item: Tabler outline icon (20px, Dark Navy) + label in Dark Navy + optional badge (red count badge for items needing attention, or a green "Configured" pill for completed sections, or an amber "Review" pill for items with warnings).
>
> Active nav item: Dark Navy `#001A4D` background, white icon and text, Golden Yellow `#FFD41C` left accent bar (4px). Hover: light gray `#F5F5F5` background.
>
> Navigation groups and items:
>
> **ACCOUNT**
> - ti-user-circle — Adviser Profile
> - ti-lock — Security & Password
> - ti-activity — Login Activity
>
> **ACADEMIC**
> - ti-school — Academic Year & Semester
> - ti-calendar — Academic Calendar
> - ti-book — Course & Department Registry
>
> **ORGANIZATIONS**
> - ti-building — Organization Settings
> - ti-shield — Roles & Permissions
> - ti-users — Officer Management
>
> **EVENTS**
> - ti-calendar-event — Event Configuration
> - ti-qrcode — Attendance & QR Settings
> - ti-certificate — Certificate Settings
>
> **FINANCE**
> - ti-receipt — Liquidation Settings
> - ti-wallet — Budget & Fund Configuration
> - ti-alert-triangle — Fine & Penalty Rules
>
> **NOTIFICATIONS**
> - ti-bell — Notification Center
> - ti-mail — Email Templates
> - ti-message — In-App Message Settings
>
> **SYSTEM**
> - ti-database — Data Management
> - ti-eye — Audit & Visibility
> - ti-plug — Integrations
> - ti-adjustments — System Preferences
>
> At the bottom of the nav panel: a small "System Status" card showing: green dot "All Systems Operational" + last settings save timestamp + STI Sync version number.
>
> **Right Column — Settings Content Area (remaining width, `#F8F8F8` bg):**
> Each settings section loads here when clicked. White content cards with 0.5px `#E0E0E0` borders, 12px radius, 20px internal padding. Sections use a consistent header style: Dark Navy bold 18px title + gray subtitle + a "Save Changes" Violet button on the far right (sticky within each section card). A small "Unsaved changes" amber dot appears beside the save button when any value has been modified but not yet saved.

---

## SECTION 1 — ADVISER PROFILE

> **Profile Card (white, full width):**
>
> Top row: Large circle avatar (80px) with a "Change Photo" overlay button on hover (Dark Navy semi-transparent overlay, white ti-camera icon). To the right of the avatar: adviser full name in bold Dark Navy 20px, role title "SAO Adviser" in Violet, employee ID in gray, and a green "Active" status pill.
>
> **Editable Fields (two-column grid):**
> - Full Name (text input)
> - Employee ID (read-only, gray bg, ti-lock icon)
> - Email Address (text input, with a "Verify" Cobalt Blue text button if unverified — shows amber "Unverified" badge if email not yet confirmed)
> - Secondary Email (text input, optional, placeholder: "Backup contact email")
> - Contact Number (text input with PH flag dropdown prefix)
> - Department / Office (text input, placeholder: "e.g., Student Affairs Office")
> - Position Title (text input, placeholder: "e.g., Student Affairs Adviser")
> - Signature Name for Certificates (text input, placeholder: "Name as it appears on event certificates")
> - Signature Title for Certificates (text input, placeholder: "Title as it appears on event certificates")
>
> **Profile Visibility Settings (toggle group):**
> - Show my name on published event approvals (Violet toggle)
> - Show my name on issued certificates (Violet toggle)
> - Show my contact info to organization officers (Violet toggle)
>
> "Save Profile" Violet button, full width, bottom of card.

---

## SECTION 2 — SECURITY & PASSWORD

> **Password Management Card:**
> - Current Password (password input, ti-eye toggle)
> - New Password (password input, ti-eye toggle) with a live password strength meter below (bar filling from red → amber → green as password gets stronger, label: "Weak / Fair / Strong / Very Strong")
> - Confirm New Password (password input, shows green ti-check or red ti-x icon inline when it matches/mismatches)
> "Update Password" Cobalt Blue button.
>
> **Two-Factor Authentication Card (white, full width):**
> Header row: "Two-Factor Authentication" label + current status pill (Enabled = green / Disabled = red) + enable/disable toggle (Violet). If enabled: shows the 2FA method (Email OTP / Authenticator App) as a radio selector. A "Re-configure 2FA" text link in Violet. A QR code placeholder card for authenticator app setup.
>
> **Session Management Card:**
> - Session Timeout (number input + "minutes" label, placeholder: "30"): "Automatically log out after this many minutes of inactivity."
> - Maximum Concurrent Sessions (number input, placeholder: "1"): "Prevent login from multiple devices simultaneously."
> - "Force Logout All Sessions" red outline button with ti-logout icon: triggers a confirmation modal. Shows a count badge of currently active sessions.
>
> **Trusted Devices Card:**
> A table of devices that have accessed the admin panel: Device name/browser, IP address, location (city), last active timestamp, and a "Revoke" red text button per row. "Revoke All Devices" red outline button at the bottom.

---

## SECTION 3 — LOGIN ACTIVITY

> **Activity Log Card (full width):**
> Filter bar: Date Range picker + Status filter (All / Successful / Failed / Suspicious) + Search by IP.
>
> A table: Timestamp, Action (Login / Logout / Password Change / Settings Changed), Device & Browser, IP Address, Location, Status (Success = green pill, Failed = red pill, Suspicious = amber pill with ti-alert icon).
>
> Suspicious Activity Alert card (amber bg, Gold border): shown if any suspicious logins detected. "Review Suspicious Activity" Cobalt Blue button.
>
> "Export Login History" Dark Navy button at bottom.

---

## SECTION 4 — ACADEMIC YEAR & SEMESTER *(Dynamic Core)*

> This is one of the most consequential settings in the entire system — changing the active semester reconfigures event feeds, attendance logs, financial records, and report scopes across the entire platform.
>
> **Active Academic Period Card (full width, Dark Navy gradient header):**
> Header: "Current Academic Period" in white bold + Golden Yellow "ACTIVE" badge. Inside the header: large display of the current academic year ("A.Y. 2025–2026") and current semester ("2nd Semester") in white. A "Switch Semester" Violet button that opens a confirmation modal — this is a high-impact action.
>
> Below header (white card body):
> - Academic Year (text input, e.g., "2025–2026")
> - Active Semester (radio group): 1st Semester / 2nd Semester / Summer Term. Each option shows its date range.
> - Semester Start Date (date picker)
> - Semester End Date (date picker)
> - Academic Year Label (text input): "Label used in all reports and exports (e.g., AY2025-2026-2S)"
>
> **Impact Preview Card (amber bg, 15% opacity, Gold border):**
> ti-alert-triangle Gold icon. "Changing the active semester will affect:" followed by a bullet list:
> - All event proposals will be tagged under the new semester
> - Attendance reports will be scoped to the new semester
> - Financial liquidation deadlines will reset
> - Student engagement scores will start fresh
> - Organization compliance tracking will reset
> "Confirm Semester Switch" red button + "Cancel" gray button.
>
> **Semester History Table:**
> Past semesters as rows: Academic Year, Semester, Start Date, End Date, Total Events, Total Students, Status (Completed = green, Archived = gray). "View Report" Cobalt Blue text link per row. "Archive Semester Data" gray button per row.
>
> **Grade Period Configuration (dynamic list):**
> The adviser can define custom grade/term periods within a semester (e.g., Prelim, Midterm, Finals). Each period: name (text input), start date, end date, and a toggle "Restrict events to this period only." "+ Add Grade Period" Violet text button. Drag-and-drop reordering handles (ti-grip-vertical icon, gray).

---

## SECTION 5 — ACADEMIC CALENDAR *(Dynamic)*

> **Calendar Configuration Card:**
> A full calendar widget (month view) embedded in the settings page. Dark Navy header with month navigation arrows. Event dots on dates. Clicking a date opens an inline popover to add/edit a calendar entry.
>
> **Calendar Entry Types (color-coded):**
> - Class Days (blue dot)
> - No Class Days / Holidays (red dot)
> - Exam Periods (amber dot)
> - Event Blackout Dates (dark gray dot — no events can be scheduled on these dates)
> - Designated Event Days (Violet dot — preferred dates for campus events)
>
> Each calendar entry: entry type (dropdown), date or date range (date picker), label (text input), description (short text). A toggle: "Block event proposals on this date."
>
> **Holiday & No-Class Days Table (dynamic list):**
> Rows: Date, Holiday Name, Type (National / Local / School / Religious), Block Events (toggle). "+ Add Holiday" Violet button. "Import from CHED Calendar" Cobalt Blue outline button (imports official CHED holiday list).
>
> **Event Blackout Configuration:**
> A date range multi-picker. Dates selected as blackout are highlighted in red on the calendar widget above. Label input per blackout period (e.g., "Final Examinations Week"). Toggle: "Notify officers when they attempt to schedule events on blackout dates."

---

## SECTION 6 — COURSE & DEPARTMENT REGISTRY *(Dynamic)*

> **Department Management Table (full width):**
> Columns: Department Code (editable text input inline), Department Name (editable text input), Program (editable text input), Year Levels Offered (multi-select chips: 1st–4th), Active Students Count (read-only, auto-computed), Status (Active/Inactive toggle), Actions (ti-edit, ti-trash).
>
> Inline editing: clicking any cell activates it as an editable input. "Add Department" Violet button adds a new empty row at the bottom.
>
> **Course Registry Table:**
> Same structure: Course Code, Course Name, Department (dropdown linked to department table), Units, Year Level (dropdown), Semester Offered (dropdown), Status toggle. Inline editable. "+ Add Course" Violet button.
>
> **Year Level Configuration:**
> Dynamic list of year level labels (editable text inputs): "1st Year", "2nd Year", "3rd Year", "4th Year". Option to add custom levels (e.g., "Irregular"). Each level has a toggle "Eligible for Organization Membership."
>
> **Import / Export Controls:**
> "Import from CSV" Cobalt Blue button + "Export Registry" Dark Navy button + "Download Template" gray text link.

---

## SECTION 7 — ORGANIZATION SETTINGS *(Dynamic)*

> **Organization Types Configuration (dynamic list):**
> Each org type: type name (text input), color swatch picker (used in org cards and event banners), description (text input), max organizations of this type (number input, "0 = unlimited"), Status toggle. Drag-and-drop reorder. "+ Add Organization Type" Violet button.
>
> **Organization Compliance Requirements (dynamic checklist builder):**
> The adviser defines what compliance items ALL organizations must fulfill each semester. Each requirement row: requirement label (text input), description (textarea), required by date (date picker), applies to (dropdown: All Orgs / Specific Types), consequence of non-compliance (dropdown: Warning / Suspension / Deactivation), Status toggle. "+ Add Requirement" Violet button.
>
> **Organization Limits & Rules:**
> - Maximum Active Organizations Allowed (number input)
> - Minimum Officer Count per Organization (number input)
> - Maximum Officer Count per Organization (number input)
> - Allow Organizations to Co-host Events (toggle)
> - Require Adviser Endorsement for New Organizations (toggle)
> - Auto-Suspend Organizations with Unresolved Violations (toggle + number input: "after X days")
> - Auto-Deactivate Inactive Organizations (toggle + number input: "after X semesters of inactivity")
>
> **Organization Registration Window:**
> - Registration Opens (date-time picker): "When can new organizations register for the semester?"
> - Registration Closes (date-time picker)
> - Require Re-registration Every Semester (toggle)
> - Allow Mid-Semester Registration (toggle)

---

## SECTION 8 — ROLES & PERMISSIONS *(Dynamic)*

> **Permissions Matrix (full width, dark header table):**
> A large matrix table. Rows = permission actions. Columns = user roles (Student, Officer, Organization Head, SAO Adviser). Each cell: Violet toggle switch (ON = permitted, OFF = denied). Grouped by module:
>
> Event Management group:
> - Create Event Proposals, Edit Draft Proposals, Submit Proposals for Approval, Edit Approved Events, Cancel Approved Events, Delete Events, View All Org Events, View All Campus Events
>
> Attendance group:
> - Scan-In Students, Scan-Out Students, View Attendance Logs, Export Attendance Data, Flag Attendance Entries, Override Attendance Status, View Other Org Attendance
>
> Finance group:
> - Submit Liquidation Reports, Edit Draft Liquidations, Approve Liquidations, Return Liquidations, View Org Financial Data, View All Financial Data, Export Financial Reports
>
> Student Data group:
> - View Student Profiles, Edit Student Profiles, Suspend Student Accounts, Archive Student Accounts, View Payment Records, Manage Payment Records
>
> System group:
> - Access Settings Module, Generate Master Reports, Manage Organizations, Post Campus Announcements, View Audit Logs, Manage Academic Calendar
>
> "Save Permissions Matrix" Dark Navy button, sticky at bottom of matrix. "Reset to Default" red outline text link.
>
> **Custom Role Builder (below matrix):**
> A card where the adviser can create custom roles beyond the defaults. Each custom role: role name (text input), description (text input), base role to inherit from (dropdown: Student / Officer), and a mini permission checklist for overrides. "+ Create Custom Role" Violet button.

---

## SECTION 9 — EVENT CONFIGURATION *(Dynamic)*

> **Event Proposal Rules:**
> - Minimum Days Before Event for Submission (number input, placeholder: "7"): "Officers must submit proposals at least X days before the event date."
> - Maximum Days in Advance for Submission (number input, placeholder: "60"): "Proposals cannot be submitted more than X days before the event."
> - Maximum Active Proposals per Organization (number input, placeholder: "3"): "Organizations cannot have more than X pending proposals simultaneously."
> - Allow Proposal Resubmission After Rejection (toggle + number input: "max X resubmissions")
> - Auto-Expire Pending Proposals (toggle + number input: "after X days of no action")
> - Require Co-Adviser Endorsement for Large Events (toggle + number input: "events with more than X expected attendees")
>
> **Event Types Configuration (dynamic list):**
> Each event type: type name (text input), color swatch picker, icon selector (Tabler icon name input with preview), description (text input), requires special approval (toggle), default settings (expandable: default attendance rules, default certificate settings), Status toggle. Drag-and-drop reorder. "+ Add Event Type" Violet button.
>
> **Event Categories Configuration (dynamic list, linked to Event Types):**
> Each category: category name, parent event type (dropdown), description, Status toggle. "+ Add Category" Violet button.
>
> **Venue Registry (dynamic table):**
> Columns: Venue Name, Building, Floor/Room, Capacity (number input), Facilities (multi-select chips: Projector, AC, Stage, etc.), Status (Available / Under Maintenance / Reserved toggle), Actions. "+ Add Venue" Violet button. Each venue: clicking expands a detail row showing a photo upload zone and a schedule preview showing upcoming reservations.
>
> **Event Feed Settings:**
> - Show Events from Other Organizations to Students (toggle)
> - Show Past Events in Feed (toggle + number input: "show events from last X days")
> - Enable Event Discovery / Search for Students (toggle)
> - Show Attendance Count Publicly (toggle)
> - Show Registration Count Publicly (toggle)
> - Auto-Archive Completed Events After (number input + "days" label)
> - Auto-Cancel Events with Registration Below Minimum (toggle + number input: "X days before event")

---

## SECTION 10 — ATTENDANCE & QR SETTINGS *(Dynamic)*

> **QR Code Configuration:**
> - QR Code Type (radio): Static (same QR per student, always valid) / Dynamic (regenerates every X minutes — reveals a "Regeneration Interval" number input)
> - QR Code Display Format (radio): Full ID Card View (name + photo + QR) / QR Only / Compact (name + QR)
> - QR Code Size on Student Screen (radio): Small / Medium / Large / Full Screen
> - Enable QR Code Brightness Boost on Scan (toggle): "Automatically maximizes screen brightness when student opens scanner screen"
> - Scanner Activation Code Required (toggle): "Officers must enter a 6-digit code to activate scanner mode per event"
> - Scanner Activation Code Length (number input, shown if above toggle ON, placeholder: "6")
>
> **Attendance Status Rules (dynamic):**
> A dynamic list of attendance statuses. Each status: status name (text input), color swatch picker, icon selector, description (text input), counts as present (toggle), affects compliance score (toggle), triggers notification (toggle), Status toggle. Default statuses (non-deletable): Present, Late, Absent, Excused. "+ Add Custom Status" Violet button.
>
> **Default Attendance Thresholds:**
> - Default Late Threshold (number input + "minutes after start time")
> - Default Grace Period (number input + "minutes")
> - Default Auto-Absent Timer (number input + "minutes")
> - Allow Officers to Override These Defaults Per Event (toggle)
>
> **Proxy Detection Settings:**
> - Enable Face-to-Screen Verification Requirement (toggle, ON by default)
> - Flag Entry if Same QR Scanned Twice Within (number input + "minutes")
> - Flag Entry if QR Scanned Outside Venue (toggle — requires geo-tagging, shows an amber "Experimental Feature" badge)
> - Auto-Reject Duplicate Scans (toggle): "Automatically reject and log duplicate scan attempts"
> - Notify Officer on Flagged Entry (toggle)
> - Notify SAO on Flagged Entry (toggle)
>
> **Attendance Compliance Score Configuration:**
> - Enable Attendance Compliance Scoring (toggle)
> - Compliance Score Formula (segmented toggle): By Events Attended / By Hours Attended / By Percentage
> - Minimum Compliance Score for Good Standing (number input + "%" label)
> - Compliance Score Resets Every (dropdown): Semester / Academic Year / Never
> - Show Compliance Score to Students (toggle)
> - Show Compliance Score to Officers (toggle)

---

## SECTION 11 — CERTIFICATE SETTINGS *(Dynamic)*

> **Certificate Templates (dynamic card grid, 3 columns):**
> Each template card: certificate thumbnail preview (placeholder), template name bold, template type badge (Standard / Achievement / Completion / Participation), a "Set as Default" text link, "Edit Template" Violet button, "Duplicate" gray button, "Delete" red text link (non-deletable for system defaults — shows locked icon). "+ Create New Template" Violet outline card (dashed border, ti-plus icon centered).
>
> **Certificate Template Editor (opens in a full-width panel below grid when Edit is clicked):**
> Fields:
> - Template Name (text input)
> - Certificate Title Text (text input, e.g., "Certificate of Participation")
> - Body Text (rich text area with placeholders: {{student_name}}, {{event_name}}, {{event_date}}, {{organization_name}}, {{adviser_name}}, {{adviser_title}})
> - Signatory Name (text input, auto-filled from Adviser Profile)
> - Signatory Title (text input, auto-filled)
> - Include SAO Official Seal (toggle)
> - Include Organization Logo (toggle)
> - Background Template (dropdown with thumbnail previews)
> - Font Style (dropdown: Classic / Modern / Formal)
> - "Preview Certificate" Cobalt Blue button — opens a full-size certificate preview modal
> - "Save Template" Violet button
>
> **Certificate Issuance Rules:**
> - Auto-Issue Certificates Upon Event Completion (toggle)
> - Default Attendance Threshold for Certificate (number input + "%" label, placeholder: "80")
> - Require Feedback Form Completion for Certificate (toggle)
> - Allow Students to Download Certificates (toggle)
> - Allow Students to Share Certificates (toggle)
> - Certificate Expiry (toggle + number input + "years" label): "Certificates expire after X years"
> - Include QR Verification Code on Certificate (toggle): "Students can verify certificate authenticity by scanning the QR"

---

## SECTION 12 — LIQUIDATION SETTINGS *(Dynamic)*

> **Liquidation Workflow Rules:**
> - Liquidation Submission Deadline (number input + "days after event" label, placeholder: "14"): "Organizations must submit liquidation reports within X days of the event."
> - Late Submission Penalty (number input, ₱ currency): "Fine charged per day of late submission after deadline."
> - Maximum Liquidation Resubmissions (number input, placeholder: "3"): "Reports can be returned and revised up to X times."
> - Require Receipt Upload for All Expense Items (toggle)
> - Minimum Receipt Amount Requiring Upload (number input, ₱): "Receipts required only for expenses above this amount."
> - Allow Digital/E-receipts (toggle)
> - Auto-Suspend Organization for Unsubmitted Liquidations (toggle + number input: "after X days past deadline")
>
> **Liquidation Categories (dynamic list):**
> Each category: category name (text input), description (text input), requires receipt (toggle), has spending limit (toggle + ₱ amount input if ON), Status toggle. Default categories (non-deletable): Venue & Facilities, Food & Beverages, Equipment & Tech, Printing & Materials, Transportation, Tokens & Certificates, Contingency. "+ Add Category" Violet button.
>
> **Approval Workflow Configuration:**
> - Approval Levels (radio): Single Approval (SAO Adviser only) / Two-Level Approval (Officer Head → SAO Adviser)
> - Auto-Approve Small Liquidations (toggle + ₱ threshold input): "Automatically approve liquidations below ₱[amount] without manual review."
> - SLA: Adviser Must Review Within (number input + "days" label): "If not reviewed within X days, report auto-escalates."
> - Escalation Action (dropdown): Send Reminder / Auto-Approve / Flag for Review

---

## SECTION 13 — BUDGET & FUND CONFIGURATION *(Dynamic)*

> **Organization Budget Allocations (dynamic table):**
> One row per active organization: org name + avatar (read-only), Semester Budget Ceiling (₱ editable number input), Remaining Balance (auto-computed, read-only, green if positive, red if negative), YTD Spent (read-only), Last Updated (timestamp). "Bulk Update" Violet button opens a CSV import modal.
>
> **Budget Categories & Spending Limits (dynamic list):**
> Each category: category name (text input), default spending limit (₱ number input or "No Limit" toggle), applies to (dropdown: All Orgs / Specific Types), overspend action (dropdown: Block / Warn / Allow). "+ Add Category" Violet button.
>
> **Fund Release Rules:**
> - Require SAO Approval for Fund Releases Above (₱ number input)
> - Default Disbursement Method (dropdown): Cash / Check / Direct Transfer / Petty Cash
> - Require Liquidation of Previous Event Before New Fund Release (toggle)
> - Maximum Outstanding Unliquidated Amount per Org (₱ number input)

---

## SECTION 14 — FINE & PENALTY RULES *(Dynamic)*

> **Penalty Types Configuration (dynamic list):**
> Each penalty type: penalty name (text input), description (text input), default amount (₱ number input or "%" of dues for percentage-based), trigger (dropdown: Manual / Automatic), automatic trigger condition (conditional text input, e.g., "absent from mandatory event"), grace period (number input + "days"), escalation (toggle + escalation amount if ON), Status toggle. "+ Add Penalty Type" Violet button.
>
> Default penalty types (non-deletable, editable amounts): Unexcused Absence from Mandatory Event, Late Liquidation Submission, Unpaid Organization Dues, Late Event Registration, Proxy Attendance Violation.
>
> **Fine Collection Rules:**
> - Allow Officers to Collect Fines (toggle)
> - Require SAO Confirmation for Fine Collection (toggle)
> - Fine Payment Deadline (number input + "days after issuance")
> - Late Payment of Fine Penalty (toggle + ₱ amount: "Additional fine after deadline")
> - Auto-Suspend Student Account for Unpaid Fines Above (toggle + ₱ threshold)
> - Show Fine Balance to Students in Mobile App (toggle)
> - Allow Students to Dispute Fines (toggle + number input: "dispute window in days")

---

## SECTION 15 — NOTIFICATION CENTER *(Dynamic)*

> **Notification Channels (master toggles):**
> Three channel cards side by side:
> - In-App Notifications (toggle ON/OFF, green "Active" badge)
> - Push Notifications (toggle ON/OFF, shows "Requires mobile app" amber note if no students have app installed)
> - Email Notifications (toggle ON/OFF, shows connected email service status)
>
> **Notification Event Rules (dynamic table):**
> Each row is a notification trigger. Columns: Event/Trigger (read-only label), Recipient (dropdown: Student / Officer / SAO / All), Channel (multi-select checkboxes: In-App / Push / Email), Timing (dropdown: Immediately / X minutes before / X days before — reveals number input), Enabled (toggle).
>
> Notification triggers (grouped):
>
> Event group: Event Proposal Submitted, Event Approved, Event Rejected, Event Returned for Revision, Event Cancelled, Event Reminder (X days before), Registration Opens, Registration Closes, Event Starting Soon (X hours before)
>
> Attendance group: Check-In Successful, Flagged Entry Detected, Absent Marked, Attendance Report Generated
>
> Finance group: Liquidation Submitted, Liquidation Approved, Liquidation Returned, Liquidation Deadline Approaching, Fine Issued, Fine Payment Due, Budget Ceiling Approaching
>
> Account group: New Account Created, Account Suspended, Password Changed, Login from New Device
>
> System group: Semester Switched, New Announcement Posted, Compliance Score Updated, Report Generated
>
> **Global Notification Preferences:**
> - Quiet Hours (toggle + time range picker: "Do not send push notifications between [time] and [time]")
> - Batch Digest (toggle + frequency dropdown: Hourly / Daily / Weekly): "Combine multiple notifications into a single digest instead of individual alerts"
> - Notification Retention Period (number input + "days"): "Delete old notifications after X days"

---

## SECTION 16 — EMAIL TEMPLATES *(Dynamic)*

> **Template Library (list view):**
> Each template row: template name, trigger event, last modified timestamp, "Preview" Cobalt Blue button, "Edit" ti-edit icon, Status toggle (Active / Inactive).
>
> **Template Editor (opens below list when Edit is clicked, full width card):**
> - Template Name (text input)
> - Subject Line (text input with placeholder variable chips: {{student_name}}, {{event_name}}, {{org_name}}, {{date}}, {{amount}}, {{link}} — click to insert)
> - Email Body (rich text editor: Bold, Italic, Underline, Bullet List, Link, Insert Variable). Variable chips appear as Golden Yellow `#FFD41C` background pills with Dark Navy text inside the editor.
> - Email Footer (textarea, pre-filled with STI Sync official footer text, editable)
> - "Send Test Email" Cobalt Blue button (sends a preview to the adviser's email)
> - "Save Template" Violet button
>
> **Email Configuration:**
> - Sender Name (text input, e.g., "STI Sync — Student Affairs Office")
> - Reply-To Email (text input)
> - Email Signature (textarea)
> - Include STI Sync Logo in Emails (toggle)
> - Include Unsubscribe Link (toggle, on by default for non-critical emails)

---

## SECTION 17 — DATA MANAGEMENT *(Dynamic)*

> **Data Retention Policies:**
> Each data type has a retention rule row: data type label (read-only), retention period (number input + unit dropdown: Days / Months / Years), action after retention period (dropdown: Archive / Delete / Export then Delete), last cleanup timestamp (read-only), "Run Cleanup Now" gray button. Data types: Event Records, Attendance Logs, Financial Records, Notification History, Audit Logs, Student Activity Data, Archived Organizations.
>
> **Backup Configuration:**
> - Auto-Backup Enabled (toggle)
> - Backup Frequency (dropdown): Daily / Weekly / Monthly
> - Backup Time (time picker): "Run backup at [time] daily/weekly"
> - Last Successful Backup (read-only timestamp + file size + green "Success" pill or red "Failed" pill)
> - "Run Manual Backup Now" Cobalt Blue button with ti-database icon — shows a progress modal when clicked
> - "Download Latest Backup" Dark Navy button
>
> **Data Import & Export:**
> - "Import Students (CSV)" Violet button — opens a file upload modal with CSV format guide and column mapping interface
> - "Export All Student Data" Dark Navy button
> - "Export All Event Records" Dark Navy button
> - "Export Financial Records" Dark Navy button
> - "Export Full System Backup" red outline button (high-impact action, requires confirmation)
>
> **Data Anonymization:**
> - Auto-Anonymize Graduated Student Records After (number input + "years")
> - Anonymize Archived Organization Data (toggle)
> - "Preview Anonymization Impact" Cobalt Blue text link

---

## SECTION 18 — SYSTEM PREFERENCES *(Dynamic)*

> **Platform Identity:**
> - Institution Name (text input, e.g., "STI College Ormoc") — used in all reports, certificates, and notifications
> - Campus Name (text input, e.g., "Ormoc Campus")
> - SAO Office Name (text input, e.g., "Student Affairs Office")
> - System Name (text input, e.g., "STI Sync") — used in all UI labels and notifications
> - Official Logo Upload (image upload zone, shows current logo thumbnail)
> - Official Seal Upload (image upload zone, used on certificates and official documents)
> - Primary Accent Color (color picker, default Violet `#83358E`) — changes the platform accent color system-wide
>
> **Localization:**
> - Time Zone (dropdown, default: "Asia/Manila — Philippine Standard Time")
> - Date Format (dropdown): MM/DD/YYYY / DD/MM/YYYY / YYYY-MM-DD
> - Time Format (radio): 12-hour / 24-hour
> - Currency Symbol (text input, default: "₱")
> - Language (dropdown, default: English — with a note: "Additional languages coming soon")
>
> **Platform Behavior:**
> - Maintenance Mode (toggle, red border card): "Temporarily disable student and officer access. Only SAO Admins can log in." When ON: a prominent red banner appears at the top of the settings page: "⚠ Maintenance Mode is ACTIVE. All students and officers are locked out." A "Maintenance Message" textarea: message shown to locked-out users.
> - Registration Mode (toggle): "Allow new student accounts to register. Disable to freeze account creation."
> - Read-Only Mode (toggle): "Allow users to view data but prevent all submissions and edits."
> - Show System Announcements to All Users (toggle)
> - Enable In-App Feedback Button (toggle): "Students and officers can submit feedback directly from the app"
>
> **Performance & Limits:**
> - Max File Upload Size (number input + "MB" label, per file)
> - Allowed File Types (multi-select chip input: PDF, DOCX, JPG, PNG, XLSX, CSV)
> - Max Files per Upload Zone (number input)
> - Session Inactivity Timeout (number input + "minutes")
> - Max Login Attempts Before Lockout (number input, placeholder: "5")
> - Account Lockout Duration (number input + "minutes")

---

## GLOBAL SETTINGS DESIGN NOTES

> Apply these rules consistently across all settings sections:
>
> - **Unsaved Changes Indicator**: Every settings card shows an amber dot beside its "Save Changes" button when any value has been modified. The settings nav item also shows an amber "Unsaved" pill badge. A sticky top banner appears across the entire right panel when there are unsaved changes: "You have unsaved changes in [Section Name]. Save or discard before leaving." with "Save Now" Violet button and "Discard" gray text link.
>
> - **Dynamic List Items**: All dynamic lists (penalty types, org types, event types, etc.) support: inline editing by clicking any cell, drag-and-drop reordering via ti-grip-vertical handles (gray, appears on row hover), duplicate via ti-copy icon, delete via ti-trash icon (with confirmation modal for non-default items), and status toggle per row.
>
> - **High-Impact Settings**: Any setting that affects the entire platform (Semester Switch, Maintenance Mode, Force-Enroll, Permissions Matrix changes) must show a prominent amber or red impact preview card BEFORE the save button is clicked, describing exactly what will change. These settings require a second confirmation step: a modal with a red "Confirm [Action]" button.
>
> - **Read-Only & Auto-Computed Fields**: Always shown with a light gray `#F5F5F5` background, gray border, ti-lock icon in the right corner of the input, and gray italic text. Never confused with editable fields.
>
> - **Variable/Placeholder Chips**: In all text template editors (email, certificate, notification), placeholder variables appear as Golden Yellow `#FFD41C` background pill chips with Dark Navy text inside the editor body. A chip palette sidebar shows all available variables with descriptions — click to insert at cursor.
>
> - **Save Feedback**: After clicking "Save Changes", the button shows a loading spinner for 800ms then transforms to a green "Saved ✓" state for 2 seconds before returning to "Save Changes". A success toast notification appears in the bottom-right corner (green bg, white text, ti-check icon, auto-dismiss 3 seconds).
>
> - **Search Functionality**: The settings navigation search input at the top of the left panel filters nav items in real time AND highlights matching text within the currently visible settings content area — similar to browser Ctrl+F behavior.
>
> - **Section Anchoring**: Each settings section has a unique URL anchor (e.g., `/settings#academic-calendar`) so the adviser can bookmark or share direct links to specific settings sections.
>
> - **Mobile Responsiveness**: At widths below 1024px, the left navigation panel collapses into a horizontal scrollable pill tab row above the content area.
>
> - Optimized for 1280px and 1440px desktop widths. Left nav panel: 280px fixed. Right content area: remaining width with max-width 900px for readability, centered with auto margins.