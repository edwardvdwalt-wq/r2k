# HazMat R2K Mobile-First Redesign Strategy

## Overview
Transform from a desktop-centric app to a mobile-first operational field tool. The phone experience should be task-focused, touch-friendly, and offline-capable.

---

## Design Principles

### 1. Mobile-First Approach
- Design for 320px+ phones first
- Scale up elegantly to tablet (768px+) and desktop (1024px+)
- Use progressive enhancement, not graceful degradation

### 2. Task Focus
- One primary task per screen
- Minimize cognitive load
- Clear action hierarchy (primary action = most prominent)

### 3. Touch & Safety
- Minimum 44px tap targets
- Avoid small buttons and dense interactive elements
- Sufficient spacing for gloved fingers (safety context)

### 4. Field Usability
- Offline-first caching
- Fast access to emergency contacts
- Prominent risk badges and hazard info
- Minimal typing required

### 5. Visual Hierarchy
- Large, readable typography (14px+ body on mobile)
- Clear section breaks with whitespace
- Colour-coded risk levels (red=extreme, orange=high, yellow=medium, green=low)
- Icons over text where possible

---

## Responsive Breakpoints

```
Phone:    320px - 639px    (Primary design target)
Tablet:   640px - 1023px   (Optimized layout)
Desktop:  1024px+          (Full-featured layout)
```

---

## Navigation Pattern

### Mobile (Phone)
- **Bottom Navigation Bar** (4-5 primary actions)
  - Home/Dashboard
  - Register (list)
  - Search
  - Documents
  - Profile/Menu
- Floating Action Button (FAB) for "New Entry" (admin only)

### Tablet/Desktop
- Sidebar navigation or top navigation
- Full breadcrumbs

---

## Layout Patterns

### Phone Layout
```
┌─────────────────┐
│  Header/Title   │  (sticky on scroll)
├─────────────────┤
│   Content       │
│   (flexible)    │
├─────────────────┤
│  Primary CTA    │  (sticky at bottom)
└─────────────────┘
```

### Tablet/Desktop Layout
- 2-column or 3-column layouts where appropriate
- Sidebar remains visible
- More whitespace and generous padding

---

## Priority Screens & Refactoring

### 1. HazMat Register List (Mobile)
**Current Problem:** Dense table, horizontal scroll, poor readability
**Solution:** 
- Card-based layout (full-width, stacked)
- Risk badge prominent (color-coded)
- Supplier + Site on secondary line (small text)
- Tap to expand or navigate detail
- Sticky search at top
- Bottom nav for quick filters (All / Top 25 / Extreme)

### 2. Chemical Detail Page (Mobile)
**Current Problem:** Too much info at once, tabs not mobile-friendly
**Solution:**
- Stacked card sections (Overview → Hazards → Composition → SDS → Storage → Emergency)
- Sticky header with product name + risk badge
- Accordion for deep content
- Bottom sheet for emergency contacts
- SDS embedded or linked (not in tab)
- Large tap targets for critical actions

### 3. Search/Results (Mobile)
**Current Problem:** Compressed results, poor filtering
**Solution:**
- Full-screen search input (tap to expand)
- Chips for quick filters (Site, Risk, Top 25)
- Card results with clear hierarchy
- "No results" with Fast Track CTA prominent

### 4. SDS Detail (Mobile)
**Current Problem:** Long pages, hard to navigate sections
**Solution:**
- Section index (sticky tabs or collapsible menu)
- Large readable text (16px+)
- Collapsible sections for each SDS part
- Emergency contact floating at top/bottom
- Printable view

### 5. Documents (Mobile)
**Current Problem:** Grid layout doesn't work on phone
**Solution:**
- List layout by category (Policies, RA Docs, SDS PDFs, Images)
- Collapsible by type
- Download button prominent (44px+ tap target)
- Offline sync indicator

### 6. Emergency Contacts (Mobile)
**Current Problem:** Hidden in detail page, hard to find
**Solution:**
- Dedicated screen accessible from primary nav
- Large phone/email buttons (auto-call, auto-email)
- Site-specific filtering
- Offline-cached and always available

### 7. Add/Edit Material Form (Mobile)
**Current Problem:** Long scrolling form, overwhelming
**Solution:**
- Multi-step form (Basic Info → Hazards → Storage → Supplier)
- Step indicators (1/4, 2/4, etc.)
- Sticky "Next" button at bottom
- Progress persisted locally
- Auto-save drafts

