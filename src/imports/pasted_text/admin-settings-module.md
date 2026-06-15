Here's the complete Figma prompt for the **Enhanced Admin Settings Module**:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **Enhanced System Settings Module** for the **STI Sync SAO Admin Panel** with full CRUD operations, modal-based forms, soft deletion with archive views, and a Section Registry under Course & Department. Every list, table, and configuration item in settings now has Add, Edit, Delete, Archive, and Restore capabilities. Deletions are always soft — nothing is permanently removed without first going through an Archive state.
>
> Use the exact color system:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons. Optimized for 1440px desktop web.

---

## GLOBAL CRUD PATTERNS (Apply to ALL settings sections)

> These patterns are used consistently across every settings section that has list items. Never deviate from these patterns.
>
> **Table Row Actions (every row has these three icons, right-aligned, appear on hover):**
> - `ti-edit` Cobalt Blue icon button (32px tap target, 8px radius hover bg `#E0E0E0`) — opens Edit Modal
> - `ti-archive` Amber icon button — opens Archive Confirmation Modal (soft delete)
> - `ti-trash` Red-Orange icon button — only appears on already-archived items, opens Permanent Delete Confirmation Modal
>
> **Active vs Archived Toggle (every settings section table header):**
> A pill tab row just above every table: "Active (X)" tab + "Archived (X)" tab. Active tab = Dark Navy bg, white text. Archived tab = amber bg at 15% opacity, amber text. Switching tabs shows the archived items table with Restore and Permanent Delete options.
>
> **Add Button (every settings section):**
> Always top-right of the section card header: "+ Add [Item Name]" — Dark Navy bg, Golden Yellow text, `ti-plus` icon, 36px height, 8px radius.

---

## GLOBAL MODAL PATTERNS

> **All Add/Edit Modals share this structure:**
>
> Centered modal overlay (`rgba(0,0,0,0.5)` bg). Modal card: white, `max-width: 560px`, centered, `border-radius: 16px`, no outer scroll — only modal body scrolls if needed.
>
> **Modal Header (56px, Dark Navy gradient bg, 16px top radius):**
> Left: relevant Tabler icon in Golden Yellow (20px) + modal title white bold 16px ("Add Department" / "Edit Department" etc.). Right: white `ti-x` close button (24px, 32px tap target). For Edit modals: title changes to "Edit [Item Name]" and a small Cobalt Blue "Editing: [item name]" pill badge appears below the title.
>
> **Modal Body (white, 20px padding, scrollable if content tall):**
> Form fields stacked vertically (16px gap). Each field: Dark Navy bold 13px label above + input (44px height, `#E0E0E0` border 0.5px, 8px radius, Violet 2px focus ring) + red-orange error message below (12px, `ti-alert-circle` icon, appears on validation fail). Required fields: red asterisk `*` beside label.
>
> **Modal Footer (white, 56px, 1px top border `#E0E0E0`, sticky):**
> Left: "Cancel" button (white bg, `#E0E0E0` border, Dark Navy text, 36px height, 8px radius). Right: "Save" primary button (Dark Navy bg for add / Violet bg for edit, Golden Yellow/white text, 36px height, 8px radius, `ti-device-floppy` icon). Loading state on save: spinner + "Saving..." text.
>
> **Archive Confirmation Modal:**
> Centered, 480px wide, white, 16px radius. Header: Amber gradient bg (56px): `ti-archive` white icon + "Archive [Item Name]?" white bold 16px. Body: white, 20px padding. Amber bg 10% opacity card (12px radius, 14px padding): `ti-alert-triangle` amber icon + "Archiving this item will hide it from active use but preserve all associated data. You can restore it anytime from the Archived tab." Dark Navy 13px line-height 1.5. Below: "Item to archive:" gray 12px + item name Dark Navy bold 14px + item description gray 12px if applicable. Footer: "Cancel" gray button left + "Archive Item" Amber gradient button right (`ti-archive` icon, white text).
>
> **Restore Confirmation Modal:**
> Same structure but Green gradient header: `ti-restore` white icon + "Restore [Item Name]?" white bold 16px. Body: Green bg 10% opacity card: "Restoring this item will make it active again across the entire system." + item name. Footer: "Cancel" + "Restore Item" Green gradient button.
>
> **Permanent Delete Confirmation Modal:**
> Red-Orange gradient header: `ti-trash` white icon + "Permanently Delete?" white bold 16px. Body: Red-Orange bg 10% opacity card: "This action CANNOT be undone. All data associated with this item will be permanently removed from the system." Dark Navy 13px bold. A required text input below: "Type DELETE to confirm" (placeholder "Type DELETE", validates exact match before enabling confirm button). Footer: "Cancel" gray button + "Permanently Delete" Red-Orange gradient button (disabled until "DELETE" typed exactly).

