SAO ADVISER EVENT CREATION FORM
Figma AI / Prompt-to-Design Prompt:

Design a complete SAO Adviser Direct Event Creation Form — 7-Step Wizard Modal for STI Sync. This form is used exclusively by the SAO Adviser to create and instantly publish campus events with full administrative authority. The output of this form is a live approved event record — no review queue, no waiting period. The adviser is creating institutional reality, not requesting permission.
The tone of this form should feel authoritative, comprehensive, and efficient — like a professional event management system. The adviser has full visibility and control over all fields, all organizations, all budgets, and all settings. Power-user features, bulk controls, and administrative overrides are available throughout.
Use the exact same color system as Form 1 with one key distinction: the primary header gradient uses Dark Navy #001A4D → Violet #83358E instead of pure Violet, signaling elevated institutional authority. The "SAO Admin" badge replaces the "Officer Submission" badge throughout.


MODAL SHELL

Same full-screen overlay structure as Form 1 with these differences:
Sticky Header:
Dark Navy #001A4D to Violet #83358E gradient (more authoritative, darker). Left: STI Sync white logo + white bold "Event Creation — Admin". A Dark Navy pill badge with Golden Yellow text and ti-shield icon reading "SAO Admin". Center: "Step X of 7 — [Step Name]" in Golden Yellow bold. Right: white ti-x close. Progress fill line in Golden Yellow.
Sticky Step Navigator (7 steps):
Same pill style as Form 1.
Step labels: Event Details · Schedule · Participants · Staff · Budget · Documents · Publish
Scrollable Content Area:
Two-column: Left (720px) form, Right (320px) admin preview panel. 24px padding.
Sticky Footer:
Same layout as Form 1 but right side "Next Step" button uses Dark Navy #001A4D fill instead of Violet. On Step 7: "Create & Publish Event" button uses Green gradient with a ti-rocket icon instead of ti-send.


STEP 1 — EVENT DETAILS

Left Panel — Form:
Section A — Administrative Context:

