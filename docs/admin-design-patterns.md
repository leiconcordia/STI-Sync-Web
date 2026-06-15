# STI Sync — Admin Panel Design Patterns

> **Scope:** All pages and components under `src/app/admin/`
> **Role:** SAO Administrator / SAO Adviser
> **Layout entry:** `src/app/admin/components/layout/Layout.tsx`
> **Route prefix:** `/home`

---

## 1. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Dark Navy | `#001A4D` | Primary text, headers, sidebar background, CTA primary buttons |
| Royal Blue | `#1E70E8` | Secondary actions, info accents, session/schedule elements |
| Royal Blue Dark | `#0E4EBD` | Hover state for Royal Blue buttons |
| Violet | `#83358E` | Section accents, active nav indicator, admin-only badges, focus rings |
| Violet Light | `#A855F7` | Gradient end for violet cards |
| Golden Yellow | `#FFC107` | Alerts, admin badges, SAO authority highlights, active nav left-border |
| Golden Yellow Light | `#FFD41C` | Gradient end for yellow elements |
| White | `#FFFFFF` | Card backgrounds, TopNav background, content surfaces |
| Light Border | `#E0E0E0` | Borders on cards, inputs, dividers |
| Body Text | `#374151` / `text-gray-700` | Regular body copy |
| Muted Text | `#6B7280` / `text-gray-500` | Labels, helper text, secondary info |

### Semantic Status Colors
| State | Color | Tailwind |
|-------|-------|---------|
| Success / Paid | `#10B981` | `text-green-600`, `bg-green-50`, `border-green-200` |
| Warning / Pending | `#FFC107` | `text-amber-600`, `bg-amber-50`, `border-amber-200` |
| Danger / Rejected / Unpaid | `#EF4444` | `text-red-600`, `bg-red-50`, `border-red-200` |
| Info | `#1E70E8` | `text-blue-600`, `bg-blue-50`, `border-blue-200` |

---

## 2. Layout Structure

```
/home (Layout.tsx)
├── Sidebar (fixed, 260px wide, bg-[#001A4D])
├── TopNav  (fixed top, 56px tall, bg-white border-b border-[#E0E0E0])
└── Main content area
    └── ml-[260px] pt-14 min-h-screen bg-gray-50
        └── <Outlet /> — page content with p-6 padding
```

### Sidebar (`src/app/admin/components/layout/Sidebar.tsx`)
- **Background:** `bg-[#001A4D]` (Dark Navy), fixed full-height
- **Width:** `w-[260px]`
- **Logo area:** STI logo badge (Golden Yellow gradient) + "STI Sync" white text + "SAO Admin" Golden Yellow pill badge
- **Nav item inactive:** `text-[#E0E0E0]/70 hover:text-white hover:bg-white/5`
- **Nav item active:** `bg-[#1E70E8]/20 text-white` + `w-1 bg-[#FFC107]` left accent bar
- **Notification badge:** `w-5 h-5 bg-red-500 rounded-full` with white text count
- **User profile footer:** avatar `bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8]`, name white, role `text-[#FFD54F]`

### TopNav (`src/app/admin/components/layout/TopNav.tsx`)
- **Height:** `h-14`
- **Background:** `bg-white border-b border-[#E0E0E0]`
- **Page title:** `text-lg font-bold text-[#001A4D]`
- **Search input:** `w-64 border-[#E0E0E0] focus-visible:ring-[#1E70E8]`
- **User avatar:** `bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8]`

---

## 3. Page Header Pattern

Every admin page starts with a consistent header block:

```tsx
<div className="flex items-start justify-between">
  <div>
    <h2 className="text-2xl font-bold text-[#001A4D]">Page Title</h2>
    <p className="text-gray-500 text-sm">Supporting description</p>
  </div>
  {/* Primary CTA — always top-right */}
  <Button className="bg-gradient-to-r from-[#001A4D] to-[#83358E] hover:from-[#001A4D]/90 hover:to-[#83358E]/90 text-white">
    <Plus className="w-4 h-4 mr-2" />
    Action Label
  </Button>
</div>
```

---

## 4. Section Heading Pattern (within forms / cards)

Use a left violet border accent for all sub-section headings:

```tsx
<div className="border-l-4 border-[#83358E] pl-3 mb-4">
  <h3 className="text-[#001A4D] font-bold text-base">Section Title</h3>
</div>
```

With inline badge (for admin-only sections):
```tsx
<div className="flex items-center gap-2 mb-4 border-l-4 border-[#83358E] pl-3">
  <h3 className="text-[#001A4D] font-bold text-base">Section Title</h3>
  <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
</div>
```

---

## 5. Admin-Only Badge

Used to visually mark fields and controls exclusive to SAO Admins:

