# STI Sync — Officer Panel Design Patterns

> **Scope:** All pages and components under `src/app/officer/`
> **Role:** Organization Officer (club president, secretary, treasurer, etc.)
> **Layout entry:** `src/app/officer/components/OfficerLayout.tsx`
> **Route prefix:** `/officer`

---

## 1. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Dark Navy | `#001A4D` | Primary text, headings, strong labels |
| Periwinkle / Indigo | `#7F77DD` | Logo mark, avatar background, org switcher accent |
| Violet | `#83358E` | Active nav left accent, active nav text, focus rings, primary CTAs |
| Violet Soft Bg | `#F3E8FF` | Active nav item background |
| Violet Muted | `#EEEDFE` | Org switcher button background |
| White | `#FFFFFF` | Sidebar background, card surfaces, page backgrounds |
| Light Border | `#E0E0E0` | Sidebar border, card borders, input borders |
| Muted Text | `#888780` | Inactive nav items, sub-labels, secondary info |
| Body Text | `#374151` / `text-gray-700` | Regular body copy |

### Semantic Status Colors (same across the system)
| State | Color | Tailwind |
|-------|-------|---------|
| Success | `#10B981` | `text-green-600`, `bg-green-50` |
| Warning | `#FFC107` | `text-amber-600`, `bg-amber-50` |
| Danger | `#EF4444` | `text-red-600`, `bg-red-50` |
| Info | `#1E70E8` | `text-blue-600`, `bg-blue-50` |

---

## 2. Layout Structure

```
/officer (OfficerLayout.tsx)
├── OfficerSidebar (fixed, 240px wide, bg-white border-r border-[#E0E0E0])
└── Main content area
    └── ml-[240px] min-h-screen bg-gray-50
        └── <Outlet /> — page content with p-6 padding
```

### Sidebar (`src/app/officer/components/OfficerSidebar.tsx`)
- **Background:** `bg-white border-r border-[#E0E0E0]` (light, clean — opposite of admin)
- **Width:** `w-[240px]` (slightly narrower than admin's 260px)
- **Logo:** Periwinkle `#7F77DD` square badge + "STI Sync" `text-[#001A4D]` bold
- **Org switcher:** `bg-[#EEEDFE]` pill with `text-[#7F77DD]` + ChevronDown
- **Nav item inactive:** `text-[#888780] hover:text-[#001A4D] hover:bg-gray-50`
- **Nav item active:** `bg-[#F3E8FF] text-[#83358E]` + `w-[3px] bg-[#83358E]` left accent
- **Notification badge:** small dot only — `w-2 h-2 rounded-full` (not a count pill)
  - Red dot: `bg-[#E24B4A]` for urgent items
  - Amber dot: `bg-[#FFC107]` for informational items (e.g., certificates)
- **User profile footer:** `bg-[#7F77DD]` avatar, `text-[#001A4D]` name, `text-[#888780]` role

---

## 3. Page Header Pattern

```tsx
<div className="flex items-start justify-between">
  <div>
    <h2 className="text-2xl font-bold text-[#001A4D]">Page Title</h2>
    <p className="text-gray-500 text-sm">Supporting description</p>
  </div>
  {/* Primary CTA — violet for officers */}
  <button className="px-4 py-2 bg-[#83358E] text-white rounded-lg text-sm font-medium
    hover:bg-[#6D2A78] flex items-center gap-2 transition-colors">
    <Plus className="w-4 h-4" />
    Create Something
  </button>
</div>
```

Officer CTAs use **solid violet** (`bg-[#83358E]`) — not the dark navy gradient used in admin.

---

## 4. Section Heading Pattern

Same left-border accent as admin, same violet color:

```tsx
<div className="border-l-4 border-[#83358E] pl-3 mb-4">
  <h3 className="text-[#001A4D] font-bold text-base">Section Title</h3>
</div>
```

Officers do **not** see "Admin Only" badges. If a feature is officer-scoped, no badge is shown. If a feature is restricted to admin, it is simply hidden from the officer UI entirely.

---

## 5. Buttons

### Primary (officer main action)
```tsx
<button className="px-4 py-2 bg-[#83358E] text-white rounded-lg text-sm font-medium
  hover:bg-[#6D2A78] transition-colors">
  Action
</button>
```

### Secondary (add item, add row)
```tsx
<button className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium
  hover:bg-[#0E4EBD] flex items-center gap-2">
  <Plus className="w-4 h-4" /> Add Item
</button>
```

### Outline
```tsx
<button className="px-4 py-2 border border-[#83358E] text-[#83358E] rounded-lg text-sm
  hover:bg-[#83358E]/5 transition-colors">
  Cancel
</button>
```

### Destructive
```tsx
<button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
  Delete
</button>
```

---

## 6. Toggle / Switch

Same pattern as admin but active color is Violet:

```tsx
<button
  onClick={() => setToggle(!toggle)}
  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0
    ${toggle ? 'bg-[#83358E]' : 'bg-gray-300'}`}