---

## SECTION 1 — ADVISER PROFILE
> No CRUD needed — single record edit. Existing design unchanged. "Save Profile" button already covers updates.

---

## SECTION 2 — SECURITY & PASSWORD
> No CRUD needed — single record management. Existing design unchanged.

---

## SECTION 3 — LOGIN ACTIVITY
> Read-only audit data. No CRUD. Existing design unchanged.

---

## SECTION 4 — ACADEMIC YEAR & SEMESTER *(Enhanced)*

> **Active/Archived tabs above semester history table.**
>
> **Semester History Table (enhanced):**
> Each row now has the three action icons:
> - `ti-edit` — opens Edit Semester Modal
> - `ti-archive` — archives the completed semester record
> - `ti-trash` — only on archived rows, permanent delete
>
> **Add Semester Modal (560px):**
> Dark Navy header: `ti-calendar` Golden Yellow + "Add Academic Semester" white bold.
> Fields:
> - Academic Year (text input, placeholder "e.g. 2026–2027", required)
> - Semester (dropdown: 1st Semester / 2nd Semester / Summer Term, required)
> - Semester Start Date (date picker, required)
> - Semester End Date (date picker, required, must be after start)
> - Academic Year Label (text input, placeholder "e.g. AY2026-2027-1S", required). Helper: "Used in all reports and exports."
> - Status (radio: Active / Upcoming / Completed)
>
> **Edit Semester Modal:**
> Same fields, pre-filled. Header changes to "Edit Academic Semester" with Cobalt Blue "Editing" badge. Additional read-only row at bottom: "Created on [date] · Last modified [date]" gray 12px italic.
>
> **Grade Period Management (below semester table, separate sub-section):**
> Header row: "Grade Periods" Dark Navy bold 14px + Active/Archived tabs + "+ Add Grade Period" button.
>
> Grade Period Table: Name, Start Date, End Date, Restrict Events toggle, Status, Actions (edit/archive).
>
> **Add/Edit Grade Period Modal (480px):**
> Fields: Period Name (text input, placeholder "e.g. Prelim / Midterm / Finals"), Start Date (date picker), End Date (date picker, must be after start), Restrict Events to This Period (toggle), Order/Sequence (number input). Drag handle icon shown in table for reordering.

---

## SECTION 5 — ACADEMIC CALENDAR *(Enhanced)*

> **Calendar Entry Types Table (below the calendar widget):**
> Active/Archived tabs. Each entry row: Date/Range, Label, Type (colored pill), Block Events (toggle), Actions (edit/archive).
>
> **Add Calendar Entry Modal (560px):**
> Dark Navy header: `ti-calendar-event` Golden Yellow + "Add Calendar Entry" white bold.
> Fields:
> - Entry Type (dropdown with colored dot indicators: Class Day / No Class / Exam Period / Event Blackout / Designated Event Day, required)
> - Date or Date Range toggle (radio: Single Date / Date Range). Single = one date picker. Range = start + end date picker side by side.
> - Label (text input, placeholder "e.g. Christmas Holiday / Final Examinations Week", required)
> - Description (textarea, 3 rows, optional)
> - Block Event Proposals on This Date (toggle, ON by default for Blackout type)
> - Notify Officers When Scheduling Conflict (toggle)
> - Recurring (toggle — if ON: shows Recurring Type dropdown: "Every Year on Same Date" / "Every Semester")
>
> **Edit Calendar Entry Modal:** Same fields pre-filled. Shows "Last modified [date]" at bottom.
>
> **Archived Calendar Entries tab:** Shows archived entries with date, label, type, archived date, Restore + Permanent Delete buttons.

---

## SECTION 6 — COURSE & DEPARTMENT REGISTRY *(Major Enhancement)*

> This section now has THREE sub-registries: Departments, Courses, and Sections. Each has its own table with full CRUD, Active/Archived tabs, and modal-based Add/Edit.
>
> **Three sub-tabs (horizontal pill tabs, inside the section card):**
> "Departments" / "Courses" / "Sections" — active = Dark Navy bg, white text. Inactive = white bg, gray text.

---

