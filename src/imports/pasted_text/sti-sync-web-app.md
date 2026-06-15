You're right, my apologies. Here's the corrected complete polished **web** Figma prompt:

---

**Figma AI / Prompt-to-Design Prompt:**

> Design a complete **STI Sync Web Application** — a campus event management, QR attendance, and organizational finance platform for STI College Ormoc. This prompt covers the full authentication flow and Officer Dashboard experience for the **web browser version**. The app serves three user roles: Students, Organization Officers, and the SAO Adviser (who manages the Student Affairs Services — SAS).
>
> Use the exact color system throughout all screens:
> **Primary Dark Navy** `#001A4D` · **Violet** `#83358E` · **Golden Yellow** `#FFD41C` · **Cobalt** `#0E4EBD` · **Royal Blue** `#1E70E8` · **Success Green** `#22C55E` · **Warning Amber** `#FFC107` · **Danger Red-Orange** `#EF4444` · **Surface White** `#FFFFFF` · **Border Gray** `#E0E0E0` · **Subtext Gray** `#9E9E9E`
>
> All screens are **desktop web layouts optimized for 1440px width** (also works at 1280px). Apply Inter font throughout. Use an 8px base spacing grid, 12–16px border radius on cards, 8px on inputs and buttons. All icons use Tabler outline icons. This is a full-browser web application — not mobile, not a phone frame. Design each screen as a full browser viewport.

---

## SCREEN 1 — WELCOME / LANDING SCREEN

> **Full browser viewport layout (1440px wide, minimum 900px tall).**
>
> **Left Panel (50% width, full height):**
> Dark Navy `#001A4D` background. A large soft Violet `#83358E` radial glow at 15% opacity centered behind the logo. A secondary Golden Yellow `#FFD41C` glow at 8% opacity slightly offset. These create depth without distraction.
>
> Content centered vertically inside the left panel:
>
> **Logo Block (centered):**
> - STI Sync geometric logo mark (shield + QR grid abstract shape) in Golden Yellow `#FFD41C`, 80px × 80px
> - "STI Sync" wordmark in white bold 40px, 16px below mark, letter-spacing -0.5px
> - A thin Golden Yellow horizontal line (48px wide, 2px height) centered, 12px below wordmark
> - "Student Affairs Services" in Golden Yellow `#FFD41C` 15px light, centered, 8px below line
> - "STI College Ormoc" in white 12px at 60% opacity, centered, 6px below
>
> **Welcome Copy (centered, 48px below logo block):**
> - "Connect, Participate," in white bold 32px, centered, line-height 1.2
> - "and Stay Updated." in Golden Yellow `#FFD41C` bold 32px, centered (second line — color shift creates emphasis)
> - "Your complete campus management platform for events, attendance, and organizational finance." in white 15px at 70% opacity, centered, max-width 360px, 12px below headline, line-height 1.6
>
> **Bottom of left panel:**
> "STI Sync · v1.0.0 · STI College Ormoc" in white 11px at 40% opacity, centered, 32px from bottom.
>
> ---
>
> **Right Panel (50% width, full height):**
> White `#FFFFFF` background. Content centered vertically with 64px horizontal padding.
>
> **Panel Header:**
> "Welcome Back" in Dark Navy bold 28px. "Select your portal to continue." in Subtext Gray 14px, 6px below.
> A thin `#E0E0E0` horizontal divider line, 24px below the subtitle.
>
> **Three Portal Cards (stacked vertically, 16px gap between each):**
> Each portal is a large interactive card (full width of right panel content area, 88px height, white bg, 0.5px `#E0E0E0` border, 16px radius). On hover: border color changes to the portal's accent color (2px), background shifts to the portal's light tint, and a subtle right-pointing arrow animates 4px to the right.
>
> **Card 1 — Student Portal:**
> Left side: a 56px × 56px rounded square icon container (Violet `#83358E` at 10% opacity bg, 12px radius) with ti-user Violet icon (24px) centered. To the right of the icon: "Student Login" in Dark Navy bold 16px + "Access your events, digital ID, and finance dashboard" in Subtext Gray 13px below. Far right: ti-chevron-right Violet icon (20px). On hover: full card bg tints to Violet at 5% opacity, border becomes Violet 2px.
>
> **Card 2 — Officer Portal:**
> Same card structure. Icon container: Cobalt Blue `#0E4EBD` at 10% opacity bg, ti-shield Cobalt Blue icon. "Officer Login" Dark Navy bold + "Manage events, attendance, and financial liquidations" gray. ti-chevron-right Cobalt Blue. On hover: Cobalt Blue tint and border.
>
> **Card 3 — SAS Admin Portal:**
> Same card structure but visually de-emphasized (slightly smaller, 72px height). Icon container: Golden Yellow `#FFD41C` at 12% opacity bg, ti-lock Golden Yellow icon. "SAS Admin Login" Dark Navy bold 15px + "SAO Adviser access — Student Affairs Services administration" gray 12px. ti-chevron-right Golden Yellow. On hover: Golden Yellow tint and border.
>
> **Below cards:**
> A light gray `#F5F5F5` info card (full width, 12px radius, 16px padding): ti-info-circle Cobalt Blue icon left + "New student? Download the STI Sync mobile app to register your account." gray 13px. "Learn More" Cobalt Blue text link right-aligned.
>
> **Right panel footer:**
> "© 2026 STI College Ormoc · Student Affairs Services" in gray 11px, centered, 24px from bottom.

