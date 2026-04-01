# HazMat R2K Responsive Design Rules

## Core Principles

### Mobile-First (Priority)
1. Design for 320px width first
2. Build features for phone use case
3. Enhance for tablet and desktop
4. Progressive enhancement, not degradation

### Touch-First Interaction
- Minimum 44×44px touch targets
- 8px minimum spacing between targets
- No hover-dependent interactions on mobile
- Clear, large buttons for primary actions

### Content Hierarchy
- One primary action per screen
- Secondary actions less prominent
- Tertiary actions in menus/dropdowns
- Use whitespace aggressively

---

## Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

| Breakpoint | Device | Width | Use Case |
|-----------|--------|-------|----------|
| Default | Phone | 320-639px | Primary design |
| tablet | Tablet | 640-1023px | Split layouts |
| lg | Desktop | 1024px+ | Full layouts |

---

## Typography Scales

### Responsive Font Sizes

```
H1 (Page Title)
  Mobile: 20px / 24px line-height
  Tablet: 24px / 28px
  Desktop: 28px / 32px

H2 (Section Title)
  Mobile: 16px / 22px
  Tablet: 18px / 26px
  Desktop: 20px / 28px

H3 (Card Title)
  Mobile: 14px / 20px
  Tablet: 15px / 22px
  Desktop: 16px / 24px

Body Text
  Mobile: 14px / 21px
  Tablet: 14px / 21px
  Desktop: 15px / 24px

Small / Captions
  Mobile: 12px / 18px
  Tablet: 12px / 18px
  Desktop: 13px / 20px

Button Text
  Mobile: 14px / 20px (bold)
  Tablet: 14px / 20px (bold)
  Desktop: 14px / 20px (bold)
```

### Implementation (Tailwind)

```jsx
// Add to tailwind.config.js
extend: {
  fontSize: {
    // Mobile-first, with responsive scaling
    'h1': ['clamp(20px, 5vw, 28px)', '1.2'],
    'h2': ['clamp(16px, 4vw, 20px)', '1.25'],
    'h3': ['clamp(14px, 3vw, 16px)', '1.3'],
    'body': ['14px', '1.5'],
    'small': ['12px', '1.5'],
  }
}

// Usage
<h1 className="text-h1 font-bold">Title</h1>
<p className="text-body text-muted-foreground">Body</p>
```

---

## Spacing System

### Consistent Spacing

| Size | Token | Phone | Tablet | Desktop |
|------|-------|-------|--------|---------|
| xs | 2px | 2px | 2px | 2px |
| sm | 4px | 4px | 4px | 4px |
| md | 8px | 8px | 8px | 8px |
| lg | 12px | 12px | 16px | 16px |
| xl | 16px | 16px | 20px | 24px |
| 2xl | 20px | 20px | 24px | 32px |
| 3xl | 24px | 24px | 32px | 40px |

### Page Padding

```jsx
{/* Mobile: 12px, Tablet: 20px, Desktop: 32px */}
<div className="px-3 md:px-5 lg:px-8">
```

### Gap Between Items

```jsx
{/* Mobile: 12px, Tablet: 16px, Desktop: 16px */}
<div className="space-y-3 md:space-y-4">
```

### Section Margins

```jsx
{/* Mobile: 20px top/bottom, Tablet: 24px, Desktop: 32px */}
<section className="py-5 md:py-6 lg:py-8">
```

---

## Touch Targets & Interactions

### Minimum Size
- Buttons: 44×44px (mobile), 40×40px (desktop)
- Links: 44×44px minimum tap area
- Form inputs: 44px height (mobile), 40px (desktop)
- Checkboxes: 20px, with 16px padding around

### Spacing
- Minimum 8px between interactive elements
- Increase to 12px on mobile for gloved fingers (safety context)

### Implementation

```jsx
// Button
<button className="h-11 px-4 md:h-10">Action</button>

// Input
<input className="h-11 px-3 md:h-10" />

// Card (full button)
<button className="h-auto px-4 py-3 md:py-4">
  Content
</button>
```

---

## Layout Patterns

### Mobile (Phone)

#### Full-Screen Stack
```
┌─────────────────┐
│ Header (sticky) │  44px
├─────────────────┤
│ Content         │  flex-1
│ (scrollable)    │
├─────────────────┤
│ Action (sticky) │  56px
└─────────────────┘
```

#### Card List
```
┌─────────────────┐
│ [Card 1]        │  100% width
├─────────────────┤
│ [Card 2]        │  12px gap
├─────────────────┤
│ [Card 3]        │
└─────────────────┘
```

### Tablet (640px+)

#### Two-Column
```
┌─────────────────────────────────┐
│ Header                          │
├─────────────────────────────────┤
│ [Card 1] | [Card 2]             │  48% width each
│ [Card 3] | [Card 4]             │  16px gap
└─────────────────────────────────┘
```

#### Sidebar + Content
```
┌──────────────┬──────────────────┐
│ Sidebar      │ Main Content     │
│ (fixed or    │ (scrollable)     │
│  sticky)     │                  │
└──────────────┴──────────────────┘
```

### Desktop (1024px+)

#### Three-Column Grid
```
┌──────────────┬──────────────┬──────────────┐
│ Card 1       │ Card 2       │ Card 3       │
│ 32% width    │ 32% width    │ 32% width    │
├──────────────┼──────────────┼──────────────┤
│ Card 4       │ Card 5       │ Card 6       │
└──────────────┴──────────────┴──────────────┘
```

