FIGMA PROMPT — CERTIFICATE MANAGEMENT MODULE
Figma AI / Prompt-to-Design Prompt:

Design a complete Certificate Management Module for STI Sync, available in both the SAO Admin Panel and the Officer Dashboard. This module allows administrators and officers to upload a certificate template image, visually position where student names will be printed, preview the result with a real name, manually add recipients who missed attendance scanning, and batch export or print all certificates for an event.
Use the exact color system:
Primary Dark Navy #001A4D · Violet #83358E · Golden Yellow #FFD41C · Cobalt #0E4EBD · Royal Blue #1E70E8 · Success Green #22C55E · Warning Amber #FFC107 · Danger Red-Orange #EF4444 · Surface White #FFFFFF · Border Gray #E0E0E0 · Subtext Gray #9E9E9E
Apply Inter font, 8px base grid, 12–16px border radius on cards, 8px on inputs. All icons use Tabler outline icons. Optimized for 1440px desktop web.


SIDEBAR NAVIGATION UPDATE

Both dashboards require a new nav item added to their respective sidebars:
Admin Sidebar (Dark Navy bg):
Insert between "Reports & Analytics" and "Announcements":

ti-certificate — Certificates
Active state: Golden Yellow 4px left accent + Royal Blue 20% opacity bg + white text. Badge: shows count of pending certificate generations if any.

Officer Sidebar (White bg):
Insert between "Attendance Logs" and "Financial Liquidation":

ti-certificate — Certificates
Active state: Light Violet #F3E8FF bg + Violet text + Violet 3px left accent. Badge: amber count if there are events with attendance completed but certificates not yet generated.



SCREEN 1 — CERTIFICATES MODULE DASHBOARD

Route: /admin/certificates and /officer/certificates
Page Header:
Title "Certificates" in Dark Navy bold 22px. Breadcrumb below. Right side: "+ Create Certificate" primary button (Dark Navy bg, Golden Yellow text, ti-certificate-2 icon — admin) or (Violet bg, white text — officer).
Context Banner (full width, Dark Navy gradient, 16px radius, 20px padding):
Left side: ti-certificate Golden Yellow icon (40px) + white bold title "Certificate Management" 20px + white 14px subtitle "Upload a template, position names, preview, and export certificates for your events." Right side: two small stat chips in Golden Yellow pill: "X Templates Saved" and "X Certificates Issued This Semester."
Four Metric Stat Cards (gradient style, horizontal row):

"Total Templates" — Cobalt Blue gradient, ti-template icon, "uploaded this account" note
"Pending Generation" — Amber gradient, ti-clock icon, "events with completed attendance, no certificates yet" note, "Generate Now" amber pill top-right
"Certificates Issued" — Green gradient, ti-certificate icon, "+X this semester" note
"Manual Recipients Added" — Violet gradient, ti-user-plus icon, "added outside app attendance" note