>
  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
    transition-transform shadow ${toggle ? 'translate-x-6' : ''}`} />
</button>
```

---

## 7. Form Fields

### Standard Input
```tsx
<input
  type="text"
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
    focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
/>
```

### Textarea
```tsx
<textarea
  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
    focus:ring-2 focus:ring-[#83358E] focus:border-transparent resize-none"
/>
```

### Select
```tsx
<select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
  focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
```

### Labels
```tsx
<label className="block text-sm font-medium text-gray-700 mb-1.5">
  Field Name <span className="text-red-500">*</span>
</label>
```

### File Upload Zone
```tsx
<div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center
  hover:border-[#83358E] transition-colors cursor-pointer">
  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
  <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
</div>
```

---

## 8. Cards

### Standard Card
```tsx
<div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
  {/* content */}
</div>
```

Officers use `rounded-xl` (more rounded) compared to admin's `rounded-lg`. The general feel is lighter and friendlier.

### Metric / Stat Card
```tsx
<div className="p-4 bg-[#83358E]/5 border border-[#83358E]/20 rounded-xl text-center">
  <div className="text-2xl font-bold text-[#83358E]">42</div>
  <div className="text-xs text-gray-500 mt-0.5">Label</div>
</div>
```

Use violet-tinted backgrounds for officer metric cards instead of navy gradients.

---

## 9. Tables

Same table structure as admin:

```tsx
<div className="border border-gray-200 rounded-xl overflow-hidden">
  <table className="w-full">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Column</th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-gray-100">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-900">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 10. Status Badges / Pills

```tsx
{/* Approved */}
<span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
  Approved
</span>

{/* Pending */}
<span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
  Pending
</span>

{/* Rejected */}
<span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
  Rejected
</span>

{/* Active member */}
<span className="px-2 py-1 bg-[#F3E8FF] text-[#83358E] text-xs rounded-full font-medium">
  Active
</span>
```

---

## 11. Multi-Step Form Layout

Officer-facing forms use the same two-column layout as admin:

```tsx
<div className="grid grid-cols-[1fr_300px] gap-6">
  <div className="space-y-6">{/* form content */}</div>
  <div>
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm sticky top-0">
      {/* preview panel */}
    </div>
  </div>
</div>
```

Key difference: officer forms do **not** show admin-only toggles, override fields, or SAO authority banners.

---

## 12. Modals

### Medium Modal
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="absolute inset-0 bg-black/50" onClick={onClose} />
  <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
    {/* Header — violet for officer */}
    <div className="bg-[#83358E] px-6 py-4 flex items-center justify-between">
      <h3 className="text-white font-bold text-lg">Modal Title</h3>
      <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
        <X className="w-5 h-5" />
      </button>
    </div>
    <div className="p-6">{/* content */}</div>
  </div>
</div>
```

Officer modals use a **solid violet header** (`bg-[#83358E]`) instead of admin's navy-to-violet gradient.

### Confirmation Modal
Same structure as admin small confirmation modal with violet confirm button:
```tsx
<button className="flex-1 py-2.5 bg-[#83358E] text-white rounded-xl text-sm font-bold hover:bg-[#6D2A78]">
  Confirm
</button>
```

---

## 13. Empty States

```tsx
<div className="text-center py-16">
  <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
  <h3 className="font-medium text-gray-900 mb-1">Nothing here yet</h3>
  <p className="text-gray-500 text-sm mb-4">Description of how to create the first item.</p>
  <button className="px-4 py-2 bg-[#83358E] text-white rounded-lg text-sm font-medium">
    Create First Item
  </button>
</div>
```

---