#### Max-Width Content
```
┌─────────────────────────────────┐
│ Sidebar │ Content              │
│         │ (max: 900px)         │
│         │ Centered + padded    │
└─────────────────────────────────┘
```

---

## Components Responsive Behavior

### Cards

```jsx
// Phone: Full-width, stacked
// Tablet: 48% width, 2 columns
// Desktop: 32% width, 3 columns

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card />
</div>
```

### Images

```jsx
// Phone: Full-width (max 320px)
// Tablet: Constrained (max 600px)
// Desktop: Full container

<img className="w-full md:max-w-2xl lg:max-w-4xl" />
```

### Pictograms (Icons in Cards)

```jsx
// Phone: 40×40px
// Tablet: 60×60px
// Desktop: 80×80px

<img className="w-10 h-10 md:w-16 md:h-16 lg:w-20 lg:h-20" />
```

### Tables

```jsx
// Phone: Convert to card/list layout
// Tablet: Horizontal scrollable
// Desktop: Full table

{/* Mobile: Card layout */}
<div className="block md:hidden">
  {data.map(row => <Card data={row} />)}
</div>

{/* Tablet+: Table */}
<table className="hidden md:table">
</table>
```

### Forms

```jsx
// Phone: Full-width fields, stacked
// Tablet+: 2-column layout

<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <input className="col-span-1" />
  <input className="col-span-1" />
</div>
```

---

## Navigation Patterns

### Mobile Bottom Navigation

```jsx
// Fixed at bottom, 4-5 items
// Icons + labels, 56px height

<nav className="fixed bottom-0 h-14 flex">
  {navItems.map(item => (
    <button className="flex-1 flex flex-col items-center gap-1 text-xs">
      {icon}
      {label}
    </button>
  ))}
</nav>

// Content padding to avoid overlap
<main className="pb-20">
```

### Tablet/Desktop Sidebar

```jsx
// Hidden on mobile (md:hidden)
// Visible on tablet+ (hidden md:block)
// Sticky or fixed

<aside className="hidden md:block md:w-64 md:sticky md:top-0">
  Nav
</aside>
```

---

## Safe Areas & Notches

### iPhone Notch & Safe Areas

```jsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// For web, use CSS env()
<header className="pt-[env(safe-area-inset-top)]">

// Or Tailwind
<header className="pt-safe">
```

### Bottom Safe Area

```jsx
// Add padding to fixed bottom elements
<nav className="pb-[env(safe-area-inset-bottom)]">
```

---

## Accessibility

### Color Contrast
- Normal text: 4.5:1 minimum (WCAG AA)
- Large text (18px+): 3:1 minimum
- Risk badges must not rely on color alone

### Focus States
```jsx
<button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
```

### Touch Target Sizes
- All interactive elements: 44×44px minimum
- Spacing: 8px+ between targets

### Text Readability
- Line height: 1.5 or greater (21px for 14px text)
- Max line length: 50-75 characters (not a hard constraint)
- Don't disable text resize

---

## Performance & Data Density

### Mobile Data Strategy

```
Phone:
  - Show essentials only
  - Use "Expand" / "More" for optional data
  - One action per card

Tablet:
  - Balance info and space
  - 2-column layouts acceptable
  - 2-3 actions per card

Desktop:
  - Full data density possible
  - Tables effective
  - Multiple actions, rich layouts
```

### Image Optimization

```jsx
// Use srcset for responsive images
<img
  src="image-640.jpg"
  srcSet="image-320.jpg 320w, image-640.jpg 640w, image-1200.jpg 1200w"
  sizes="(max-width: 640px) 320px, (max-width: 1024px) 640px, 1200px"
/>

// Or use picture element
<picture>
  <source media="(min-width: 1024px)" srcSet="image-lg.jpg" />
  <source media="(min-width: 640px)" srcSet="image-md.jpg" />
  <img src="image-sm.jpg" alt="" />
</picture>
```

---

## Testing Checklist

### Mobile (320px)
- [ ] No horizontal scroll
- [ ] Buttons 44×44px+
- [ ] Text readable (14px+)
- [ ] Touch targets spaced 8px+
- [ ] Forms: one field per line
- [ ] Images: optimized file size
- [ ] Offline mode works
- [ ] Bottom nav accessible

### Tablet (640px)
- [ ] 2-column layouts work
- [ ] Images not oversized
- [ ] Forms: 2 columns acceptable
- [ ] Sidebar visible/accessible
- [ ] Touch targets still 40px+

### Desktop (1024px+)
- [ ] 3-column layouts work
- [ ] Max-width constraints (900px-1200px)
- [ ] Sidebar always visible
- [ ] Dense data acceptable
- [ ] Whitespace adequate

### Cross-Browser
- [ ] Chrome/Chromium
- [ ] Safari (iOS)
- [ ] Firefox
- [ ] Samsung Internet (Android)

---

## Common Pitfalls to Avoid

❌ **Don't:**
- Hide content without clear "show more" button
- Use hover-dependent interactions
- Design fixed widths (use %/vw instead)
- Rely on color alone for meaning
- Use small fonts (< 14px on mobile)
- Create overflow-x: auto (horizontal scroll)
- Put critical actions in dropdowns (mobile)
- Design tablets as scaled phones
- Forget safe areas on notched devices
- Use rem without mobile-first base

✅ **Do:**
- Test on real devices regularly
- Use mobile-first CSS media queries
- Provide clear touch targets (44×44px)
- Use semantic HTML
- Support keyboard navigation
- Cache critical offline content
- Provide feedback for all actions
- Use progressive enhancement
- Design for the worst network
- Optimize images for mobile