> ### SUB-TAB A — DEPARTMENTS

> **Department Table (full width):**
> Active/Archived tabs above. Columns: Department Code, Department Name, Program, Year Levels Offered (chips), Active Students (read-only count), Status (Active toggle), Actions (edit/archive icons).
>
> **Add Department Modal (560px):**
> Dark Navy header: `ti-building` Golden Yellow + "Add Department" white bold.
> Fields:
> - Department Code (text input, placeholder "e.g. ICT", required, max 10 chars, uppercase enforced). DUPLICATE CHECK inline: shows green `ti-check` when unique, red error when taken.
> - Department Name (text input, placeholder "e.g. Information and Communications Technology", required, max 100 chars)
> - Program / Degree Offered (text input, placeholder "e.g. Bachelor of Science", optional)
> - Year Levels Offered (multi-select pill checkboxes: 1st Year / 2nd Year / 3rd Year / 4th Year — selected = Dark Navy bg, Golden Yellow text)
> - Status (toggle: Active / Inactive, ON by default)
>
> **Edit Department Modal:** Same fields pre-filled. Header: "Edit Department" + Cobalt Blue "Editing: ICT" pill. Shows read-only at bottom: "Created [date] · Active Students: X · Active Courses: X."
>
> **Archived Departments tab:** Table with: Code, Name, Archived Date, Archived By, Reason (if any), Restore button (Green gradient), Permanent Delete (Red-Orange, only if 0 associated students).

---

> ### SUB-TAB B — COURSES

> **Course Table (full width):**
> Active/Archived tabs. Columns: Course Code, Course Name, Department (dropdown pill showing dept name + color dot), Units, Year Level, Semester Offered, Status toggle, Actions.
>
> **Add Course Modal (560px):**
> Dark Navy header: `ti-book` Golden Yellow + "Add Course" white bold.
> Fields:
> - Course Code (text input, placeholder "e.g. BSIT", required, uppercase enforced). Duplicate check inline.
> - Course Name (text input, placeholder "e.g. Bachelor of Science in Information Technology", required)
> - Department (dropdown — pulls from active departments list. Each option shows dept code + dept name. Required). A "+ Add New Department" Violet text link at the bottom of the dropdown list — clicking saves the modal state and opens Add Department Modal on top.
> - Year Level (dropdown: 1st Year / 2nd Year / 3rd Year / 4th Year / All Years)
> - Semester Offered (dropdown: 1st Semester / 2nd Semester / Both / Summer)
> - Units (number input, min 1, max 30)
> - Status (toggle, ON by default)
>
> **Edit Course Modal:** Same fields pre-filled. Shows at bottom: "Associated Sections: X · Active Students: X." Warning if editing a course with active students: amber card "X students are currently enrolled in this course. Changes will reflect on their profiles."
>
> **Archived Courses tab:** Same structure as archived departments.

---

> ### SUB-TAB C — SECTIONS *(New Feature)*

> **Sections Table (full width):**
> Active/Archived tabs. Columns: Section Name, Course (Violet pill chip showing course code), Department (gray chip), Year Level, Semester, Student Count (read-only), Academic Year, Status toggle, Actions (edit/archive).
>
> **Add Section Modal (560px):**
> Dark Navy header: `ti-users` Golden Yellow + "Add Section" white bold.
> Fields:
> - Course (dropdown, required). This is a searchable dropdown showing: course code (Dark Navy bold) + course name (gray) + department name (Cobalt pill) for each option. Placeholder "Select a course first...". When a course is selected, the Department and Year Level fields auto-fill from the course data.
> - Section Name (text input, 44px height, required). Placeholder dynamically updates based on selected course: e.g., if BSIT selected → placeholder "e.g. BSIT-1A". Helper below: "Format: [COURSE CODE]-[YEAR][SECTION LETTER] (e.g. BSIT-2A)". DUPLICATE CHECK: inline green `ti-check` when unique per course+year combination, red error when taken.
> - Department (read-only, auto-filled from selected course — light gray bg, `ti-lock` icon, shows dept name)
> - Year Level (dropdown: 1st Year / 2nd Year / 3rd Year / 4th Year, required. Auto-suggested from course if applicable but editable.)
> - Semester (dropdown: 1st Semester / 2nd Semester / Both, required)
> - Academic Year (dropdown pulls from academic years in system_config, required)
> - Maximum Capacity (number input, optional, placeholder "e.g. 40", helper: "Leave blank for unlimited")
> - Status (toggle: Active / Inactive, ON by default)
>
> **Edit Section Modal:** Same fields pre-filled. Course field becomes read-only (gray bg, `ti-lock` icon) with a small note: "Course cannot be changed. Archive and create a new section to change the course." Shows at bottom: "Current Students: X · Created [date]." Warning card (amber) if changing Year Level while students are enrolled.
>
> **Archived Sections tab:** Columns: Section Name, Course, Department, Year Level, Academic Year, Archived Date, Student Count at Archive, Restore button, Permanent Delete (disabled if student count > 0 with tooltip "Cannot permanently delete sections with enrolled students").
>
> **Section Detail Side Panel (slides in from right, 360px, when clicking section name):**
> Dark Navy gradient header (56px): section name white bold 16px + course pill Golden Yellow. Panel body: structured info rows. Below: "Enrolled Students" list (student avatar + name + ID, scrollable, max 8 visible + "View All" link). Bottom: "Edit Section" Cobalt Blue button + "Archive Section" amber outline button.