---

## SCREEN 2 — SAS ADMIN LOGIN

> **Full browser viewport. Two-column layout — same left/right split as Screen 1.**
>
> **Left Panel:** Identical to Screen 1 left panel. Same Dark Navy background, same logo block, same welcome copy, same glow effects. This creates visual continuity — the branding never changes, only the right panel content changes.
>
> **Right Panel (white, 64px horizontal padding, content centered vertically):**
>
> **Back Navigation (top-left of right panel, 32px from top):**
> ti-arrow-left Dark Navy icon (20px) + "Back to Welcome" Dark Navy 14px text. On hover: Violet color. This is a text link, not a button — lightweight and unobtrusive.
>
> **Login Form Header:**
> A Golden Yellow `#FFD41C` left accent bar (4px wide, 32px tall, rounded) beside the title block:
> - "SAS Admin Login" Dark Navy bold 28px
> - "Student Affairs Services — SAO Adviser Portal" Subtext Gray 14px, 4px below title
> - "Authorized personnel only." in Violet 13px italic, 2px below subtitle
>
> A thin `#E0E0E0` divider line 20px below the header block.
>
> **Form Fields (full width of right panel content, 24px gap between fields):**
>
> Email Address field:
> Label "Email Address" Dark Navy bold 13px above input. Input (52px height, white bg, `#E0E0E0` border 0.5px, 8px radius, Violet 2px focus ring): ti-mail icon (18px, gray) inside left of input, 14px left padding from icon. Placeholder "adviser@sti.edu.ph" in gray. On focus: border becomes Violet 2px, label color shifts to Violet.
>
> Password field:
> Label "Password" Dark Navy bold 13px. Input (same style): ti-lock icon left, ti-eye toggle icon right (clicking reveals/hides password). Placeholder "Enter your password."
>
> **Forgot Password link:**
> Right-aligned below password field. "Forgot Password?" in Violet 13px. On hover: underline.
>
> **Login Button (full width, 52px height, 8px radius, 8px below forgot password link):**
> Dark Navy `#001A4D` background, Golden Yellow `#FFD41C` text bold 15px, ti-login Golden Yellow icon left (18px). On hover: background lightens to `#0C3C8A`. On click: button shows loading state — text replaced by a white spinning ti-loader-2 icon (20px) + "Signing in..." white 14px.
>
> **Error State (shown below login button when credentials fail):**
> Red-Orange `#EF4444` at 8% opacity card, 1px red-orange border, 8px radius, 12px padding: ti-alert-circle red-orange icon (18px) left + "Invalid email or password. Please try again." red-orange 13px.
>
> **Divider below button:**
> A thin `#E0E0E0` line with "PORTAL ACCESS ONLY" gray 11px centered text overlapping the line (like an `<hr>` with text). 24px margin above and below.
>
> **Security Notice Card (full width, light gray `#F8F8F8` bg, `#E0E0E0` border, 8px radius, 14px padding):**
> ti-shield-check Cobalt Blue icon (18px) left + "This portal is restricted to authorized SAO Advisers of STI College Ormoc. Unauthorized access attempts are logged." gray 12px line-height 1.5.
>
> **Right panel footer:** Same as Screen 1 right panel footer.