Event Reference ID (auto-generated, read-only, e.g., "EVT-ADM-2026-0018", gray bg with ti-lock)
Created By (read-only, shows adviser's avatar chip + name + "SAO Adviser" role badge)
Event Visibility Status (radio toggle, shown only on admin form):

"Published — Immediately visible to students upon creation" (green dot)
"Scheduled — Visible to students from a set date/time" (blue dot, reveals a "Publish On" date-time picker)
"Draft — Not visible to students until manually published" (gray dot)



Section B — Organization Assignment:

Hosting Organization (full dropdown showing ALL registered organizations — org avatar, name, type badge, member count, adviser name. A search input at the top of the dropdown for quick filtering.)
Co-hosting Organizations (multi-select dropdown, can add multiple orgs)
Assigned Officer-in-Charge (student search input — auto-suggests officers from the selected hosting org. Shows avatar chip + name + role on selection.)


Section C — Event Identity:
Same fields as Form 1 (Title, Subtitle, Description, Objectives tag input) but without the "Proposal Reference" framing. Labels are direct: "Event Title", "Event Tagline", etc.
Section D — Classification:
Same Type + Category dropdowns as Form 1 plus an additional admin-only field:

Priority Level (dropdown, admin-only): Standard, Priority, Mandatory Attendance. If "Mandatory Attendance" selected, a red amber card appears: "Students will be required to attend this event. Absences will be recorded in their academic profile."

Section E — Event Settings:
Same four toggles as Form 1 PLUS two additional admin-only toggles:

Mandatory Attendance — "Mark this as a compulsory institutional event" (shows only if Priority Level = Mandatory)
Lock Event After Approval — "Prevent officers from editing event details after creation"

Section F — Event Media:
Same two upload zones as Form 1 plus an additional admin-only zone:

Official SAO Endorsement Stamp / Letterhead Banner (optional upload, shown in the published event as an official badge)

Right Panel — Admin Live Preview:
Shows a simulated student mobile app event card exactly as it will appear in the student feed upon publication. Updates live. Shows: banner image, title, tagline, org avatar + name, type badge, date, venue, "Approved" green badge (vs. the officer form which shows "Pending" amber). Below preview: "Admin Controls Preview" — shows which admin action buttons (Edit, Suspend, Cancel Event) will be visible to the adviser on the published event card.


STEP 2 — SCHEDULE & VENUE

Left Panel — Form:
All fields from Form 1 Step 2 PLUS these admin-only additions:
Section A — Academic Context: Same School Year + Semester dropdowns.
Section B — Registration Window: Same date-time pickers with an additional admin-only toggle:

"Skip Registration — Walk-in Attendance Only": When ON, hides the registration window and disables digital ticket generation. Students attend by scanning their static QR code directly.

Section C — Event Schedule: Same dynamic session builder. Admin-only addition per session row:

Session Status override (dropdown per session): Active, Postponed, Cancelled. Postponed and Cancelled show a date/reason input.

Section D — Venue Assignment (not a request — a direct assignment):


Venue (same dropdown but labeled "Venue Assignment" not "Venue Request"). No amber "subject to approval" note — this is a final assignment.
Admin-only: "Override Capacity Limit" toggle — allows exceeding venue capacity with a red warning: "Overriding venue capacity. Ensure safety protocols are in place."
Admin-only: "Reserve Venue Exclusively" toggle — blocks the venue on all other event proposals for the selected dates.

Section E — Equipment Assignment (not a request — a direct allocation):
Same checkbox grid. Admin-only note: "Equipment will be allocated directly from the facilities inventory."
Section F — Adviser Scheduling Notes (admin-only):
A textarea (4 rows): "Internal scheduling notes. Visible only to SAO staff." Gray bg, ti-lock icon in corner.
Right Panel: Same schedule preview calendar and timeline but with "Assigned" labels instead of "Requested". Conflict detection shows "Conflict Override Available" option for admin instead of blocking submission.


STEP 3 — PARTICIPANTS & ATTENDANCE

Left Panel — Form:
All fields from Form 1 Step 3 PLUS these admin-only additions:
Section A — Participant Limits: Same fields. Admin-only addition:

"Override Registration Cap" toggle — allows enrollment beyond max limit with an amber warning card.

Section B — Target Audience: Same fields. Admin-only addition:

"Force-Enroll Students" toggle (admin-only, red-orange border card): "Automatically enroll all students matching the target filters without requiring registration. Students will receive a mandatory attendance notification." When toggled ON shows a confirmation card: "This will auto-enroll approximately [N] students. This action cannot be undone."

Section C — Attendance Rules: Same three number inputs and toggles. Admin-only addition:

"Attendance Weight" (number input with % suffix): "Percentage weight of this event's attendance in the student's organizational compliance score." (e.g., 5%)
"Absence Penalty" (number input, ₱ currency): "Fine amount charged per unexcused absence for mandatory events." Shown only if Priority = Mandatory.

Section D — Certificate Rules: Same as Form 1 PLUS:

Admin-only: "Auto-Issue Certificates" toggle — certificates generated and sent automatically upon event completion without manual trigger.
"Certificate Signatory" (text input): Name to appear as signatory on the certificate (e.g., "Ms. Riselle Mae B. Lucanas, SAO Adviser").

Right Panel: Same estimated reach chart. Admin-only addition: "Force-Enroll Impact Preview" card (shown when force-enroll is ON) — shows affected student count per department in a red-orange tinted bar chart with a warning note.


STEP 4 — STAFF & SCANNER ASSIGNMENT

Left Panel — Form:
Section A — Event Core Team:
Same role assignment rows. Admin-only differences:


Admin can assign themselves (SAO Adviser) as Event Supervisor — a unique role that appears at the top of the org chart above Event Head.

Section B — Scanner Assignment:
Same scanner profile cards and permission toggles. Admin-only additions:

"Grant Full Admin Scanner Access" toggle per scanner — overrides all permission toggles to full access.
"Scanner Activation Code" (read-only, auto-generated 6-digit code shown after event creation): "Officers enter this code in the mobile app to activate scanner mode for this event."

Section C — SAO Supervision Settings (admin-only section):

SAO Observer (optional, student/staff search input): "Assign an SAO observer who can monitor attendance logs in real-time without scanner permissions."
Real-Time Monitoring toggle: "Enable live attendance feed visible on the SAO admin dashboard during the event."
Incident Reporting toggle: "Allow scanners to flag incidents directly from the mobile scanner screen."

Right Panel: Same team org chart preview. Admin-only: shows "SAO Adviser" node at the very top of the hierarchy in a Dark Navy card with golden yellow text, above the Event Head node. Scanner activation code shown in a Violet bordered card with monospace font.


STEP 5 — BUDGET & FINANCE

Left Panel — Form:
Section A — Administrative Budget Context Banner (admin-only, full width):
Dark Navy bg card, Golden Yellow left border (3px), white text. ti-shield icon. Title: "Administrative Budget Authority." Body: "As SAO Adviser, you are setting the official approved budget for this event. The amounts you enter here become the binding financial ceiling for the organization. All expenditures must be liquidated against this approved budget."
Section B — Budget Overview Cards (4 gradient stat cards, 2x2 grid):
Same 4 cards as Form 1 but with different labels reflecting admin authority:

"Approved Total Budget" (not "Requested") — Violet gradient
"Organization Fund Allocation" — Green gradient
"SAO Fund Disbursement" — Blue gradient (admin sets this, not requests it)
"Sponsorship Confirmed" — Gold gradient

Section C — Approved Budget Table:
Same table structure as Form 1 PLUS admin-only columns:

Approved Amount (editable number input, separate from "Total Cost" — admin can approve a different amount than requested)
Approval Status per line item (dropdown: Approved, Reduced, Rejected, Pending)
Admin Remarks per line item (short text input, placeholder: "Reason for adjustment...")

If this form is being used to review an officer's proposal (SAO reviewing a submitted proposal and creating the final approved version), the "Total Cost" column shows the officer's requested amount in gray while the "Approved Amount" column is editable in Dark Navy — visually showing the difference.
Section D — Funding Disbursement (admin-only section):

SAO Fund Release Date (date picker): "When will SAO funds be disbursed to the organization?"
Disbursement Method (dropdown): Cash Release, Check, Direct Transfer, Petty Cash
Liquidation Deadline (date picker): "Organization must submit liquidation report by this date."
Late Liquidation Penalty (number input, ₱): "Fine for submitting liquidation after the deadline."

Right Panel: Same donut chart and budget vs. ceiling bar. Admin-only: "Disbursement Timeline" card showing SAO Fund Release Date → Event Date → Liquidation Deadline as a horizontal timeline with Golden Yellow milestone dots. A "Budget Authority Seal" placeholder card: "The SAO-approved budget seal will be automatically applied to all exported financial documents for this event."


STEP 6 — DOCUMENTS & COMPLIANCE

Left Panel — Form:
Section A — Official Event Documents (admin-only uploads):
Upload grid (2 columns). Admin uploads are labeled differently from officer uploads — these are official institutional documents:
Required (red pill):

Official Event Approval Letter — "SAO-signed approval document for institutional records"
Approved Budget Authorization — "Signed budget approval for disbursement"

Optional (gray pill):
3. Campus Permit / Facilities Authorization — "Signed permit for venue use"
4. Risk Management Plan — "Approved risk assessment for large-scale events"
5. Media Release Authorization — "Consent for event documentation and publication"
6. External Stakeholder MOUs — "Signed agreements with sponsors or partner organizations"
7. Health & Safety Clearance — "Required for events with food service or physical activities"
8. Officer's Original Proposal (read-only if admin is converting an officer proposal) — shown as a linked file pill, not an upload zone
Section B — Compliance Checklist (admin-only, full width):
A white card titled "Institutional Compliance Verification" with a Dark Navy header. A checklist of compliance items the adviser verifies before publishing:

Organization is currently active and compliant (auto-checked from org records)
Assigned officers are registered and in good standing (auto-checked)
Event does not conflict with the academic calendar (auto-checked from schedule data)
Budget is within organizational approved ceiling (auto-checked from budget data)
All required documents uploaded (auto-checked from uploads above)
No outstanding unresolved incidents from previous events by this org (pulled from records)
Each item: Green ti-check (auto-passed) or Red ti-x (failed — shows specific issue) or Amber ti-alert (advisory warning — adviser can override). Failed items show a "Override & Proceed" amber button with a remarks input.

Section C — Adviser Authorization (admin-only):
A Dark Navy bg card with Golden Yellow border. ti-shield Golden Yellow icon. Bold white title: "SAO Adviser Authorization." Body in light gray: "By proceeding to publish this event, you are certifying that all provided information is accurate, all compliance items are verified, and this event is hereby officially approved under your authority as SAO Adviser of STI College Ormoc."
Checkbox (required, Golden Yellow checked state): "I authorize this event creation."
Read-only below: Adviser name, employee ID, position title, authorization date/time.
Right Panel: "Compliance Score" circular ring (Cobalt Blue fill, gray track, percentage in Dark Navy center bold). Color coding: 100% = green, 80–99% = amber, below 80% = red-orange. Below: "Document Coverage" horizontal bar showing uploaded vs. recommended documents. Below: "Previous Events Audit" mini card showing the hosting organization's last 3 events with their compliance scores as colored dots.


STEP 7 — REVIEW & PUBLISH

Left Panel — Full Review:
Admin Event Summary Card (full width):
A prominent card with Dark Navy #001A4D to Violet #83358E gradient header. Event banner thumbnail (small, rounded), event title in white bold 22px, tagline in Golden Yellow #FFD41C, organization name in white, event type badge, "SAO APPROVED" green stamp badge with ti-shield icon in the top-right corner of the header.
White card body with structured sections, Dark Navy dividers, and "Edit" Violet text links beside each section:

Administrative: Reference ID, Created By (adviser avatar chip), Visibility Status (green "Published" or blue "Scheduled" badge), Fast-Track status
Classification: Type, Category, Priority Level badge, Mandatory badge if applicable
Schedule: School Year, Semester, all session dates/times, venue (labeled "Assigned" not "Requested"), format
Participants: Max/Min, target audience chips, attendance rules summary, force-enroll status
Staff: Event Head chip, assigned officer-in-charge, scanner officers count, SAO Observer if assigned
Budget: Approved Total in large bold Dark Navy, per-source breakdown (SAO/Org/Sponsorship), liquidation deadline
Documents: uploaded count with green checks, compliance score badge

Admin Validation Checklist (full width):
White card, Dark Navy header "Final Validation". Eight validation rows (more than officer form — reflects higher responsibility):

Event details complete (title, description, objectives, type, org)
Schedule and venue assigned (dates, sessions, venue, no unresolved conflicts)
Participant settings configured (limits, audience, attendance rules)
Staff fully assigned (Event Head, Officer-in-Charge, at least one Scanner)
Budget authorized (approved amounts set, disbursement date configured, liquidation deadline set)
Required documents uploaded and compliance verified
Adviser authorization checkbox confirmed
No critical compliance failures (or all failures overridden with remarks)

If any item is red: "Create & Publish Event" button disabled. Red banner: "Resolve all validation issues before publishing this event."
Publication Settings Card (admin-only, full width):
White card with Violet left accent. Title: "Publication Settings." Fields:

Publish to Student Feed (toggle, ON by default)
Send Push Notification to Target Students (toggle, ON by default): notification preview card shows exactly what the push notification will say
Post Announcement to Organization Dashboard (toggle, ON by default)
Notify Assigned Officers (toggle, ON by default)
Add to Academic Calendar (toggle)

Right Panel — Final Admin Summary:
Four stat cards (2x2 grid, same gradient style):

Event Duration (computed, Green gradient)
Estimated Reach (computed from audience filters, Blue gradient)
Approved Budget (formatted ₱, Violet gradient)
Compliance Score (percentage, Gold gradient if 100%, Red-Orange if below 80%)

Below: "Post-Creation Actions" card (white, Violet border) showing what will happen automatically upon clicking "Create & Publish Event":

✓ Event record created in database
✓ Event published to student feed
✓ Push notifications sent to [N] target students
✓ Officers notified of their assignments
✓ Scanner activation code generated
✓ Budget authorization recorded
✓ Liquidation deadline set for [date]
✓ Event added to SAO master calendar

Each item as a green check row in a clean list. Below: a large "Create & Publish Event" green gradient button (duplicated from footer for visibility) with ti-rocket icon, white text bold 16px.


KEY VISUAL DIFFERENCES BETWEEN THE TWO FORMS

To make it immediately clear which form the user is looking at, apply these consistent visual signals:
Officer Proposal Form signals:

Pure Violet #83358E gradient header
"Officer Submission" Golden Yellow pill badge in header
"Submit for Approval" green button with ti-send icon
"Pending Review" amber status badges throughout
Amber advisory notes on venue, equipment, and team fields ("subject to approval")
Budget fields labeled "Requested" not "Approved"
Right panel shows tips and helper content
6 steps total

SAO Admin Creation Form signals:

Dark Navy #001A4D to Violet gradient header (darker, more authoritative)
"SAO Admin" Golden Yellow pill badge with ti-shield icon in header
"Create & Publish Event" green button with ti-rocket icon
"Approved" green status badges throughout
No advisory amber notes — all fields are direct assignments
Budget fields labeled "Approved" and "Disbursement"
Right panel shows live published preview and admin controls
7 steps total (extra Documents & Compliance step with institutional authority)
Admin-only fields have a subtle Dark Navy left border accent (3px) to distinguish them from shared fields



GLOBAL DESIGN NOTES FOR BOTH FORMS

Apply consistently across both wizards:

Section headers: 4px Violet left accent bar + Dark Navy bold 16px title + gray helper subtitle
Input focus: Violet #83358E 2px focus ring
Required fields: red asterisk * beside label
Error states: Red-Orange border + red error message below
Disabled states: Light Gray bg, gray text, not-allowed cursor
Toggle switches: ON = Violet fill, white thumb. OFF = Light Gray, gray thumb
Card shadows: 0 2px 8px rgba(0,0,0,0.08)
Step transitions: 200ms fade + slide-up
Auto-save: every 60 seconds + on every step change
Completed step pills: directly clickable for navigation
Upcoming step pills: disabled with tooltip "Complete current step to proceed"
Mobile: right panel collapses below 768px, stepper condenses to active step only
Optimized for 1280px and 1440px desktop, 24px modal padding, 20px section padding