---

## SECTION 7 — ORGANIZATION SETTINGS *(Enhanced)*

> ### Organization Types (dynamic list → table)

> **Organization Types Table:**
> Active/Archived tabs. Columns: Color Swatch (12px circle), Type Name, Description, Max Orgs, Associated Orgs Count (read-only), Status toggle, Actions.
>
> **Add Organization Type Modal (520px):**
> Dark Navy header: `ti-building-plus` Golden Yellow + "Add Organization Type" white bold.
> Fields:
> - Type Name (text input, required, duplicate check)
> - Description (textarea, 3 rows, optional)
> - Color (color picker: 32px swatch + hex input + 8 preset swatches: Violet, Cobalt, Green, Amber, Red, Teal, Pink, Gray)
> - Icon (Tabler icon name text input, placeholder "e.g. ti-users", with a 32px live preview of the icon beside the input updating as user types)
> - Maximum Organizations of This Type (number input, placeholder "0 = unlimited")
> - Status (toggle)
>
> **Edit Organization Type Modal:** Same fields, pre-filled. Read-only at bottom: "X organizations use this type."

---

> ### Organization Compliance Requirements (dynamic list → table)

> **Compliance Requirements Table:**
> Active/Archived tabs. Columns: Requirement Label, Description (truncated), Required By (date), Applies To, Consequence, Status toggle, Actions.
>
> **Add Compliance Requirement Modal (560px):**
> Dark Navy header: `ti-clipboard-check` Golden Yellow + "Add Compliance Requirement" white bold.
> Fields:
> - Requirement Label (text input, required, duplicate check)
> - Description (textarea, 3 rows, what organizations need to submit)
> - Required By Date (date picker, must be future date)
> - Applies To (dropdown: All Organizations / Specific Types → shows multi-select of org types when "Specific Types" chosen)
> - Consequence of Non-Compliance (dropdown: Warning / Suspension / Deactivation)
> - Grace Period After Deadline (number input + "days" label)
> - Status (toggle)
>
> **Edit Compliance Requirement Modal:** Same fields pre-filled. If deadline has passed: shows amber warning "Deadline has passed. Update to a future date to reactivate." + auto-status set to Inactive.

---

## SECTION 8 — ROLES & PERMISSIONS *(Enhanced)*

> **Custom Role Builder (enhanced with CRUD):**
>
> **Custom Roles Table:**
> Active/Archived tabs. Columns: Role Name, Base Role, Description, Assigned Officers Count (read-only), Status toggle, Actions.
>
> **Add Custom Role Modal (560px):**
> Dark Navy header: `ti-shield-plus` Golden Yellow + "Add Custom Role" white bold.
> Fields:
> - Role Name (text input, required, duplicate check)
> - Description (textarea, 2 rows)
> - Base Role to Inherit From (radio: Student / Officer — with description of each)
> - Permission Overrides (scrollable checklist grouped by module — same groups as the permissions matrix. Each permission: checkbox. Checked = override granted, unchecked = inherits from base role.)
> - Status (toggle)
>
> **Edit Custom Role Modal:** Same fields. Shows "X officers currently using this role." Warning if removing permissions: amber card "Removing permissions will immediately affect X officers assigned to this role."
>
> **Permissions Matrix:** No CRUD on the matrix itself — it's a configuration grid. But adding a "Reset Row to Default" `ti-refresh` gray icon beside each module group header row that resets that module's permissions back to system defaults with a confirmation modal.

---