---

## Component Library

### Mobile Components
- **MobileCard** - Full-width card with risk badge, title, subtitle
- **MobileHeader** - Sticky header with back button + title
- **MobileBottomNav** - 4-5 icon-based navigation
- **RiskChip** - Color-coded risk badge (mobile-optimized)
- **MobileSearch** - Full-width search input with clear button
- **MobileActionBar** - Sticky bottom action bar (primary CTA)
- **MobileAccordion** - Touch-friendly accordion
- **MobileSheet** - Bottom sheet modal (emergency contacts, filters)
- **EmergencyButton** - Large phone/email call-to-action
- **FormStep** - Multi-step form section with validation

### Shared Components (Responsive)
- Tabs (mobile: scrollable horizontal tabs, desktop: standard)
- Badge (responsive sizing)
- Input (full-width on mobile, constrained on desktop)
- Button (full-width on mobile by default)

---

## Responsive Design Rules

### Typography
| Context | Phone | Tablet | Desktop |
|---------|-------|--------|---------|
| H1 (Title) | 20px | 24px | 28px |
| H2 (Section) | 16px | 18px | 20px |
| Body | 14px | 14px | 15px |
| Small | 12px | 12px | 13px |
| Buttons | 14px | 14px | 14px |

### Spacing
| Context | Phone | Tablet | Desktop |
|---------|-------|--------|---------|
| Page padding | 16px | 24px | 32px |
| Card padding | 12px | 16px | 16px |
| Gap (items) | 12px | 16px | 16px |
| Section margin | 20px | 24px | 32px |

### Touch Targets
- Minimum 44x44px for all interactive elements
- Spacing: 8px minimum between touch targets
- Buttons: 44px height on mobile, 40px on desktop

### Images
- Pictograms: 48x48px on mobile, 64x64px on tablet
- Section images: Full-width on mobile (max 320px), constrained on desktop
- Card images: 60x60px thumbnail on mobile

---

## Data Density

### Phone
- Show 1 primary piece of info per card
- Use secondary lines sparingly (2 max)
- Hide optional fields (expandable with "More")

### Tablet
- 2-column layouts where appropriate
- Slightly denser info presentation

### Desktop
- Full data density acceptable
- Tables can be used effectively
- 3-column layouts possible

---

## Forms & Input

### Mobile Form Best Practices
1. One field per line
2. Full-width inputs
3. Clear labels above fields
4. Large tap targets (44px minimum)
5. Appropriate keyboard types (tel, email, number)
6. Error messages inline, accessible
7. Sticky "Next"/"Submit" button

### Validation
- Real-time validation (not on blur, on change)
- Clear error states (red border + icon)
- Success states after field completion

---

## Offline Support

### Mobile Priority
1. Emergency contacts (always available)
2. Product details (pictograms, hazards, basic info)
3. SDS sections (critical safety info)
4. Site info + responsible persons
5. Search index (products + sites)

### Sync Strategy
- Automatic sync when online
- Manual refresh button on mobile
- Sync status indicator (top banner)
- Download priority list for offline

---

## Before & After Comparisons

### HazMat Register List
**Before:** Dense table, horizontal scroll on phone, poor readability
**After:** Stacked cards, touch-friendly, color-coded risk, prominent product name

### Chemical Detail
**Before:** 3-4 tabs visible simultaneously, overwhelming
**After:** Collapsed sections, sticky header, one section at a time

### Search
**Before:** Compressed results, hard to filter
**After:** Full-screen search, chip filters, large card results

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Create mobile components library
- Update Tailwind config for mobile-first
- Create responsive layout wrapper
- Mobile bottom nav

### Phase 2: Priority Screens (Week 2-3)
- Refactor HazMat Register list
- Refactor Chemical Detail
- Refactor Search/Results

### Phase 3: Supporting Screens (Week 4)
- SDS detail
- Documents
- Emergency Contacts
- Add/Edit form

### Phase 4: Polish & Testing (Week 5)
- Cross-browser testing
- Offline testing
- Touch/gesture testing
- Performance optimization

---

## Success Metrics

- Mobile bounce rate: < 20% (baseline: 35%)
- Mobile conversion (detail page view): > 45%
- Page load on 4G: < 2s
- Offline availability: 95% of critical screens
- User satisfaction (field feedback): > 4.2/5