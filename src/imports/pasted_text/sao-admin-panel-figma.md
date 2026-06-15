Here's the complete and detailed Figma prompt for the **SAO Admin Panel** updated with your exact color palette and card style:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **SAO (Student Affairs Office) Admin Panel** for **STI Sync**, a campus event management, QR attendance, and organizational finance web application for STI College Ormoc. The SAO Adviser is the highest-level administrator who oversees all student organizations, approves event proposals, validates financial liquidations, manages the student registry, and generates master reports.
>
> Use the following **exact color system** extracted from the STI Sync brand palette throughout all screens:
>
> **Primary Color:** Dark Navy Blue `#001A4D` — used for sidebar background, primary buttons, headers, and key UI surfaces
>
> **Secondary Colors (Blue Gradient):**
> - Cobalt Blue `#0E4EBD` — gradient start, section headers, active states
> - Royal Blue `#1E70E8` — gradient end, hover states, progress fills
>
> **Accent Colors (Gold):**
> - Gold/Amber `#FFC107` — primary accent for highlights, badges, CTAs, live indicators
> - Light Amber `#FFD54F` — secondary accent for hover states and soft highlights
>
> **Neutral Colors:**
> - Pure White `#FFFFFF` — card backgrounds, content areas, input fields
> - Light Gray `#E0E0E0` — subtext, dividers, inactive states, borders
>
> **UI Element Colors:**
> - Progress Bar Fill `#0C3C8A` — darker blue for filled progress bars
> - Progress Bar Empty `#2C65CF` — medium blue for empty progress track
>
> **Status Badge Colors:**
> - Live Badge Background `#FFC107` at 20% opacity — for live/active event backgrounds
> - Live Badge Text `#FFC107` — amber text on dark surfaces
>
> **Semantic Status Colors (for data states):**
> - Approved / Success: Green gradient (Emerald `#22C55E` → `#16A34A`)
> - Pending / Warning: Gold/Amber `#FFC107`
> - Rejected / Danger: Red-Orange gradient (`#EF4444` → `#F97316`)
> - Live / Ongoing: Gold gradient (`#FFC107` → `#F59E0B`)
>
> **Metric Stat Cards** follow the style in the reference image — large rounded cards with **gradient backgrounds**, white icon in a semi-transparent rounded square in the top-left, a trending arrow icon top-right, bold large number in white, label in white, and a small comparison note at the bottom (e.g., "+12% vs yesterday"). Use these four gradient styles:
> - Approved/Completed items → Green gradient card
> - Pending/Warning items → Blue gradient card (Cobalt to Royal Blue)
> - Rejected/Cancelled items → Red-Orange gradient card
> - Live/Active items → Gold/Amber gradient card with "Live" pill badge top-right
>
> Apply Inter or system sans-serif font, 8px base spacing grid, 12–16px border radius on cards, and 0.5px borders on input fields. All icon buttons use Tabler outline icons in white on dark surfaces and navy on light surfaces.

---

## GLOBAL LAYOUT

> The SAO Admin Panel uses a **fixed left sidebar + top navigation bar + main content area** layout across all screens.
>
> **Left Sidebar (260px wide):**
> Background: Dark Navy `#001A4D`. At the top, display the STI Sync logo in white/gold and a small "SAO Admin" role badge pill in Gold `#FFC107` with dark navy text below it.
>
> Navigation items with white Tabler outline icons and white labels:
> - ti-layout-dashboard — Dashboard Overview
> - ti-building — Organization Management
> - ti-calendar-event — Event Approvals
> - ti-qrcode — Attendance Monitoring
> - ti-receipt — Financial Liquidations
> - ti-users — Student Registry
> - ti-chart-bar — Reports & Analytics
> - ti-bell — Announcements
> - ti-shield — Audit Logs
> - ti-settings — System Settings
>
> Active nav item uses a Gold `#FFC107` left border accent (4px), white text, and a subtle Royal Blue `#1E70E8` at 20% opacity background pill. Inactive items use Light Gray `#E0E0E0` text at 70% opacity. Red dot notification badges on Event Approvals, Financial Liquidations, and Student Registry.
>
> At the bottom of the sidebar, show a mini profile card with the adviser's white circle avatar, full name in white, "SAO Adviser" label in Light Amber `#FFD54F`, and a ti-logout white icon button.
>
> **Top Navigation Bar (full width, 56px height, white background, 0.5px bottom border in `#E0E0E0`):**
> Left side: current page title in bold Dark Navy `#001A4D` 18px. Right side: global search input with a Cobalt Blue `#0E4EBD` focus ring, a ti-bell icon with a red badge count, and the adviser's avatar with name in Dark Navy and a dropdown chevron.