## SECTION 9 — EVENT CONFIGURATION *(Enhanced)*

> ### Event Types (dynamic list → table)

> **Event Types Table:**
> Active/Archived tabs. Columns: Color Dot, Icon Preview, Type Name, Category Count (read-only), Requires Special Approval toggle, Status toggle, Actions.
>
> **Add Event Type Modal (560px):**
> Dark Navy header: `ti-calendar-plus` Golden Yellow + "Add Event Type" white bold.
> Fields:
> - Type Name (text input, required, duplicate check)
> - Color (color picker, same as org type)
> - Icon (Tabler icon name input + 32px live preview)
> - Description (textarea, 2 rows)
> - Requires Special Approval (toggle): "Events of this type need additional SAO sign-off"
> - Default Attendance Rules (expandable section): Late Threshold, Grace Period, Auto-Absent — pre-fills the event creation form for this type
> - Status (toggle)
>
> **Edit Event Type Modal:** Same fields pre-filled. "X events of this type exist." If archiving a type with active events: red-orange warning "X active events use this type. Archive will not affect existing events but new proposals cannot use this type."

---

> ### Event Categories (linked to Event Types)

> **Event Categories Table:**
> Active/Archived tabs. Columns: Category Name, Parent Event Type (colored pill), Description, Event Count (read-only), Status toggle, Actions.
>
> **Add Event Category Modal (520px):**
> Dark Navy header: `ti-tag` Golden Yellow + "Add Event Category" white bold.
> Fields:
> - Parent Event Type (dropdown, required — pulls from active event types. Each option shows type color dot + type name.)
> - Category Name (text input, required). Duplicate check scoped to same parent type.
> - Description (textarea, 2 rows, optional)
> - Status (toggle)
>
> **Edit Event Category Modal:** Same. Parent Event Type becomes a read-only field with a note "Change parent type by archiving and creating a new category."

---

> ### Venue Registry *(Enhanced)*

> **Venue Table:**
> Active/Archived tabs. Columns: Venue Name, Building, Floor/Room, Capacity, Facilities (chips max 3 visible + "+N more"), Status (Available/Maintenance/Reserved — dropdown pill), Actions.
>
> **Add Venue Modal (560px):**
> Dark Navy header: `ti-map-pin` Golden Yellow + "Add Venue" white bold.
> Fields:
> - Venue Name (text input, required, duplicate check)
> - Building (text input, required)
> - Floor / Room (text input, placeholder "e.g. 2nd Floor / Room 201")
> - Capacity (number input, min 1, required)
> - Facilities (multi-select chip input — type facility name + Enter to add as chip, or select from suggestions: Projector, AC, Stage, PA System, Whiteboard, Podium, Tables, Chairs, Livestream Setup, Kitchen)
> - Photo Upload (image upload zone — dropzone 80px height, shows thumbnail after upload, optional)
> - Status (dropdown: Available / Under Maintenance / Reserved — with a date picker appearing for "Under Maintenance": "Available again on [date]")
> - Notes (textarea, 2 rows, optional — e.g. "Requires advance booking 3 days prior")
>
> **Edit Venue Modal:** Same fields. Shows "X events have used this venue." If status changed to Under Maintenance while events are booked: red-orange warning card "X upcoming approved events are scheduled at this venue. Notify affected organizations?" with a "Send Notifications" toggle.
>
> **Archived Venues tab:** Shows archived venues. Permanent delete only if 0 associated event records.

---

## SECTION 10 — ATTENDANCE & QR SETTINGS *(Enhanced)*

> ### Attendance Status Rules *(Enhanced)*

> **Attendance Status Table:**
> Active/Archived tabs. Columns: Color Swatch, Status Name, Description, Counts as Present (check/x), Affects Compliance (check/x), Triggers Notification (check/x), System Default badge (non-deletable), Actions.
>
> System default statuses (Present, Late, Absent, Excused): Actions column shows only `ti-edit` — no archive button (with tooltip "System default status cannot be archived").
>
> Custom statuses: all three action icons available.
>
> **Add Attendance Status Modal (520px):**
> Dark Navy header: `ti-user-check` Golden Yellow + "Add Attendance Status" white bold.
> Fields:
> - Status Name (text input, required, duplicate check)
> - Color (color picker)
> - Icon (Tabler icon name + live preview)
> - Description (textarea, 2 rows)
> - Counts as Present (toggle)
> - Affects Compliance Score (toggle)
> - Triggers Student Notification (toggle)
> - Status (toggle: Active / Inactive)
>
> **Edit Attendance Status Modal:** Same. System defaults show all fields as read-only for Name, Color, Icon — only Description and toggle behaviors are editable. Read-only note: "System default statuses have restricted editing to maintain data integrity."