---

## SCREEN 3 — OFFICER LOGIN

> **Full browser viewport. Same two-column split layout.**
>
> **Left Panel:** Identical to Screens 1 and 2. Consistent branding.
>
> **Right Panel (white, 64px horizontal padding, content centered vertically):**
>
> **Back Navigation:** Same style as Screen 2 — ti-arrow-left + "Back to Welcome" text link top-left.
>
> **Login Form Header:**
> A Cobalt Blue `#0E4EBD` left accent bar (4px wide, 32px tall) beside the title block:
> - "Officer Login" Dark Navy bold 28px
> - "Student Organization Officer Portal" Subtext Gray 14px
> - "Sign in with your STI Sync officer credentials." gray 13px italic
>
> Thin `#E0E0E0` divider 20px below.
>
> **Form Fields:**
>
> Username / Student ID field:
> Label "Username or Student ID" Dark Navy bold 13px. Input (52px height, same styling as Screen 2): ti-id-badge icon left, placeholder "Enter your username or student ID."
>
> Password field:
> Label "Password." Input with ti-lock icon left + ti-eye toggle right. Placeholder "Enter your password."
>
> **Forgot Password link:** Same style as Screen 2, right-aligned.
>
> **Login Button (full width, 52px height, 8px radius):**
> Cobalt Blue `#0E4EBD` to Royal Blue `#1E70E8` left-to-right gradient background. White bold text 15px. ti-login white icon left. On hover: gradient darkens slightly. On click: loading state with spinning icon + "Signing in..." white text.
>
> **Error State:** Same red-orange card style as Screen 2 with appropriate error message.
>
> **Officer Registration Note (full width, light violet `#F3E8FF` bg, Violet border 1px, 8px radius, 14px padding):**
> ti-info-circle Violet icon + "Don't have an officer account? Contact your SAO Adviser to get your credentials." Violet 13px. "Officer accounts are created and managed by the SAO Adviser directly."  gray 12px below.
>
> **Right panel footer:** Same consistent footer.

---

## SCREEN 4 — SAS ADMIN DASHBOARD

After clicking Admin login button redirect to 
/home or the dashboard were making rn.
---

## SCREEN 5 — OFFICER DASHBOARD