---

## SCREEN 1 — DASHBOARD OVERVIEW

> **Welcome Banner (full width):**
> A horizontal gradient banner card from Cobalt Blue `#0E4EBD` to Royal Blue `#1E70E8`. White greeting headline: "Good morning, [Adviser Name]." White subtitle: "Here's a full overview of STI College Ormoc student organization activities." Gold `#FFC107` accent strip on the left border (6px). A white illustrated shield or campus icon on the right.
>
> **Top Metric Summary Row (4 large gradient stat cards, full reference style):**
>
> Each card is a large rounded rectangle (border-radius 16px) with a gradient background, white text throughout, a semi-transparent white rounded square icon container top-left, a trending arrow icon top-right, a bold 48px number in the center, a label below it, and a small comparison note at the bottom:
>
> - Card 1 — "Pending Event Approvals": Blue gradient (`#0E4EBD` → `#1E70E8`), ti-calendar-event icon, amber "Pending" pill top-right
> - Card 2 — "Pending Liquidations": Blue gradient (`#0E4EBD` → `#1E70E8`), ti-receipt icon, amber "Action Needed" pill top-right
> - Card 3 — "Active Organizations": Green gradient (`#22C55E` → `#16A34A`), ti-building icon, trending up arrow top-right
> - Card 4 — "Events This Month": Gold gradient (`#FFC107` → `#F59E0B`), ti-chart-bar icon, "Live" amber pill top-right with `#FFC107` 20% opacity background
>
> **Three-column section below metrics:**
>
> Left column (5/12) — "Pending Approvals Queue" white card:
> 0.5px border `#E0E0E0`, 12px radius. Each row: type icon in Cobalt Blue, item title in Dark Navy bold, organization name in gray, submission date, urgency dot (red = overdue, amber = due today, green = upcoming), and a small Royal Blue `#1E70E8` "Review" button. "View All" gold text link at bottom.
>
> Center column (4/12) — "Organization Activity" white card:
> Each row: organization initials avatar in Dark Navy background, org name in Dark Navy bold, active events count in gray, and a mini horizontal progress bar (fill = `#0C3C8A`, empty track = `#2C65CF` at 30% opacity).
>
> Right column (3/12) — "Quick Actions" white card:
> Vertical stack of action buttons. Primary buttons (Generate Master Report): Dark Navy `#001A4D` background, white text, Gold `#FFC107` icon. Secondary buttons: white background, `#0E4EBD` text, 0.5px Cobalt Blue border, hover fills to light blue `#E0E0E0`.
>
> **Full-width bottom — Campus Activity Chart card:**
> White card, 12px radius. A grouped bar chart: X-axis = days of the week, Y-axis = event/attendance count. Bar colors: Cobalt Blue `#0E4EBD` for events held, Gold `#FFC107` for total scans. Toggle row above: "This Week / This Month / This Semester" as pill tabs — active tab in Dark Navy with white text, inactive in Light Gray.

---

## SCREEN 2 — ORGANIZATION MANAGEMENT

> **Page Header:**
> "Organization Management" in bold Dark Navy. Breadcrumb in gray. "+ Create Organization" button: Dark Navy background, Gold `#FFC107` icon, white text.
>
> **Organization Cards Grid (3-column):**
> Each card is white with 0.5px `#E0E0E0` border and 12px radius. Top: a gradient banner strip (Cobalt → Royal Blue for Academic orgs, Green gradient for Civic, Gold gradient for Cultural). Organization avatar circle in Dark Navy with white initials. Name in bold Dark Navy. Type badge pill in Light Amber `#FFD54F` with Dark Navy text. Member and event counts in gray. Status pill: Active = Green gradient pill, Inactive = gray, Suspended = red-orange gradient. Bottom actions: "View Details" in Cobalt Blue text, ti-edit in Royal Blue, ti-ban in amber, ti-archive in gray.
>
> **Organization Detail Page:**
>
> Left column — Profile Card:
> Dark Navy `#001A4D` card header banner with white org name and gold badge. White card body below with all org details. Compliance ring: Cobalt Blue fill, light gray track, percentage in Dark Navy bold center.
>
> Assigned Officers Card:
> White card. Each officer row: Dark Navy avatar circle, name in Dark Navy bold, role in gray, status pill. "+ Assign Officer" button in Cobalt Blue outline.
>
> Permissions Matrix Card:
> White card. Checkboxes styled with Cobalt Blue checked state. "Save Permissions" Dark Navy button.
>
> Right column — Activity Feed:
> White card. Each activity item: Gold `#FFC107` left border accent, activity icon in Cobalt Blue, description in Dark Navy, timestamp in gray.
>
> **Create Organization Form:**
> White full-page form with section dividers in `#E0E0E0`. Section headers in Dark Navy bold with a Gold `#FFC107` left accent line (3px). All inputs have `#E0E0E0` borders and Royal Blue `#1E70E8` focus rings. File upload dropzone: dashed `#2C65CF` border, Cobalt Blue ti-upload icon. Sticky bottom bar: white background, 0.5px top border. "Cancel" = Light Gray button. "Save Organization" = Dark Navy `#001A4D` background, white text, Gold icon.