---

## SECTION 11 — CERTIFICATE SETTINGS *(Enhanced)*

> ### Certificate Templates *(Enhanced with CRUD + Archive)*

> **Template Cards Grid:** Same 3-column grid. Each card now has consistent action icons in the card bottom row: `ti-edit` / `ti-copy` / `ti-archive` / `ti-trash` (only on archived cards). A "DEFAULT" badge card has `ti-archive` disabled with tooltip "Cannot archive the default template. Set another template as default first."
>
> **Add Template → redirects to full Template Editor (Screen 3 in Certificate Module).**
>
> **Edit Template Modal (480px, lighter than full editor):**
> Dark Navy header: `ti-certificate` Golden Yellow + "Edit Template Settings" white bold. Note at top: "To modify the template image or name position, use the full editor." + "Open Full Editor" Violet text link.
> Editable fields only:
> - Template Name (text input)
> - Font Family (dropdown)
> - Font Size (number input)
> - Font Weight (segmented toggle)
> - Text Color (color picker)
> - Text Alignment (3-option toggle)
> - Set as Default Template (toggle)
>
> **Archived Templates tab:** Shows archived certificate templates. Thumbnail + name + archived date + "Restore" Green button + "Permanently Delete" Red-Orange button (disabled if template was used in any issued certificates — tooltip "Cannot delete a template used for issued certificates").

---

> ### Certificate Issuance Rules

> These are global toggles — no CRUD needed. Single-record configuration. "Save Rules" button at bottom.

---

## SECTION 12 — LIQUIDATION SETTINGS *(Enhanced)*

> ### Liquidation Categories *(Enhanced)*

> **Liquidation Categories Table:**
> Active/Archived tabs. Columns: Category Name, Description, Requires Receipt (check/x), Spending Limit (₱amount or "No Limit"), System Default badge, Status toggle, Actions.
>
> System defaults (Venue, Food, Equipment, etc.): `ti-edit` only, no archive.
>
> **Add Liquidation Category Modal (520px):**
> Dark Navy header: `ti-receipt` Golden Yellow + "Add Liquidation Category" white bold.
> Fields:
> - Category Name (text input, required, duplicate check)
> - Description (textarea, 2 rows)
> - Requires Receipt Upload (toggle)
> - Has Spending Limit (toggle — reveals ₱ amount input when ON)
> - Spending Limit Amount (₱ currency input, min 0, shown only when toggle ON)
> - Status (toggle)
>
> **Edit Liquidation Category Modal:** Same fields pre-filled. Non-system categories fully editable. Shows "Used in X liquidation reports."

---

## SECTION 13 — BUDGET & FUND CONFIGURATION *(Enhanced)*

> ### Organization Budget Allocations

> No modal needed — inline editing in the table itself (clicking a cell activates it). "Save All Changes" Violet button at top-right saves all pending inline edits at once. Individual row "Reset to Default" `ti-refresh` gray icon.

---

> ### Budget Categories & Spending Limits *(Enhanced)*

> **Budget Categories Table:**
> Active/Archived tabs. Columns: Category Name, Default Spending Limit (₱ or "No Limit"), Applies To, Overspend Action, Status toggle, Actions.
>
> **Add Budget Category Modal (520px):**
> Dark Navy header: `ti-wallet` Golden Yellow + "Add Budget Category" white bold.
> Fields:
> - Category Name (text input, required, duplicate check)
> - No Spending Limit (toggle — when ON hides the amount input, shows "Unlimited" gray text)
> - Default Spending Limit (₱ currency input, shown when toggle OFF, min 0)
> - Applies To (radio: All Organizations / Specific Organization Types → multi-select appears)
> - Overspend Action (dropdown: Block Submission / Show Warning / Allow Silently — "Allow Silently" has an amber warning note: "Not recommended — overspending will not be flagged")
> - Status (toggle)

---

## SECTION 14 — FINE & PENALTY RULES *(Enhanced)*

> ### Penalty Types *(Enhanced)*

