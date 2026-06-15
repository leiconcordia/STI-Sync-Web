**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Web Dashboard for the Student Organization Officer Role** for **STI Sync**, a campus event management, QR attendance, and organizational finance web application for STI College Ormoc. The officer is a student leader who manages event proposals, monitors attendance, handles financial liquidations, and oversees their organization's activities.
>
> Use a clean, professional, institutional design language throughout all screens. White (#FFFFFF) backgrounds, STI-inspired purple (#7F77DD) as the primary accent, light purple (#EEEDFE) for active states and highlights, green (#639922) for success states, amber (#BA7517) for warnings, red (#E24B4A) for errors and alerts, and gray (#888780) for secondary and muted elements. Apply Inter or system sans-serif font, 8px base spacing grid, 8–12px border radius on cards and inputs, and 0.5px borders on all UI elements. All icon buttons use Tabler outline icons.

---

## GLOBAL LAYOUT

> The dashboard uses a **fixed left sidebar + top navigation bar + main content area** layout.
>
> **Left Sidebar (240px wide, white background, 0.5px right border):**
> At the top, show the STI Sync logo (purple wordmark) and below it a small organization context switcher pill showing the current org name (e.g., "STI IT Guild") with a chevron-down icon for switching between organizations the officer belongs to.
>
> Navigation items with Tabler outline icons:
> - ti-layout-dashboard — Dashboard (Overview)
> - ti-calendar-event — Event Management
> - ti-qrcode — Attendance Logs
> - ti-receipt — Financial Liquidation
> - ti-users — Member Directory
> - ti-bell — Announcements
> - ti-settings — Settings
>
> Active nav item uses a light purple (#EEEDFE) background pill with purple (#7F77DD) text and icon. Inactive items use gray (#888780) text. A small notification badge (red dot) appears on Announcements and Financial Liquidation if there are pending items.
>
> At the bottom of the sidebar, show a mini profile card with the officer's circle avatar, full name, role label ("Organization Officer"), and a ti-logout icon button.
>
> **Top Navigation Bar (full width, 56px height, white, 0.5px bottom border):**
> Left side shows the current page title in bold (e.g., "Dashboard"). Right side shows: a search input (placeholder: "Search students, events..."), a ti-bell notification icon with a red badge count, and the officer's avatar with their name and a dropdown chevron.

---

## SCREEN 1 — DASHBOARD OVERVIEW

> The main landing page after login. Layout uses a 12-column grid.
>
> **Welcome Banner (full width):**
> A soft light purple (#EEEDFE) banner card with a greeting: "Good morning, [Officer Name] 👋" as the headline, and a subtitle: "Here's what's happening with STI IT Guild today." On the right side of the banner, show a small illustrated calendar icon or event graphic placeholder.
>
> **Metric Summary Row (4 stat cards in a horizontal row):**
> Each card has a muted 13px label on top and a bold 24px number below. Cards:
> - "Upcoming Events" — number in purple, ti-calendar icon
> - "Pending Liquidations" — number in amber, ti-receipt icon
> - "Total Members" — number in gray, ti-users icon
> - "Events This Month" — number in blue, ti-chart-bar icon
>
> **Two-column section below metrics:**
>
> Left column (7/12 width) — "Upcoming Events" card:
> A list of 3 upcoming events, each row showing: event color dot, event name, date and time, venue, and a status pill (Approved = green, Pending = amber, Draft = gray). A "View All Events" text link at the bottom right.
>
> Right column (5/12 width) — "Pending Tasks" card:
> A checklist-style card showing action items the officer needs to complete, such as: "Submit liquidation for Acquaintance Party", "Upload receipts for Team Building", "Review attendance report — JS Night". Each item has a ti-circle icon, task label, due date in red if overdue, and a purple "Act" button.
>
> **Full-width bottom section — Recent Attendance Activity:**
> A condensed table showing the last 5 attendance scan logs across all events: student name, event name, scan type (Check-In / Check-Out pill), timestamp, and verified status (green checkmark or amber flag). A "View Full Logs" button on the top right of the card.

---

## SCREEN 2 — EVENT MANAGEMENT

> **Page Header:**
> Page title "Event Management" with a breadcrumb "Dashboard > Event Management". On the right, a primary purple button "+ Create Event Proposal".
>
> **Filter and Search Bar:**
> A horizontal bar with: Search input (placeholder: "Search events..."), Status filter tabs (All / Draft / Pending Approval / Approved / Completed / Rejected), and a Date Range picker. A "Sort by" dropdown (Newest / Oldest / Upcoming) on the right.
>
> **Event Cards Grid (3-column responsive grid):**
> Each event is a raised card with:
> - Top: a color-coded event category banner strip (purple for org events, teal for academic, coral for cultural)
> - Event name in bold 16px
> - Date, time, and venue row with ti-calendar and ti-map-pin icons
> - Hosting organization pill badge
> - Expected attendance count with ti-users icon
> - Status pill badge (Draft = gray, Pending = amber, Approved = green, Rejected = red)
> - Bottom action row: "View Details" text link, "Edit" icon button (ti-edit), "Delete" icon button (ti-trash) — disabled if Approved
>
> **Create / Edit Event Proposal — Full Page Form (shown as a separate screen or slide-over panel):**
>
> A multi-section form card:
>
> Section 1 — Event Information:
> - Event Name (text input)
> - Event Type (dropdown: Academic, Civic, Cultural, Sports, General Assembly)
> - Description (textarea, 4 rows)
> - Hosting Organization (auto-filled, read-only pill showing current org)
>
> Section 2 — Schedule and Venue:
> - Event Date (date picker)
> - Start Time and End Time (time pickers, side by side)
> - Multi-session toggle: "This event has multiple sessions" — if toggled on, show a "+ Add Session" button that adds session rows (Session name, date, start time, end time)
> - Venue (text input)
> - Expected Number of Attendees (number input)
>
> Section 3 — Targeted Audience:
> - Department filter (multi-select checkboxes: BSIT, BSCS, BSA, All Departments)
> - Year Level filter (multi-select: 1st Year, 2nd Year, 3rd Year, 4th Year, All)
>
> Section 4 — Attachments:
> - Upload Event Program / Brief (file upload dropzone with ti-upload icon, label "Drag and drop or click to upload PDF/DOCX")
> - Upload Supporting Documents (secondary file upload zone)
>
> Bottom action bar (sticky):
> "Save as Draft" secondary button, "Submit for Approval" primary purple button, and a small status note: "Submitted proposals are reviewed by the SAO Adviser."
>
> **Event Detail View (full page, opened when clicking View Details):**
> A two-column layout. Left column shows all event details in a structured read-only card format with section dividers. Right column shows an Approval Timeline stepper: Submitted → Under Review → Approved / Rejected, with timestamps and adviser notes. If rejected, show a red "Reason for Return" card with the adviser's written note and a "Revise and Resubmit" purple button.

---

## SCREEN 3 — ATTENDANCE LOGS

> **Page Header:**
> Title "Attendance Logs" with breadcrumb. A purple "Export CSV" button and a "Generate Report" button on the right.
>
> **Event Selector Bar:**
> A horizontal scrollable row of event pill tabs (e.g., "IT Guild GenAss", "JS Night", "Sportsfest") that filter the table below. Active tab uses purple background; inactive uses light gray. Below the pill tabs, if the event is multi-session, show a secondary row of session tabs (Session 1 — Morning, Session 2 — Afternoon).
>
> **Summary Metric Cards (4 cards):**
> Total Registered, Checked In (green), Checked Out (gray), Absent (red) — same style as Dashboard stat cards.
>
> **Attendance Table:**
> Columns: Checkbox, Profile Avatar + Student Name, Student ID, Course & Year, Check-In Time, Check-Out Time, Duration, Status pill (Checked In = green, Checked Out = gray, Absent = red, Flagged = amber).
> Table features: row hover highlight in light purple (#EEEDFE), sortable column headers with up/down arrow icons, pagination at the bottom (showing "Showing 1–20 of 85 students"), and a bulk action bar that appears when checkboxes are selected ("Mark as Absent", "Export Selected").
>
> **Flagged Entries Section:**
> A collapsible amber-bordered card below the table labeled "⚠ Flagged Entries (3)". When expanded, shows a sub-table with: student name, flag reason (e.g., "Face-to-screen mismatch noted by officer"), flagged by (officer name), timestamp, and a "Resolve" button that opens a notes modal.
>
> **Scan Activity Feed (right sidebar panel, 280px):**
> A real-time-style vertical feed of the latest scans for the selected event. Each feed item shows: circle avatar, student name, scan type pill (Check-In / Check-Out), and timestamp (e.g., "2 minutes ago"). A "Live" green dot indicator at the top of the panel. Newest entry at the top.

---

## SCREEN 4 — FINANCIAL LIQUIDATION

> **Page Header:**
> Title "Financial Liquidation" with breadcrumb. A purple "+ New Liquidation Report" button on the right.
>
> **Status Pipeline Tabs:**
> Horizontal tab row: All / Draft / Pending Review / Approved / Returned. Each tab shows a count badge. Active tab is underlined in purple.
>
> **Liquidation Report Cards (list view):**
> Each report is a horizontal card with:
> - Left: event name in bold, submission date, total reported amount in large text
> - Middle: a mini pipeline stepper showing current stage (Draft → Submitted → Under Review → Approved / Returned)
> - Right: status pill badge and action buttons ("View", "Edit" — disabled if submitted, "Delete" — only for drafts)
> If status is "Returned", show a small red note preview: "Returned: Missing receipt for item 3."
>
> **Create / Edit Liquidation Report — Full Page Form:**
>
> A structured multi-section form:
>
> Section 1 — Report Header:
> - Linked Event (dropdown of officer's approved events)
> - Report Title (auto-filled: "[Event Name] — Liquidation Report", editable)
> - Reporting Period (date range picker)
> - Total Budget Allocated (number input, read-only if pulled from event proposal)
>
> Section 2 — Itemized Expense Ledger:
> A dynamic table where each row is an expense entry:
> Columns: Item Description, Category (dropdown: Supplies, Food & Beverage, Logistics, Venue, Printing, Others), Quantity, Unit Cost, Total Cost (auto-computed), Receipt Reference (text input).
> Below the table, an "+ Add Expense Item" text button in purple. At the bottom of the table, show a summary row: Total Expenses, Budget Allocated, and Surplus / Deficit (green if surplus, red if deficit).
>
> Section 3 — Receipt Uploads:
> A grid of upload zones (2 columns). Each upload zone is a dashed-border card with a ti-upload icon, label "Upload Receipt Photo", and a small note "JPG, PNG, PDF — max 5MB". Once uploaded, the zone shows a thumbnail preview, file name, and a ti-x remove button. Each upload zone links to a specific expense row via a "Link to Item #" dropdown.
>
> Section 4 — Officer Declaration:
> A light gray card with the text: "I certify that all expenses listed above are accurate, supported by the attached receipts, and are in accordance with the organization's approved budget." Below it, a checkbox: "I confirm this declaration" (required to enable submit). Show the submitting officer's name and date auto-filled below.
>
> Bottom action bar (sticky):
> "Save Draft" secondary button, "Submit to SAO Adviser" primary purple button (disabled until declaration is checked).
>
> **Liquidation Detail View:**
> Full-page read-only view of a submitted or approved report. Left column: all report details in structured sections with dividers. Right column: Approval Timeline stepper (Draft → Submitted → Under Review → Approved / Returned) with timestamps and adviser action notes. If Returned, show a prominent red "Return Note" card with the adviser's correction comments and a "Revise Report" purple button that reopens the edit form.

---

## SCREEN 5 — MEMBER DIRECTORY

> **Page Header:**
> Title "Member Directory" with breadcrumb. Buttons on the right: "Import Members (CSV)" and "+ Add Member" in purple.
>
> **Search and Filter Bar:**
> Search input, Department filter dropdown, Year Level dropdown, Status filter (Active / Inactive / Suspended), and a Sort dropdown.
>
> **Member Grid (3-column card grid):**
> Each member card shows: circle avatar with initials, full name in bold, Student ID, Course & Year, role label (e.g., "Officer", "Member"), status pill (Active = green, Inactive = gray, Suspended = red), and a bottom row with: "View Profile" text link and a ti-dots-vertical more options button (Edit Role, Remove from Org, Send Notice).
>
> **Member Profile Side Panel (slides in from the right when View Profile is clicked):**
> A 360px panel showing: large avatar, full name, student ID, email, course and year, department, contact number, organization role, date joined, payment status (Dues Paid = green, Outstanding = red), and a mini attendance summary (events attended / total events as a progress bar in purple). At the bottom: "Send Notification" button and "Edit Member" button.

---

## SCREEN 6 — ANNOUNCEMENTS

> **Page Header:**
> Title "Announcements" with breadcrumb. A "+ Post Announcement" purple button on the right.
>
> **Announcement Feed (full-width list):**
> Each announcement is a card with: organization avatar, officer name and role as author, post timestamp, announcement title in bold, body text (truncated to 3 lines with "Read more" link), an attached event pill tag if linked to an event, and a reaction/read count (ti-eye icon + number). Action buttons: Edit (ti-edit), Delete (ti-trash), Pin to Top (ti-pin).
> Pinned announcements appear at the top with a small amber "Pinned" badge.
>
> **Create Announcement Modal:**
> A centered modal overlay (600px wide, faux viewport wrapper). Fields: Title (text input), Body (rich text area with basic formatting toolbar: Bold, Italic, Bullet List, Link), Link to Event (optional dropdown), Target Audience (All Members / Specific Department / Specific Year Level — multi-select), Notification Type (In-App Only / Push Notification). Action buttons: "Cancel" and "Post Announcement" in purple.

---

## SCREEN 7 — SETTINGS

> **Page Header:**
> Title "Settings" with breadcrumb.
>
> **Two-column layout:**
>
> Left column — Settings Navigation (vertical tab list):
> - Account Profile
> - Security & Password
> - Notification Preferences
> - Organization Profile (if officer has edit permission)
>
> Right column — Settings Content Panel:
>
> Account Profile section:
> Large circle avatar with an "Upload Photo" overlay button on hover. Fields: Full Name, Student ID (read-only), Email Address, Course & Year (read-only), Contact Number. A "Save Changes" purple button at the bottom.
>
> Security & Password section:
> Fields: Current Password, New Password, Confirm New Password (all password inputs with ti-eye toggle). A "Update Password" button. Below it, a "Login Activity" read-only log showing last 3 login timestamps and device info.
>
> Notification Preferences section:
> A list of toggle switches for: Event Announcements, Liquidation Status Updates, Attendance Reminders, Due Payment Alerts, SAO Adviser Messages. Each toggle row has a label, description in muted gray, and a purple toggle switch.

---

## GLOBAL DESIGN NOTES

> Maintain pixel-perfect consistency across all screens:
> - Same sidebar, topbar, card styles, and spacing across all pages
> - All empty states use a centered illustration placeholder + muted gray helper text (e.g., "No events yet. Create your first event proposal.")
> - All destructive actions (Delete, Remove) use a confirmation modal before executing
> - All form submissions show an inline loading state on the button ("Submitting...") followed by a success toast notification in the bottom-right corner (green background, white text, ti-check icon, auto-dismiss after 3 seconds)
> - All tables have a skeleton loader state (gray shimmer rows) for loading
> - Responsive breakpoints: optimized for 1280px and 1440px desktop widths
> - Use 24px page padding on the main content area and 20px card internal padding throughout