```tsx
<span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
// or
<span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin</span>
```

For authority/SAO banners (dark background with golden border):
```tsx
<div className="p-4 bg-[#001A4D] border-l-4 border-[#FFC107] rounded-lg">
  <Shield className="w-6 h-6 text-[#FFC107]" />
  <h3 className="text-white font-bold">Administrative Authority</h3>
  <p className="text-gray-200 text-sm">Description...</p>
</div>
```

---

## 6. Buttons

### Primary Action (create, publish, confirm)
```tsx
<button className="px-6 py-2.5 bg-[#001A4D] text-white rounded-lg font-medium hover:bg-[#001A4D]/90 transition-colors">
  Action
</button>
```

### Gradient Primary (page-level CTAs)
```tsx
<Button className="bg-gradient-to-r from-[#001A4D] to-[#83358E] ... text-white">
```

### Secondary Action (add item, add row)
```tsx
<button className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium hover:bg-[#0E4EBD] flex items-center gap-2">
  <Plus className="w-4 h-4" /> Add Item
</button>
```

### Accent Action (special feature like Student Payables)
```tsx
<button className="px-4 py-2 bg-[#FFC107] text-[#001A4D] rounded-lg text-sm font-bold hover:bg-[#FFD41C] flex items-center gap-2">
```

### Outline / Ghost (secondary, view actions)
```tsx
<Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50">
```

### Destructive (cancel, reject, delete)
```tsx
<Button className="bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white">
```

### Save as Draft
```tsx
<button className="px-6 py-2.5 border border-[#83358E] text-[#83358E] rounded-lg font-medium hover:bg-[#83358E]/5 transition-colors">
  Save as Draft
</button>
```

---

## 7. Toggle / Switch

Admin-controlled toggles use a consistent pattern:

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

Wrap in a row with label:
```tsx
<div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
  <div className="flex-1">
    <div className="flex items-center gap-2 mb-1">
      <label className="font-medium text-gray-900">Feature Name</label>
      <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
    </div>
    <p className="text-sm text-gray-600">Description of what this does.</p>
  </div>
  {/* toggle button here */}
</div>
```

---

## 8. Form Fields

### Text / Number Input
```tsx
<input
  type="text"
  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
    focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
/>
```

### Admin-editable field (special border emphasis)
```tsx
<input
  type="number"
  className="px-2 py-1.5 border-2 border-[#001A4D] rounded text-xs font-medium
    focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
/>
```

### Select / Dropdown
```tsx
<select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
  focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
```

### Combobox (free-text + suggestions)
```tsx
<input type="text" list="suggestions-id" ... />
<datalist id="suggestions-id">
  <option>Option 1</option>
</datalist>
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

Admin-specific upload zone uses violet dashed border:
```tsx
<div className="border-2 border-dashed border-[#83358E] rounded-lg p-8 text-center
  bg-[#83358E]/5 ...">
```

---

## 9. Cards

### Standard Content Card
```tsx
<Card className="border-[#E0E0E0] hover:shadow-md transition-shadow">
  <CardContent className="p-6">
    {/* content */}
  </CardContent>
</Card>
```

### Metric / Stat Cards (4-up grid)
```tsx
<div className="grid grid-cols-2 gap-4">
  {/* Purple gradient */}
  <div className="p-4 bg-gradient-to-br from-[#83358E] to-[#A855F7] rounded-lg text-white">
  {/* Blue gradient */}
  <div className="p-4 bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] rounded-lg text-white">
  {/* Green gradient */}
  <div className="p-4 bg-gradient-to-br from-green-600 to-green-500 rounded-lg text-white">
  {/* Yellow gradient (text is dark) */}
  <div className="p-4 bg-gradient-to-br from-[#FFC107] to-[#FFD41C] rounded-lg">
    <div className="text-[#001A4D]">...
```

Metric card anatomy:
```tsx
<div className="text-sm opacity-90 mb-1">Label</div>
<div className="text-2xl font-bold">Value</div>
```

---

## 10. Tables

```tsx
<div className="border border-gray-200 rounded-lg overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-gray-100">  {/* or bg-gray-50 for lighter variant */}
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
</div>
```

---

## 11. Tabs (page-level)

Uses the shared `Tabs` component from `../../components/ui/tabs`:

```tsx
<Tabs defaultValue="pending">
  <TabsList className="bg-white border border-[#E0E0E0]">
    <TabsTrigger
      value="pending"
      className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white
        data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
    >
      Label
      <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">5</Badge>
    </TabsTrigger>
  </TabsList>
  <TabsContent value="pending" className="space-y-4 mt-6">
    {/* content */}
  </TabsContent>
</Tabs>
```

For inline modal/detail tabs (no external component):
```tsx
<button
  onClick={() => setTab('overview')}
  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
    tab === 'overview'
      ? 'border-[#83358E] text-[#83358E]'
      : 'border-transparent text-gray-500 hover:text-gray-700'
  }`}
>
  Tab Label
</button>
```