> **Penalty Types Table:**
> Active/Archived tabs. Columns: Penalty Name, Default Amount (₱ or "% of dues"), Trigger (Manual/Auto), Grace Period, System Default badge, Status toggle, Actions.
>
> System defaults (Unexcused Absence, Late Liquidation, etc.): `ti-edit` only.
>
> **Add Penalty Type Modal (560px):**
> Dark Navy header: `ti-alert-circle` Golden Yellow + "Add Penalty Type" white bold.
> Fields:
> - Penalty Name (text input, required, duplicate check)
> - Description (textarea, 2 rows)
> - Amount Type (radio: Fixed Amount ₱ / Percentage of Dues %). Shows relevant input based on selection.
> - Default Amount (₱ currency input or % number input based on amount type)
> - Trigger (radio: Manual Only / Automatic). If Automatic: shows "Trigger Condition" text input (placeholder "e.g. Absent from mandatory event")
> - Grace Period After Trigger (number input + "days" label)
> - Escalation (toggle — reveals: "Additional amount after deadline" ₱ input + "Escalation trigger after X days" number input)
> - Status (toggle)
>
> **Edit Penalty Type Modal:** Same. System defaults have Name and Trigger fields read-only. Shows "X fines issued using this type."
>
> **Archived Penalty Types tab:** Shows archived types. Permanent delete disabled if any fines were ever issued using this type — tooltip "Cannot permanently delete penalty types with associated fine records."

---

## SECTION 15 — NOTIFICATION CENTER *(Enhanced)*

> ### Notification Event Rules *(Enhanced)*

> **Notification Rules Table:**
> Active/Archived tabs. Columns: Trigger Event (read-only), Recipient, Channel pills (In-App/Push/Email with colored dots), Timing, System Rule badge, Enabled toggle, Actions.
>
> System rules (core app notifications): `ti-edit` only — timing, recipient, channel editable but trigger cannot be changed or archived.
>
> Custom rules: all three action icons available.
>
> **Add Notification Rule Modal (560px):**
> Dark Navy header: `ti-bell-plus` Golden Yellow + "Add Notification Rule" white bold.
> Fields:
> - Trigger Event Name (text input, required — name of the custom trigger condition)
> - Trigger Description (textarea, 2 rows — what causes this notification)
> - Recipient (dropdown: Student / Officer / SAO Admin / All)
> - Channels (3 toggle rows, each with label + description + toggle):
>   - In-App Notification (Violet toggle)
>   - Push Notification (Cobalt toggle)
>   - Email Notification (Dark Navy toggle)
> - Timing (dropdown: Immediately / X minutes before / X days before → shows number input when time-based selected)
> - Enabled (toggle, ON by default)
>
> **Edit Notification Rule Modal:** Same. System rules show Trigger Event as read-only with lock icon. Non-system rules fully editable.

---

## SECTION 16 — EMAIL TEMPLATES *(Enhanced)*

> **Email Templates Table:**
> Active/Archived tabs. Columns: Template Name, Trigger Event, Last Modified, Status toggle, Actions.
>
> **Add Email Template → opens full Template Editor** (already designed in existing settings). "New Template" button opens the editor.
>
> **Edit Email Template → opens full Template Editor** pre-filled with existing content.
>
> **Archive Email Template:** Archive Confirmation Modal. Warning if template is linked to active notification rules: amber card "This template is used by X active notification rules. Archiving will disable those notifications." with a list of affected rules.
>
> **Archived Email Templates tab:** Restore + Permanent Delete. Permanent delete disabled if template was used to send emails in the last 90 days.

---

## SECTION 17 — DATA MANAGEMENT
> No CRUD modals needed — action-based operations. Existing design with confirmation modals for destructive actions. Unchanged.

---

## SECTION 18 — SYSTEM PREFERENCES *(Enhanced)*

> ### Platform Identity Fields
> All editable inline — no modal. "Save Identity" button at bottom.

---

## GLOBAL ARCHIVE SECTION (Master Archive View)