## 14. Progress / Stepper

For multi-step flows visible to officers (e.g. submitting event proposals):

```tsx
<div className="flex items-center gap-2 overflow-x-auto pb-2">
  {steps.map((step, i) => (
    <button
      key={i}
      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
        i === current  ? 'bg-[#83358E] text-white' :
        i < current    ? 'bg-[#1E70E8] text-white hover:bg-[#0E4EBD]' :
                         'bg-gray-100 text-gray-400 cursor-not-allowed'
      }`}
    >
      {step}
    </button>
  ))}
</div>
```

---

## 15. Notification Dot Badge Pattern

Officers use small color dots on nav items instead of number counters:

```tsx
{item.badge !== null && (
  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
    item.path === '/officer/certificates' ? 'bg-[#FFC107]' : 'bg-[#E24B4A]'
  }`} />
)}
```

---

## 16. Icons

Same `lucide-react` library, same size scale as admin:
- `w-4 h-4` — inline/button icons
- `w-5 h-5` — section/nav icons
- `w-6 h-6` — feature icons
- `w-8 h-8` — modal/hero icons

---

## 17. Avatar / Initials

```tsx
{/* Officer periwinkle avatar */}
<div className="w-10 h-10 bg-[#7F77DD] rounded-full flex items-center justify-center
  text-white font-semibold">
  JD
</div>
```

---

## 18. Key Differences vs Admin Panel

| Aspect | Admin | Officer |
|--------|-------|---------|
| Sidebar bg | `#001A4D` dark navy | `#FFFFFF` white |
| Sidebar width | 260px | 240px |
| Active nav bg | `#1E70E8]/20` | `#F3E8FF` (violet soft) |
| Active nav text | white | `#83358E` violet |
| Active nav accent | 4px `#FFC107` golden | 3px `#83358E` violet |
| Logo badge bg | `#FFC107` golden | `#7F77DD` periwinkle |
| Role pill | Golden Yellow | None (shows org name) |
| Primary CTA | Navy gradient | Solid violet |
| Badge style | Number count (red circle) | Color dot only |
| Admin-only fields | Visible with "Admin Only" badge | Hidden entirely |
| Modal header | Navy→Violet gradient | Solid violet |
| Metric card accent | Navy/Blue/Green gradients | Violet-tinted soft bg |

---

## 19. Settings Page Pattern

**File:** `src/app/officer/pages/OfficerSettings.tsx`

Three sections only — keep the settings surface minimal and officer-relevant:

| Section | Key Fields |
|---------|-----------|
| **Account Profile** | Full Name, Email, Contact Number (editable); Student ID, Course/Year, Officer Role (read-only) |
| **Security & Password** | Current / New / Confirm password fields + password strength meter; Active Sessions list with per-session sign-out |
| **Notification Preferences** | Grouped by domain: Events, Finance, Admin & Documents |

### Removed from Settings
- **Organization Profile** is an admin-only concern. Officers cannot edit org name, department, or contact email — that is managed by the SAO Admin panel.

### Settings Nav Active State
```tsx
activeSection === key
  ? 'bg-[#F3E8FF] text-[#83358E]'   // ← correct violet, not #EEEDFE / #7F77DD
  : 'text-[#888780] hover:bg-gray-50 hover:text-[#001A4D]'
```

### Password Strength Meter
Show a 4-segment bar below the new password field. Score one segment per satisfied rule: length ≥ 8, uppercase letter, digit, special character. Colors: 1 red, 2 amber, 3 blue, 4 green.

### Notification Rows
Group toggles under bold uppercase category labels (`Events`, `Finance`, `Admin & Documents`). Use a `border-b border-gray-100` divider between rows, omit from the last row in each group.

### Read-Only Field Style
```tsx
className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-[14px] bg-gray-50 text-gray-500 cursor-not-allowed"
```

---

## 20. Do Not

- Do **not** use `bg-[#001A4D]` as the sidebar background — that is admin only
- Do **not** show "Admin Only" badges or SAO authority banners in officer views
- Do **not** use count number badges on nav items — only color dots
- Do **not** use navy gradient headers in officer modals — use solid violet
- Do **not** use `grid-cols-[720px_320px]` — always fluid `grid-cols-[1fr_300px]`
- Do **not** expose budget override fields, fast-track toggles, or scanner full-access controls to officers