---

## 12. Status Badges / Pills

```tsx
{/* Approved / Paid */}
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
  <CheckCircle className="w-3.5 h-3.5" /> Approved
</span>

{/* Pending */}
<Badge className="bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">Pending</Badge>

{/* Rejected / Unpaid */}
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
  <XCircle className="w-3.5 h-3.5" /> Rejected
</span>

{/* Info pill (event type, format) */}
<span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">Label</span>
```

---

## 13. Modals

### Large Wizard Modal (e.g. SAO Event Creation)
```tsx
<div className="fixed inset-0 z-50 overflow-hidden">
  <div className="absolute inset-0 bg-black/50" onClick={onClose} />
  <div className="absolute inset-0 flex items-center justify-center p-4">
    <div className="relative w-full max-w-[1280px] h-[90vh] bg-white rounded-lg shadow-2xl flex flex-col">
      {/* Sticky gradient header */}
      <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 ...">
      {/* Golden progress bar */}
      <div className="h-1 bg-white/20"><div className="h-full bg-[#FFC107]" /></div>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto"><div className="p-6">{step}</div></div>
      {/* Sticky footer */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4 flex justify-between">
        <button>{/* Previous */}</button>
        <div className="flex gap-3">
          <button>{/* Save as Draft */}</button>
          <button>{/* Next Step */}</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Medium Detail/Feature Modal (e.g. EventDetailView, Student Payables)
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="absolute inset-0 bg-black/55" onClick={onClose} />
  <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
    {/* Gradient header */}
    <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-4 ...">
```

### Small Confirmation Modal
```tsx
<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
  {/* Icon */}
  <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
    <CreditCard className="w-7 h-7 text-green-600" />
  </div>
  <h3 className="font-bold text-gray-900 text-lg text-center mb-1">Title</h3>
  <p className="text-gray-500 text-sm text-center mb-5">Description</p>
  <div className="flex gap-3">
    <button className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm">Cancel</button>
    <button className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold">Confirm</button>
  </div>
</div>
```

---

## 14. Multi-Step Form Layout (inside wizard)

All step components use a two-column grid:
```tsx
<div className="grid grid-cols-[1fr_300px] gap-6">
  {/* Left — main form content */}
  <div className="space-y-6">
    {/* sections */}
  </div>
  {/* Right — sticky preview / summary panel */}
  <div>
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
      <h4 className="font-bold text-gray-900 mb-3">Preview Title</h4>
      {/* live preview content */}
    </div>
  </div>
</div>
```

---

## 15. Warning / Alert Banners

```tsx
{/* Warning (yellow) */}
<div className="flex items-start gap-3 p-4 bg-[#FFD41C]/10 border border-[#FFD41C] rounded-lg">
  <AlertCircle className="w-5 h-5 text-[#FFD41C] flex-shrink-0 mt-0.5" />
  <div className="text-sm text-gray-900"><strong>Warning:</strong> Message here.</div>
</div>

{/* Danger (red) */}
<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
  <Lock className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
  <div>
    <div className="font-bold text-red-800 text-sm mb-1">Title</div>
    <p className="text-red-700 text-sm">Description</p>
  </div>
</div>

{/* Info (blue) */}
<div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
  <p className="text-sm text-gray-700">Info message</p>
</div>
```

---

## 16. Icons

All icons use `lucide-react`. Standard sizes:
- `w-4 h-4` — inside buttons, inline with text
- `w-5 h-5` — section icons, nav icons, alert icons
- `w-6 h-6` — authority/banner icons
- `w-8 h-8` — modal header icons

---

## 17. Avatar / Initials

```tsx
{/* Admin blue gradient avatar */}
<div className="w-10 h-10 bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] rounded-full
  flex items-center justify-center text-white font-bold text-sm">
  RL
</div>

{/* Status-colored student avatar (in tables) */}
<div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold
  ${paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
  {initials}
</div>
```

---

## 18. Do Not

- Do **not** use `grid-cols-[720px_320px]` — always use `grid-cols-[1fr_300px]`
- Do **not** use purple/violet (`#83358E`) as the primary page background — it is an accent only
- Do **not** mix officer sidebar patterns (white bg) into admin pages
- Do **not** add sections that are not listed in the step spec — no extra fields without explicit request
- Do **not** use `font-size` Tailwind classes (`text-2xl`, `font-bold`, `leading-none`) without purpose — default typography comes from `theme.css`