> **New settings nav item added at the very bottom of the settings navigation:**
> `ti-archive` — Archive Center
>
> **Archive Center Page (`/admin/settings/archive`):**
> Title "Archive Center" in Dark Navy bold 22px. Subtitle "View and manage all archived items across your system settings." gray 14px. "This is a read-only audit trail of all soft-deleted settings items." gray italic 12px.
>
> **Archive Type Filter (horizontal pill tabs, scrollable):**
> All / Departments / Courses / Sections / Event Types / Event Categories / Venues / Org Types / Compliance Requirements / Certificate Templates / Liquidation Categories / Penalty Types / Notification Rules / Email Templates / Attendance Statuses / Budget Categories / Semesters / Calendar Entries
>
> **Master Archive Table (full width, white card):**
> Columns: Item Type (colored pill: each settings category has a distinct color), Item Name (Dark Navy bold), Description (gray truncated), Archived Date, Archived By (adviser avatar chip + name), Archive Reason (shown if provided), Associated Records Count (read-only — how many other records reference this item), Actions.
>
> Actions per row:
> - "Restore" Green gradient button (44px, 8px radius) — opens Restore Confirmation Modal
> - "Delete Permanently" Red-Orange outline button (44px) — opens Permanent Delete Confirmation Modal. Disabled with tooltip if item has associated active records.
>
> **Search and Filter Bar:**
> Search input (placeholder "Search archived items...") + Item Type filter + Date Range picker + Archived By filter + Sort (Newest First / Oldest First / Item Name A–Z).
>
> **Archive Statistics Card (full width, above the table):**
> Four mini stat cards in a row (white bg, 0.5px border, 12px radius, 14px padding):
> - "Total Archived Items" Dark Navy number, `ti-archive` gray icon
> - "Restorable Items" green number (items with 0 blocking dependencies), `ti-restore` green icon
> - "Pending Permanent Deletion" amber number (items archived > 90 days), `ti-clock` amber icon
> - "Cannot Delete" red-orange number (items with active dependencies), `ti-lock` red-orange icon
>
> **Auto-Purge Configuration Card (below statistics, white, Violet left border 3px):**
> "Auto-Purge Settings" Dark Navy bold 14px. Two settings:
> - Auto-Permanently Delete After (number input + "days after archiving" label, default 365). Helper: "Items archived longer than this will be flagged for permanent deletion review."
> - Send Weekly Archive Report to Adviser Email (toggle). "Receive a summary of archived items and pending deletions."
> "Save Auto-Purge Settings" Violet button (36px, right-aligned).

---

## GLOBAL DESIGN NOTES FOR THIS ENHANCED SETTINGS MODULE

> - **Soft deletion is mandatory for every settings item.** Nothing in settings is ever hard-deleted on first action. Always Archive → then Permanent Delete as a two-step process.
>
> - **System default items** (marked with a "System Default" badge — Dark Navy bg, Golden Yellow text, `ti-lock` icon, 11px): can be edited but NEVER archived or deleted. Archive and delete icons are hidden or disabled with tooltips for these items. The edit modal for system defaults shows read-only fields for critical identifiers (Name, Code, Trigger) and only allows editing of descriptive or behavioral fields.
>
> - **Dependency blocking for permanent delete:** Before enabling the "Permanently Delete" button, the system checks for associated active records. If any exist, the button is disabled with a tooltip listing the dependencies (e.g., "Cannot delete — 3 active courses use this department"). The dependency count is always shown in the table's "Associated Records" column.
>
> - **Modal z-index stacking:** When a modal triggers another modal (e.g., clicking "+ Add New Department" from inside the Add Course modal), the new modal opens on top with a darker overlay behind it. A breadcrumb inside the second modal shows "Adding Department (from: Add Course)" so the user knows their context.
>
> - **Active/Archived tab persistence:** The selected tab (Active or Archived) persists when navigating between settings sub-sections within the same session. Switching to a main settings nav item resets to Active tab.
>
> - **Archive reason (optional):** All archive confirmation modals include an optional "Reason for archiving" textarea at the bottom of the modal body. This reason is stored and shown in the Archive Center table. Helps with institutional audit trail.
>
> - **Table empty states:** Active tab empty = centered `ti-inbox` Cobalt Blue (48px) + "[Item Type] list is empty" Dark Navy bold + "+ Add [Item]" Violet button. Archived tab empty = centered `ti-archive` gray (48px) + "No archived [item type] items." gray italic.
>
> - **Unsaved changes protection:** If the adviser has unsaved inline edits in a table and tries to navigate away, a "Unsaved Changes" confirmation modal appears: "You have unsaved changes in [Section]. Leave without saving?" + "Leave" gray button + "Save and Stay" Violet button.
>
> - **Audit log entries:** Every Add, Edit, Archive, Restore, and Permanent Delete action in settings is automatically logged in the Audit Logs with: adviser name, action type, item type, item name, previous value (for edits), and timestamp.
>
> - Optimized for 1440px desktop. Modal max-widths: 480px (simple), 560px (standard), 700px (complex). All modals centered with overlay. Modal body max-height: 70vh with internal scroll. 24px page padding. 20px card padding throughout.