---

## SCREEN 3 — EVENT APPROVALS

> **Status Pipeline Tabs:**
> Active tab: Dark Navy `#001A4D` background, white text, Gold `#FFC107` bottom underline (3px). Inactive tabs: white background, gray text. Count badges: Gold `#FFC107` background, Dark Navy text.
>
> **Event Approval Cards:**
> White cards with 0.5px `#E0E0E0` border. Left: Cobalt Blue event type dot, Dark Navy event name bold, gray org name. Center: gray meta info with Cobalt Blue icons. Right: status pills using gradient style — Approved = green gradient pill, Pending = gold pill, Rejected = red-orange pill. Action buttons: "Approve" = Green gradient button. "Reject" = Red-Orange gradient button. Both with white text and 12px radius.
>
> **Event Review Side Panel (480px):**
> White panel, Dark Navy header bar with white title and gold close button. Event details in structured rows with Cobalt Blue icons. Decision buttons: full-width "Approve Proposal" in Green gradient, full-width "Reject / Return" in Red-Orange gradient. Remarks textarea with Royal Blue focus ring. Approval timeline stepper: completed steps = Cobalt Blue filled circles, current step = Gold `#FFC107` pulsing circle, upcoming = Light Gray circles.
>
> **Rejection Modal:**
> White centered card, Dark Navy header, gold accent border (2px top). Dropdown and textarea with Royal Blue focus rings. "Confirm Decision" = Red-Orange gradient button. "Cancel" = Light Gray outline button.

---

## SCREEN 4 — ATTENDANCE MONITORING

> **Summary Metric Cards (5 cards, gradient style):**
> - Total Registered: Blue gradient (`#0E4EBD` → `#1E70E8`)
> - Checked In: Green gradient (`#22C55E` → `#16A34A`), trending up arrow
> - Checked Out: Dark Navy gradient (`#001A4D` → `#0C3C8A`)
> - Absent: Red-Orange gradient (`#EF4444` → `#F97316`)
> - Flagged: Gold gradient (`#FFC107` → `#F59E0B`), "Review" pill top-right
>
> All cards follow the full reference style: large number in white 48px, white label, semi-transparent icon box, comparison note at bottom.
>
> **Attendance Overview Chart Card:**
> White card. Grouped bars: Cobalt Blue `#0E4EBD` = Checked In, Red-Orange = Absent, Gold `#FFC107` = Flagged. Chart axis labels in gray. Toggle tabs in Dark Navy active / gray inactive pill style.
>
> **Attendance Table:**
> White card. Column headers in Dark Navy bold with gray sort arrows. Row hover: Royal Blue `#1E70E8` at 8% opacity highlight. Status pills: Checked In = green gradient mini pill, Absent = red-orange mini pill, Flagged = gold mini pill. Bulk action bar: Dark Navy background, white text, Gold icon buttons.
>
> **Flagged Entries Card:**
> Gold `#FFC107` at 15% opacity background, 2px Gold left border, Dark Navy text. "Resolve" button: Cobalt Blue background, white text.
>
> **Detail Side Panel:**
> White panel, Dark Navy header. Attendance rate ring: Cobalt Blue fill, `#2C65CF` empty track. Progress bar: fill `#0C3C8A`, track `#2C65CF`. "Export" button: Dark Navy background, Gold icon, white text.

---

## SCREEN 5 — FINANCIAL LIQUIDATIONS