> **Full browser viewport. Same fixed sidebar + topbar + content area layout as Screen 4 but for the Officer role.**
>
> **Left Sidebar (240px, white bg, 0.5px right border `#E0E0E0`):**
> Top: STI Sync Violet logo mark (28px) + "STI Sync" Dark Navy wordmark 15px bold. Below: organization context switcher pill — current org name (e.g., "STI IT Guild") + ti-chevron-down (for officers in multiple orgs).
>
> Navigation items (Dark Navy text + Tabler icons, 44px height each):
> - ti-layout-dashboard — Dashboard
> - ti-calendar-event — Event Management
> - ti-qrcode — Attendance Logs
> - ti-receipt — Financial Liquidation (red badge if returned/pending)
> - ti-users — Member Directory
> - ti-bell — Announcements (red badge if unread)
> - ti-settings — Settings
>
> Active item: light violet `#F3E8FF` bg pill, Violet `#83358E` text and icon, Violet 3px left accent bar. Inactive: gray text and icon. Hover: `#F5F5F5` bg.
>
> Bottom: officer profile card — circle avatar (36px), officer full name Dark Navy bold 13px, "Organization Officer" Violet 11px, ti-logout gray icon button right.
>
> **Top Navigation Bar (full width minus sidebar, 56px, white, 0.5px bottom border):**
> Left: "Dashboard" Dark Navy bold 18px + "Dashboard / Overview" gray 12px breadcrumb. Right: search input + ti-bell with red badge + officer avatar + name + chevron.
>
> **Main Content Area (`#F8F8F8` bg, 24px padding):**
>
> **Welcome Banner (full width, Violet `#83358E` at 12% opacity bg, Violet 2px left border, 16px radius, 20px padding):**
> Left: "Good morning, [Officer Name]." Dark Navy bold 20px + "Here's what's happening with STI IT Guild today." gray 14px. Right: a small Violet calendar illustration placeholder (48px).
>
> **Four Metric Stat Cards (horizontal row, equal width, 16px gap):**
> Each card: white bg, 0.5px `#E0E0E0` border, 16px radius, 20px padding. Top row: muted gray 12px label + Tabler icon (20px, color-coded) right-aligned. Bottom: bold 28px number (color-coded) + small gray 12px comparison note below.
> - "Upcoming Events" — Violet number, ti-calendar-event Violet icon, "X this semester" note
> - "Pending Liquidations" — Amber number, ti-receipt amber icon, "requires attention" note
> - "Total Members" — Dark Navy number, ti-users gray icon, "in your organization" note
> - "Events This Month" — Cobalt Blue number, ti-chart-bar Cobalt icon, "X completed" note
>
> **Three-column section below metrics (5/12 + 4/12 + 3/12 split):**
>
> Left column (5/12) — "Upcoming Events" white card (16px radius, 0.5px border):
> Violet header bar (40px): "Upcoming Events" white bold 14px + "+ Create Proposal" Golden Yellow text link right.
> Card body: list of 3 upcoming events. Each row (56px height, `#E0E0E0` bottom border): colored event type dot left (Violet = org event, Cobalt = academic, coral = cultural) + event name Dark Navy bold 14px + date & time gray 12px below name + venue gray 12px with ti-map-pin icon + status pill right (Approved = green gradient mini pill, Pending = amber mini pill, Draft = gray mini pill). "View All Events" Cobalt Blue text link bottom-right.
>
> Center column (4/12) — "Pending Tasks" white card:
> Dark Navy header: "Action Required" white bold 14px + red count badge.
> Card body: checklist of action items. Each row (52px, `#E0E0E0` bottom border): ti-circle gray icon left (turns Violet with fill when checked) + task label Dark Navy 14px bold + due date gray 12px below (red if overdue — "Overdue · [date]" in red-orange) + small "Act" Violet button right (32px height, 8px radius, Violet outline + text). Example tasks:
> - "Submit liquidation for Acquaintance Party" — due date overdue in red
> - "Upload receipts for Team Building" — due in 2 days amber
> - "Review attendance report — JS Night" — due in 5 days gray
> - "Confirm venue for Leadership Summit" — due in 7 days gray
>
> Right column (3/12) — "Quick Actions" white card:
> Dark Navy header: "Quick Actions" white bold 14px.
> Card body: vertical stack of 4 action buttons (full width each, 44px height, 8px radius, 8px gap):
> - "+ Create Event Proposal" — Violet bg, white text, ti-calendar-event icon
> - "+ New Liquidation Report" — Dark Navy bg, Golden Yellow text, ti-receipt icon
> - "View Attendance Logs" — white bg, Cobalt Blue border + text, ti-qrcode icon
> - "Post Announcement" — white bg, gray border, Dark Navy text, ti-bell icon
>
> **Full-width bottom — "Recent Attendance Activity" white card (16px radius, 0.5px border):**
> Card header row: "Recent Attendance Activity" Dark Navy bold 16px left + "View Full Logs" Cobalt Blue text link right + "Live" green animated dot + "Live" green 12px text (shows system is active).
>
> Attendance table (full width, no outer border — table sits cleanly inside the card):
> Column headers (gray 12px bold, uppercase, `#F8F8F8` header row bg, `#E0E0E0` bottom border):
> Student Name / Student ID / Event / Scan Type / Timestamp / Verified
>
> Five data rows (44px height each, `#E0E0E0` bottom border, hover = light violet `#F3E8FF` bg):
> - Student Name: circle avatar (28px) + full name Dark Navy 14px bold side by side
> - Student ID: gray 13px
> - Event: event name Dark Navy 13px + org pill badge below (small, 10px, colored)
> - Scan Type: "Check-In" green gradient mini pill or "Check-Out" gray mini pill (Tabler ti-login / ti-logout icon inside pill)
> - Timestamp: gray 13px (e.g., "Today, 10:32 AM")
> - Verified: green ti-circle-check (20px) for verified or amber ti-alert-circle for flagged
>
> Below the table: pagination row — "Showing 1–5 of 48 recent logs" gray 12px left + Previous / Next buttons right (white bg, `#E0E0E0` border, 32px height, 8px radius, Dark Navy text).