Two-column section below metrics:
Left column (8/12) — "Events Ready for Certificate Generation" white card:
Dark Navy header bar: "Ready to Generate" white bold 14px + amber count badge. Body: a list of events that have completed attendance but certificates have not been generated yet. Each row (56px, #E0E0E0 bottom border):

Event name Dark Navy bold 14px
Organization name gray 12px (admin view only — officers only see their own org)
Event date gray 12px with ti-calendar icon
Attendee count: "X attended" green pill
Manual additions count: "+X manual" amber pill (if any)
"Generate Certificates" Violet/Golden Yellow button right (36px, 8px radius)
Empty state: ti-circle-check Cobalt Blue (48px) + "All events have certificates generated." gray text.

Right column (4/12) — "Saved Templates" white card:
Dark Navy header: "My Templates" white bold 14px + "+ Upload New" Golden Yellow text link right.
Body: vertical list of saved templates. Each row: template thumbnail preview (48px × 34px landscape thumbnail, rounded 4px) + template name Dark Navy bold 13px + "Used X times" gray 11px + date uploaded gray 11px + action icons right (ti-eye Cobalt Blue, ti-edit gray, ti-trash red on hover). "View All Templates" Cobalt Blue text link at bottom.


SCREEN 2 — TEMPLATE LIBRARY

Page Header:
Title "Certificate Templates" with breadcrumb. Right: "+ Upload New Template" primary button.
Filter Bar:
Search input (placeholder "Search templates..."), Sort dropdown (Newest / Most Used / A–Z). "Showing X templates" gray count right.
Template Cards Grid (3-column responsive):
Each template is a white card (16px radius, 0.5px border):
Card Top — Template Preview Thumbnail:
A landscape rectangle (full card width, 160px height, #F8F8F8 bg, 12px top radius) showing the certificate template image as a thumbnail. If no image: centered ti-certificate icon in Light Gray + "No preview available" gray 12px. A small "DEFAULT" Golden Yellow badge top-left if it is the default template.
Card Body:

Template name: Dark Navy bold 15px
Dimensions: gray 12px (e.g., "A4 Landscape — 297×210mm")
Name position set: green ti-check + "Name position configured" green 12px OR amber ti-alert + "Name position not set" amber 12px
Font settings: gray 12px (e.g., "Arial · 28px · Centered · Dark Navy")
Times used: gray 12px with ti-chart-bar icon
Last used: gray 12px with ti-clock icon

Card Bottom Action Row:
"Use This Template" Violet/Navy filled button (full width, 36px) + icon row right: ti-eye (preview), ti-edit (edit settings), ti-copy (duplicate), ti-trash (delete — disabled if used in active events).
Empty State:
Centered ti-certificate-2 Cobalt Blue (64px) + "No templates yet" Dark Navy bold 18px + "Upload your first certificate template to get started." gray 14px + "+ Upload Template" Violet button.


SCREEN 3 — UPLOAD & CONFIGURE TEMPLATE

This is the most important screen in the module. It has two phases: Upload phase and Configure phase.
Page Header:
Title "Configure Certificate Template" with breadcrumb. Right side: "Save Template" Dark Navy/Violet button (disabled until name position is set).
Two-column layout (canvas left, settings right):



LEFT COLUMN — CERTIFICATE CANVAS (700px, #F0F0F0 bg, 16px radius)
Canvas Header Bar (white, 0.5px bottom border, 44px height):
Left side pill tabs: "Edit Mode" (active = Dark Navy bg, white text) / "Preview Mode" (inactive = white bg, gray text). Right side: zoom controls — ti-minus gray button + "100%" gray label + ti-plus gray button (all small, 28px, 8px radius). A "Fit to Screen" ti-arrows-maximize icon button beside zoom.
Canvas Area (scrollable if template larger than canvas):
The uploaded certificate template image displayed at the configured zoom level. Centered in the canvas area. Gray checkered pattern visible in empty areas outside the template (like Figma/Photoshop).
In EDIT MODE:
A draggable name placeholder box sits on top of the template. This box:

Is a semi-transparent Dark Navy #001A4D at 40% opacity rectangle with a Golden Yellow #FFD41C dashed border (2px, dashes)
Contains centered text: "[Student Full Name]" in the configured font, size, and color — displayed as a live preview of how the name will appear
Has 8 resize handles (corners + midpoints) — small Golden Yellow filled squares (10px × 10px) that the user can drag to resize the text box
Has a move cursor (4-direction arrow) when hovering anywhere inside the box — drag to reposition
Shows X and Y coordinate badges when being dragged: small Dark Navy pill showing "X: 342px · Y: 156px" that updates in real-time as the box moves
Has a rotation handle at the top center (small Golden Yellow circle with ti-rotate icon, 16px) — drag to rotate text (useful for portrait templates)

Position Helper Guidelines:
When dragging the name box, smart snap lines appear:

Horizontal center guide: thin Golden Yellow dashed line across full canvas width when box aligns to horizontal center
Vertical center guide: thin Golden Yellow dashed line down full canvas height when box aligns to vertical center
Edge guides: thin gray lines at 20px from template edges

Canvas Empty State (when no template uploaded yet):
Centered in the gray canvas: dashed Dark Navy border rectangle (400px × 280px, 16px radius) + ti-upload Dark Navy icon (48px) + "Upload your certificate template" Dark Navy bold 16px + "JPG, PNG, or PDF · Max 10MB · A4 or Letter size recommended" gray 13px + "Upload Template" Violet button (centered, 44px height).
In PREVIEW MODE:
The name placeholder box becomes invisible. Instead, the configured name (from the preview name input in the right panel) is rendered directly on the template image at the exact configured position, font, size, and color — exactly as it will appear on the final exported certificate. A green "Preview Active" pill badge top-right of canvas. A "Back to Edit" text link top-left of canvas.



RIGHT COLUMN — CONFIGURATION PANEL (320px, white, 0.5px left border)
Panel Header:
"Template Settings" Dark Navy bold 16px + ti-settings gray icon right.
Section A — Template Upload:
Template Name input (required, placeholder "e.g., IT Guild Certificate of Participation"). Below it: the upload zone (if no template yet) or the current template info row (if uploaded): small thumbnail (48px) + filename Dark Navy 13px bold + file size gray 12px + "ti-refresh Replace" Cobalt Blue text link right.
Upload zone (when empty): dashed #E0E0E0 border, 80px height, 12px radius. ti-upload Cobalt Blue icon + "Click or drag to upload" gray 13px. Below: "Accepted: JPG, PNG, PDF · Max 10MB" gray 11px.
Section B — Name Text Settings:
Section label: "Name Text Appearance" Dark Navy bold 13px + Violet 3px left accent bar. Fields:

Font Family (dropdown, 200px): options: Arial, Times New Roman, Georgia, Helvetica, Montserrat, Playfair Display, Great Vibes (script). Shows font name rendered in that font as the option label.
Font Size (number input + "px" label, 80px wide): min 8, max 120, default 32.
Font Weight (segmented toggle: Regular / Bold / Italic / Bold Italic — 2×2 grid of small pill buttons): active = Dark Navy bg, white text. Inactive = white, gray border.
Text Color (color picker input): a 32px × 32px color swatch (showing current color, clicking opens a color picker popover) + hex input field beside it. Presets row below: 6 small color swatches (Dark Navy, White, Black, Gold #B8860B, Dark Red, Dark Green) for quick selection.
Text Alignment (3 icon toggle buttons): ti-align-left / ti-align-center / ti-align-right — active = Dark Navy bg, white icon. Inactive = white, gray border.

Section C — Position Coordinates (read-only, updates as user drags):
Section label: "Name Position" Dark Navy bold 13px + Violet left accent.
A 2×2 grid of read-only number display fields (gray bg, ti-lock icon right):

X Position: "342 px" (distance from left edge)
Y Position: "156 px" (distance from top edge)
Box Width: "280 px"
Box Height: "48 px"

Below the grid: "Reset Position" Cobalt Blue text link (ti-refresh icon) — resets box to horizontal center, 60% down the template. A helper note in gray italic 12px: "Drag the highlighted box on the canvas to adjust name position."
Section D — Preview & Test:
Section label: "Preview Certificate" Dark Navy bold 13px + Violet left accent.
Preview Name input (full width, 44px height): placeholder "Type a name to preview..." — whatever is typed here appears on the canvas in Preview Mode at the configured position and style. Default pre-filled value: "Juan dela Cruz" so there is always something to show.
"Preview Certificate" button (full width, 48px height, 8px radius):

Background: Violet #83358E to #5B1F6B gradient (officer) or Dark Navy #001A4D (admin)
White text bold 15px
ti-eye white icon left
On click: canvas switches to Preview Mode, showing the preview name rendered on the template at the exact position. Button label changes to "Exit Preview" with ti-eye-off icon.
On hover: gradient darkens. On click: 150ms scale 0.98 animation.

Below the preview button: a small light violet #F3E8FF info card: ti-info-circle Violet icon + "Preview shows exactly how names will appear on the final exported certificates." Violet italic 12px.
Section E — Save Template:
"Save Template" button (full width, 48px, Dark Navy bg, Golden Yellow text bold, ti-device-floppy icon — admin) or (Violet bg, white text — officer). Disabled until: template uploaded + name set + template name filled.
"Set as Default Template" toggle below button: "Use this template automatically for new certificate generations." Violet toggle.


SCREEN 4 — GENERATE CERTIFICATES FOR EVENT

Triggered from the Dashboard "Generate Certificates" button or from the "+ Create Certificate" flow.
Page Header:
Title "Generate Certificates" with breadcrumb. Right: "Export All (PDF)" Dark Navy button + "Print All" Cobalt Blue outline button.
Event Summary Card (full width, Dark Navy gradient header, 16px radius):
Header (80px): ti-calendar-event Golden Yellow icon (32px) + event name white bold 18px + organization name white 13px at 70% opacity. Right side: event date white + "X Attended" green pill badge.
White card body (single row of 4 stats with vertical dividers):
Total Registered (Dark Navy bold number) | Checked In (green bold) | Manual Additions (amber bold) | Total Recipients (Violet bold, = Checked In + Manual Additions)
Template Selector Card (full width, white, 0.5px border, 12px radius, 16px padding):
Row layout: "Certificate Template" Dark Navy bold 14px label left + currently selected template name Violet bold 14px center + "Change Template" Cobalt Blue text link right. Below row: small template thumbnail (80px × 56px) + template details gray 12px (font, size, position status). If no template configured: amber warning card "No template selected. Please select a template before generating." + "Select Template" Violet button.
Two-column layout below (8/12 + 4/12):
Left — Recipients Table (8/12)
Table Header Row:
"Certificate Recipients" Dark Navy bold 16px left + two action buttons right:

"+ Add Manual Recipient" Violet outline button (44px, ti-user-plus icon) — opens Add Manual Recipient inline row
"Select All / Deselect All" gray text link

Filter Pills Row (below header):
"All (X)" / "From Attendance (X)" / "Manual (X)" — pill tabs. Active = Dark Navy bg, white text. Inactive = white, gray border.
Recipients Table:
Columns: Checkbox, Avatar (circle 32px) + Full Name + Student ID (stacked), Course & Year, Source (pill: "Attendance" = green pill with ti-qrcode icon / "Manual" = amber pill with ti-user-plus icon), Include in Export (Violet toggle switch, ON by default), Actions (ti-eye preview, ti-trash remove — only for manual entries).
Row hover: Light Violet #F3E8FF. Sortable Name column. Pagination if > 20 rows.
Manual Recipient Add Row (appears inline below the table when "+ Add Manual Recipient" is clicked):
An inline form row embedded directly at the bottom of the table — no modal needed. White bg, Violet 2px top border, #F3E8FF bg, 12px padding:

Avatar placeholder circle (32px, Light Gray bg, ti-user gray icon)
Full Name input (200px, 36px height, placeholder "Full name of recipient")
Student ID input (120px, placeholder "Student ID" — optional for manual)
Course & Year input (140px, placeholder "e.g. BSIT-2A")
Reason input (160px, placeholder "e.g. Forgot to scan out")
"Add" Violet button (80px, 36px height)
ti-x gray icon button to cancel the inline row

Validation on Add:

Full Name required, min 2 chars
DUPLICATE CHECK: warn if name already exists in recipients list → amber inline note: "A recipient with this name already exists. Add anyway?" with Confirm/Cancel.

Bulk Action Bar (appears when checkboxes selected):
Dark Navy bg bar: "X recipients selected" white text + "Remove Selected" Red-Orange outline button + "Export Selected" gray outline button.

Right — Certificate Preview Panel (4/12)
Panel Header:
"Live Preview" Dark Navy bold 14px + ti-eye icon.
Preview Card (white, 0.5px border, 12px radius):
A scaled-down certificate preview (full panel width, maintains template aspect ratio). Shows the currently selected/highlighted recipient's name rendered on the template at the configured position. If no recipient selected: shows the template with "Juan dela Cruz" as placeholder name.
Below preview: "Previewing certificate for:" gray 12px label + selected recipient name Dark Navy bold 13px (or "No recipient selected" gray italic if none).
Navigation Controls (below preview card):
ti-chevron-left gray button + "3 of 85" Dark Navy 13px bold + ti-chevron-right gray button — step through all recipients to preview each certificate. The canvas updates to show each name at the configured position.
Preview Actions:

"Download This Certificate (PDF)" Cobalt Blue text link + ti-download icon — downloads single recipient's certificate as PDF
"Print This Certificate" gray text link + ti-printer icon

Font & Position Quick Edit (collapsible, below preview actions):
A "Quick Adjust" collapsible card (ti-chevron-down expands it). When expanded: compact versions of font size, text color, and X/Y position inputs from Screen 3. Changes here update the template settings immediately and reflect in the preview. "Go to Full Editor" Cobalt Blue text link at bottom takes back to Screen 3.


SCREEN 5 — CERTIFICATE PREVIEW MODAL (Full Screen)

Triggered when clicking ti-eye on any recipient row in the table, or "Preview Certificate" in Screen 3.
Modal structure (faux full-screen, rgba(0,0,0,0.85) overlay):
Modal Header (Dark Navy, 56px):
Left: ti-certificate Golden Yellow icon + "Certificate Preview" white bold 16px. Center: recipient name in Golden Yellow bold 14px (or "Template Preview" if from Screen 3). Right: ti-download white icon button ("Download PDF") + ti-printer white icon button ("Print") + ti-x white icon button (close).
Certificate Display Area (centered in modal, max 900px wide):
The certificate template at near-full size. The recipient's name rendered directly on the template at the configured position in the configured font, size, weight, and color. The rendering must be pixel-accurate — this is exactly what will be exported.
Navigation (shown if opened from the recipients table):
Bottom of modal: ti-chevron-left white button + "Certificate 3 of 85" white 14px + ti-chevron-right white button. Keyboard left/right arrow keys also navigate.
Bottom Action Bar (white, 64px, centered):
Three buttons centered:

"Download PDF" — Dark Navy bg, Golden Yellow text, ti-download icon, 48px height
"Print" — white bg, Dark Navy border, Dark Navy text, ti-printer icon, 48px height
"Close Preview" — gray text link, ti-x icon



SCREEN 6 — EXPORT & PRINT (Batch)

Triggered from the "Export All (PDF)" or "Print All" buttons on Screen 4.
Modal (centered, 560px wide, faux viewport wrapper):
Modal Header:
Dark Navy gradient (64px): ti-file-export Golden Yellow icon (28px) + "Export Certificates" white bold 16px + event name Golden Yellow 13px.
White Modal Body:
Export Summary Card (light violet bg, Violet border, 12px radius, 16px padding):
Three inline stats: "Total Recipients" Dark Navy bold number | "Included" green bold number | "Excluded" gray number. A note: "Only recipients with the 'Include in Export' toggle enabled will be exported."
Export Options Section:
"Export Format" Dark Navy bold 13px + Violet left accent. Three large option cards side by side (radio behavior):

"Single PDF — All certificates in one file" (ti-file-text icon, Cobalt Blue): each certificate on a separate page. Recommended for printing.
"Individual PDFs — One file per student" (ti-files icon, Violet): zipped into a single download. Good for digital distribution.
"Print-Ready PDF — Crop marks included" (ti-printer icon, Dark Navy): for professional printing.

Active card: Violet border 2px, Light Violet bg. Inactive: white bg, #E0E0E0 border.
Paper Size & Orientation (below format):
Two-column row: Paper Size dropdown (A4, Letter, Legal, Custom) + Orientation toggle (Landscape / Portrait pill buttons).
Quality Setting:
Slider (full width, Violet thumb): Low (72dpi) ← → High (300dpi). Label below: "72 DPI — Screen" / "150 DPI — Standard Print" / "300 DPI — High Quality Print" updating as slider moves.
File Naming Convention:
Dropdown: "StudentName_Certificate.pdf" / "StudentID_Certificate.pdf" / "EventName_StudentName.pdf" / Custom (text input appears). Preview of filename shown below in gray monospace: e.g., "JuandelaCruz_Certificate.pdf"
Progress Section (shown after Export is clicked):
Replaces the options above. A full-width Violet progress bar (animated fill). "Generating certificate 34 of 85..." Dark Navy 14px below. "Please wait — do not close this window." gray italic 12px. Estimated time remaining gray 12px.
Completion State:
Green gradient card: ti-circle-check white icon (40px) + "85 certificates generated successfully!" white bold 16px + "Download ready." white 13px. "Download ZIP / PDF" Green gradient button (full width, 52px) + "Done" gray text link.
Modal Footer:
"Cancel" gray outline button left + "Export X Certificates" Dark Navy/Violet primary button right (disabled until format selected). Shows loading state on click.


ADMIN VS OFFICER DIFFERENCES

Admin (SAO Adviser):

Can see events from ALL organizations in the module dashboard
Can use templates created by any officer
Can override certificate recipients across any event
"Export All" includes all organizations' events
Template library shows all templates system-wide
Can set a system default template used by all orgs

Officer:

Can only see their own organization's events
Can only use templates they uploaded themselves
Can add manual recipients only to their own org's events
Template library shows only their own uploaded templates
Cannot access other organizations' certificate data
A read-only note appears at top of module: "Certificate generation is scoped to your organization's events only."



GLOBAL DESIGN NOTES FOR THIS MODULE


Canvas interaction is the most critical UX in this module. The drag-to-position name box must feel responsive and precise. Always show real-time coordinate feedback while dragging. Snap guides must appear and disappear cleanly.
Preview accuracy is non-negotiable. What the user sees in Preview Mode must be pixel-identical to the exported PDF. Never show a placeholder or approximation — render the actual font, size, color, and position.
Manual recipient rows use inline table editing — no modal. The add row appears directly inside the table body. This keeps the workflow fast during live events where someone needs to be added quickly.
Duplicate name warning on manual add is non-blocking — it warns but allows the officer to proceed. Some students legitimately have the same name.
Template thumbnails throughout the module always show a scaled version of the actual uploaded template image — never a generic icon placeholder once a template is uploaded.
Include/Exclude toggle per recipient allows the officer to quickly exclude specific students from a batch export without deleting them from the list.
Empty states: Template library empty = centered upload prompt. Recipients table empty = "No attendance data found. Add recipients manually." amber card.
All export actions trigger a bottom-right success toast after completion: green bg, white text, ti-check icon, "X certificates exported successfully", auto-dismiss 4 seconds.
Optimized for 1440px desktop. Canvas area minimum 600px width. Right settings panel 320px fixed. 24px page padding. 20px card padding throughout.