> **Status Pipeline Tabs:**
> Same style as Event Approvals — Dark Navy active with Gold underline, count badges in Gold.
>
> **Liquidation Report Cards:**
> White cards with 0.5px border. Left section: Dark Navy org avatar, Dark Navy report title bold, gray event name. Amount in large bold Dark Navy, Gold `#FFC107` currency symbol. Mini pipeline stepper at bottom: completed nodes = Cobalt Blue, current = Gold pulsing, upcoming = Light Gray. Action buttons: "Approve" = Green gradient. "Return" = Red-Orange gradient.
>
> **Liquidation Review Full Page:**
>
> Left column:
> Report Header Card: Dark Navy gradient header banner with white text. White card body with structured detail rows, Cobalt Blue icons. Surplus amount in Green. Deficit in Red-Orange.
>
> Expense Ledger Table: White card, Dark Navy column headers. Total row: Dark Navy background, white text. Row hover in Royal Blue 8% opacity. Inline comment icon: Gold `#FFC107`.
>
> Receipt Gallery: White card. Each thumbnail has a Dark Navy label bar at bottom, Gold reference tag, Cobalt Blue "Link to Item" dropdown.
>
> Right column:
> Decision Card: White card. "Approve Liquidation" = full-width Green gradient button. "Return for Revision" = full-width Red-Orange gradient button. Remarks textarea with Royal Blue focus ring.
>
> Approval Timeline: completed = Cobalt Blue, active = Gold pulsing dot, upcoming = Light Gray.
>
> Financial Donut Chart: segments in Cobalt Blue, Royal Blue, Gold, Light Amber, and Light Gray. Dark Navy total amount in center.
>
> **Return Modal:**
> White card, Dark Navy header with 2px Gold top accent. Red-Orange "Return Report" gradient button. Light Gray "Cancel" button.

---

## SCREEN 6 — STUDENT REGISTRY

> **Registry Table:**
> White card. Dark Navy column headers bold. Row hover: Royal Blue 8% opacity. Organization membership pills: Cobalt Blue `#0E4EBD` background with white text. Payment Status: Paid = Green gradient mini pill, Outstanding = Red-Orange mini pill, Partial = Gold mini pill. Account Status: Active = green dot, Suspended = red-orange dot, Inactive = gray dot.
>
> **Student Profile Page:**
>
> Left column — Profile Card:
> Dark Navy `#001A4D` gradient top banner with white avatar, name, and student ID. White card body below. Organization membership rows with Cobalt Blue org initials avatars. "Edit Profile" = Cobalt Blue button. "Suspend" = Amber Gold outline button. "Archive" = Light Gray button.
>
> Center column:
> Attendance ring: Cobalt Blue fill. Event history table with Royal Blue hover. Progress bars in `#0C3C8A` fill, `#2C65CF` track.
>
> Right column:
> Outstanding balance in bold Red-Orange. Payment history rows: Paid = green check, Pending = gold clock, Overdue = red-orange alert. Fines card with Gold left border accent.
>
> **Add Student Modal:**
> White card, Dark Navy header bar. Royal Blue focus rings on all inputs. "Save Student" = Dark Navy background, Gold icon, white text button.

---

## SCREEN 7 — REPORTS & ANALYTICS

> **Report Type Selector Cards (4 cards):**
> Default: white card, 0.5px `#E0E0E0` border, Cobalt Blue icon, Dark Navy label. Selected: Dark Navy background card, white icon and label, Gold `#FFC107` bottom border accent (3px), Gold icon.
>
> **Analytics Charts:**
> Line chart lines: Cobalt Blue `#0E4EBD` for primary data, Gold `#FFC107` for secondary. Chart gridlines: Light Gray `#E0E0E0`. Axis labels: gray.
>
> Bar chart bars: Cobalt Blue for registered/allocated, Gold `#FFC107` for attended/spent, Red-Orange for absent/variance.
>
> Donut chart segments follow org-specific colors using the blue gradient family + gold + green.
>
> Summary metric cards above charts: use the full gradient card style (green, blue, gold, red-orange) matching their semantic meaning.
>
> Compliance scorecard rings: Green gradient 80%+, Gold `#FFC107` 50–79%, Red-Orange below 50%.
>
> **Generate Report Panel:**
> White slide-over panel, Dark Navy header. Report type selector pills: active = Dark Navy background, white text. Format toggle (PDF/CSV/Excel): active = Cobalt Blue background, white text. "Download Report" = Green gradient button. "Send to Email" = Cobalt Blue outline button.

---

## SCREEN 8 — ANNOUNCEMENTS

