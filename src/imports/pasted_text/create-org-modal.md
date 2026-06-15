Here's a detailed Figma Make prompt for the **Create Organization Modal** with officer assignment:

---

**Figma Make Prompt:**

Design a **Create Organization Modal** for the STI Sync SAO Admin Panel. This modal appears as a multi-step overlay when the SAO Adviser clicks the "+ Create Organization" button on the Organization Management screen.

**Modal Container:**
Centered overlay with a dark semi-transparent backdrop (`rgba(0,0,0,0.5)`). Modal card is white `#FFFFFF`, `640px` wide, `border-radius: 16px`, `24px` internal padding. A Dark Navy `#001A4D` header bar at the top with white title text "Create Organization" at `18px` font weight `600`, and a white `ti-x` close icon button on the far right.

A **step progress indicator** sits just below the header bar, centered, showing 3 steps:
- Step 1 — "Organization Details" 
- Step 2 — "Assign Officers"
- Step 3 — "Review & Confirm"

Active step: filled Gold `#FFC107` circle with Dark Navy number, bold Dark Navy label. Completed step: filled Cobalt Blue `#0E4EBD` circle with white checkmark icon, gray label. Upcoming step: Light Gray `#E0E0E0` circle with gray number, muted gray label. Steps connected by a horizontal line — completed segment in Cobalt Blue, remaining segment in Light Gray.

---

**STEP 1 — Organization Details**

Section header: Dark Navy bold `16px` with a `3px` Gold `#FFC107` left accent border. Fields use `#E0E0E0` borders, `8px` border-radius, Royal Blue `#1E70E8` focus ring, `14px` placeholder text in gray.

Fields in a two-column grid layout:
- Organization Name *(full width)* — text input
- Organization Type *(left)* — dropdown: Academic, Civic, Cultural, Religious, Sports
- Academic Department *(right)* — dropdown: BSIT, BSBA, BSHM, BSCRIM, Cross-Departmental
- Organization Acronym *(left)* — text input, e.g. "ITG"
- School Year *(right)* — dropdown: 2025–2026, 2026–2027
- Organization Description *(full width)* — textarea, 3 rows
- Organization Logo *(full width)* — file upload dropzone: dashed `2px` Cobalt Blue `#0E4EBD` border, `border-radius: 12px`, centered `ti-upload` icon in Cobalt Blue at `32px`, primary text "Click to upload or drag and drop" in Dark Navy `14px`, subtext "PNG, JPG up to 2MB" in gray `12px`

Bottom action bar (sticky, white background, `0.5px` top border `#E0E0E0`):
- Left: "Cancel" button — white background, Light Gray `#E0E0E0` border, Dark Navy text
- Right: "Next: Assign Officers →" button — Dark Navy `#001A4D` background, white text, Gold `#FFC107` right arrow icon

---

**STEP 2 — Assign Officers**

Section header: "Assign Organization Officers" in Dark Navy bold `16px` with `3px` Gold left accent.

Subtext in gray `13px`: "Assign at least one President. All other roles are optional."

**Officer Role Slots** — a vertical stack of role assignment rows. Each row is a white card with `0.5px #E0E0E0` border, `12px` radius, `16px` padding, displayed as a horizontal flex row:

Left side: a Dark Navy `#001A4D` rounded square icon container (`40x40px`, `8px` radius) with a white role icon (use `ti-crown` for President, `ti-user-star` for Vice President, `ti-writing` for Secretary, `ti-calculator` for Treasurer, `ti-audit` for Auditor, `ti-users` for P.R.O.). Beside it: role name in Dark Navy bold `14px`, "Required" pill badge in Gold `#FFC107` background with Dark Navy text `11px` for President only; other roles show "Optional" pill in Light Gray background with gray text.

Right side: a search input field (`240px` wide) with a `ti-search` icon inside on the left, placeholder "Search student by name or ID…", `#E0E0E0` border, Royal Blue focus ring. When a student is selected, replace the input with a filled student chip: Dark Navy `#001A4D` circular avatar with white initials (`32px`), student full name in Dark Navy `14px` bold, student ID in gray `12px`, and a small `ti-x` remove icon in gray on the far right. Unassigned rows show the search input. Show these 6 role rows: President, Vice President, Secretary, Treasurer, Auditor, P.R.O.

Below the role rows, an "+ Add Custom Role" ghost button — dashed `1px` Cobalt Blue `#0E4EBD` border, full width, `12px` radius, centered `ti-plus` icon in Cobalt Blue and "Add Custom Role" text in Cobalt Blue `14px`.

**Officer Credentials Sub-section** (appears after a student is assigned to any role):
A collapsible white card below the role slots, header "Set Login Credentials" in Dark Navy `14px` bold with a `ti-chevron-down` toggle icon. Inside, a two-column grid per assigned officer showing:
- Officer name + role label as a row header
- Email input (pre-filled from student record, editable) with `ti-mail` icon
- Temporary Password input with `ti-lock` icon and a `ti-eye` toggle
- A small Gold `#FFC107` info pill: "Officer will be prompted to change password on first login"

Bottom action bar:
- Left: "← Back" button — white background, Light Gray border, Dark Navy text
- Right: "Next: Review →" button — Dark Navy background, white text, Gold icon

---

**STEP 3 — Review & Confirm**

Section header: "Review Organization Details" in Dark Navy bold `16px` with `3px` Gold left accent.

A summary card — white background, `0.5px #E0E0E0` border, `12px` radius, `20px` padding. Top row: the uploaded organization logo thumbnail (`56px` circle), organization name in Dark Navy `20px` bold, type badge pill in Light Amber `#FFD54F` background, acronym in gray `14px`. Below: a two-column detail grid showing all Step 1 fields as label-value pairs. Labels in gray `12px`, values in Dark Navy `14px`.

Below that, an **Assigned Officers summary card** — same white card style. Header "Officers" in Dark Navy bold `14px`. Each officer row: Dark Navy initials avatar circle `36px`, full name in Dark Navy `14px` bold, role badge in Cobalt Blue `#0E4EBD` background with white text `11px`, student ID in gray `12px`. If a role is unassigned, show a Light Gray dashed row with "Not assigned" in muted gray.

A **confirmation checkbox row** at the bottom of the review section: Cobalt Blue checked checkbox, label text in Dark Navy `13px`: "I confirm that the information above is accurate and the assigned officers have been informed of their credentials."

Bottom action bar:
- Left: "← Back" button
- Center: a Gold `#FFC107` info note in small text: "Organization will be set to Active immediately upon creation."
- Right: "Create Organization" primary button — Dark Navy `#001A4D` background, white text `15px`, `ti-building` Gold icon on the left, `border-radius: 12px`, full emphasis sizing

---

**Global Modal Rules:**
- Apply `Inter` or system sans-serif throughout
- All inputs: `#E0E0E0` border, `8px` radius, Royal Blue `#1E70E8` focus ring
- Error state inputs: Red-Orange `#EF4444` border with a small error message in Red-Orange `12px` below
- Success validation: Cobalt Blue `#0E4EBD` checkmark icon appearing inline right of the input
- Modal is non-scrollable in the header/footer; only the body content area scrolls if content overflows
- On mobile breakpoint (`<768px`), modal goes full-screen with same step indicator at top