---

## PROTOTYPE NAVIGATION REQUIREMENTS

> Wire up the following click interactions for the Figma prototype:
>
> - **Welcome Screen → Student Portal card click** → navigates directly to Student Dashboard (to be designed separately) without any login validation
> - **Welcome Screen → Officer Portal card click** → navigates to Officer Login screen (Screen 3)
> - **Welcome Screen → SAS Admin Portal card click** → navigates to SAS Admin Login screen (Screen 2)
> - **SAS Admin Login → Login button click** → navigates directly to SAS Admin Dashboard (Screen 4) without validation (prototype mode)
> - **Officer Login → Login button click** → navigates directly to Officer Dashboard (Screen 5) without validation (prototype mode)
> - **SAS Admin Login → Back to Welcome link** → navigates back to Welcome Screen (Screen 1)
> - **Officer Login → Back to Welcome link** → navigates back to Welcome Screen (Screen 1)
> - **Officer Dashboard sidebar nav items** → each nav item navigates to its corresponding screen placeholder (Event Management, Attendance Logs, Financial Liquidation, Member Directory, Announcements, Settings)
> - **SAS Admin Dashboard sidebar nav items** → same behavior for admin screens

---

## GLOBAL DESIGN NOTES

> Apply these rules consistently across all five screens:
>
> - **Left branding panel** (Screens 1–3): Always identical — Dark Navy bg, same logo, same welcome copy, same glow effects. This creates a sense of a persistent, trustworthy brand frame while only the right panel content changes per screen. Never alter the left panel between auth screens.
>
> - **Typography hierarchy**: Page titles = Dark Navy bold 28px. Section headers = Dark Navy bold 16px. Card headers = Dark Navy bold 14px (or white if on colored header). Body = Dark Navy 14px. Secondary = gray 13px. Captions/labels = gray 12px. Never go below 11px.
>
> - **Button hierarchy**: Primary actions = Dark Navy or Violet or gradient fill, white/Golden Yellow text. Secondary actions = white bg + colored border + colored text. Destructive actions = Red-Orange gradient. Text links = Violet or Cobalt Blue, never underlined by default (underline on hover only).
>
> - **Input fields**: Always 52px height on desktop web. `#E0E0E0` border 0.5px. 8px radius. Violet 2px focus ring. Floating label pattern — label sits inside as placeholder, floats above on focus. Icon always inside left of input. Password fields always have ti-eye toggle right.
>
> - **Cards**: White bg, 0.5px `#E0E0E0` border, 16px radius, 20px internal padding. Colored header bars use Dark Navy, Violet, or Cobalt Blue with white text. Never use shadows — borders only.
>
> - **Status pills**: Always gradient style — never flat color. Green gradient for approved/active/success. Amber for pending/warning. Red-Orange gradient for rejected/error/danger. Gray for inactive/draft. Cobalt Blue for informational.
>
> - **Sidebar**: SAS Admin sidebar = Dark Navy bg with white/Golden Yellow elements. Officer sidebar = white bg with Dark Navy/Violet elements. This visually distinguishes admin vs. officer role at a glance.
>
> - **Consistency**: The two-panel auth layout (dark left branding + white right form) must be pixel-perfect identical across Screens 1, 2, and 3. Same left panel width, same logo position, same glow placement.
>
> - Optimized for 1440px desktop width. Minimum 1280px supported. Left panel always 50% viewport width on auth screens. Sidebar 260px (admin) or 240px (officer) fixed on dashboard screens. Content area fills remaining width. 24px page padding throughout.