> **Announcement Feed Cards:**
> White cards with 0.5px `#E0E0E0` border. "SAO Official" avatar in Dark Navy with Gold `#FFC107` badge ring. Audience scope badges: Campus-Wide = Dark Navy background, white text. Organization = Cobalt Blue. Department = Royal Blue. Priority badges: Normal = Light Gray. Important = Gold `#FFC107`. Urgent = Red-Orange gradient. Pinned cards have a Gold `#FFC107` top border (2px) and "Pinned" amber badge.
>
> **Create Announcement Form:**
> Rich text toolbar: Dark Navy background, white icon buttons, Gold active state indicator. Priority radio buttons: Normal = gray circle, Important = Gold filled circle, Urgent = Red-Orange filled circle. "Post Announcement" = Dark Navy background, Gold icon, white text. "Save Draft" = white background, Cobalt Blue text, 0.5px Cobalt Blue border.

---

## SCREEN 9 — AUDIT LOGS

> **Audit Log Table:**
> White card. Dark Navy headers. Action type pills:
> - Event Actions = Cobalt Blue gradient pill
> - Financial Actions = Green gradient pill
> - Account Actions = Royal Blue pill
> - Login Activity = Light Gray pill
> - Report Generation = Gold pill
>
> Expandable rows: expanded background = Cobalt Blue at 5% opacity. Before/after data shown in a two-column diff view: before = Light Gray background, after = Light Amber `#FFD54F` background. Both with Dark Navy text.
>
> "Suspicious Activity" alert card: Gold `#FFC107` at 15% opacity background, 2px Gold left border, Dark Navy text, ti-alert-triangle in Gold. "Review" button in Cobalt Blue.

---

## SCREEN 10 — SYSTEM SETTINGS

> **Settings Navigation Tabs (left column):**
> Active tab: Dark Navy `#001A4D` background, white text, Gold `#FFC107` left accent (4px). Inactive: white background, gray text, hover in Light Gray.
>
> **Settings Content Panel:**
> White content area. Section headers in Dark Navy bold with a Gold `#FFC107` left accent line (3px). Input fields with `#E0E0E0` borders and Royal Blue `#1E70E8` focus ring. Toggle switches: ON state = Cobalt Blue `#0E4EBD` fill, OFF state = Light Gray. "Save Changes" button = Dark Navy background, Gold icon, white text. "Update Password" button = Green gradient. Destructive actions (Suspend, Reset) = Red-Orange gradient buttons.
>
> Academic Calendar widget: Dark Navy header bar, white calendar grid, Gold `#FFC107` highlighted selected dates, Cobalt Blue today indicator dot.
>
> Notification template editor modal: Dark Navy header, white body, placeholder variable tags styled as Gold `#FFC107` background pills with Dark Navy text (e.g., `{{student_name}}`).

---

## GLOBAL DESIGN NOTES

> Apply these rules consistently across all 10 screens:
>
> - **Primary surfaces**: White `#FFFFFF` card backgrounds throughout the main content area
> - **Sidebar**: Always Dark Navy `#001A4D` with white text and Gold `#FFC107` accents
> - **Primary action buttons**: Dark Navy background, white text, Gold icon — for create, save, and generate actions
> - **Approval buttons**: Green gradient (`#22C55E` → `#16A34A`) — always for approve and success actions
> - **Rejection/danger buttons**: Red-Orange gradient (`#EF4444` → `#F97316`) — always for reject, suspend, and destructive actions
> - **Secondary buttons**: White background, Cobalt Blue `#0E4EBD` text, 0.5px Cobalt Blue border
> - **Metric stat cards**: Always use the large gradient card style from the reference image — gradient fill, white icon in semi-transparent box, white number and label, comparison note at bottom
> - **Progress bars**: Fill color `#0C3C8A`, empty track `#2C65CF` at 30% opacity
> - **Focus rings**: Royal Blue `#1E70E8` on all interactive inputs
> - **Dividers and borders**: Light Gray `#E0E0E0` at 0.5px throughout
> - **Body text**: Dark Navy `#001A4D` for primary, `#E0E0E0` / gray for secondary and muted
> - **Gold accents**: Reserved for live badges, highlights, pinned items, active nav indicators, and CTA icons — never used as large background fills except on the Gold gradient stat card
> - All empty states: centered Tabler icon in Cobalt Blue, muted gray helper text
> - All confirmation modals: white card, Dark Navy header, appropriate gradient action button
> - All toast notifications: Green gradient for success, Red-Orange gradient for errors, Gold for warnings — bottom-right corner, white text, auto-dismiss 3 seconds
> - All skeleton loaders: Light Gray `#E0E0E0` shimmer animation
> - Optimized for 1280px and 1440px desktop widths, 24px page padding, 20px card internal padding

---

Want me to now generate the complete prompt for the **Student Mobile App** using this same color palette?