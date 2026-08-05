# Soft Feminine Premium App Redesign System

## Purpose

This document is the complete product-design and implementation guide for redesigning the entire app around the **Soft Feminine Premium** visual direction shown in the supplied reference image.

The goal is not to make the product simply “pink.” The goal is to make it feel like a private emotional keepsake: a mixture of a premium journal, a scrapbook, a sealed letter, a memory box, and a gentle nightly ritual.

The redesigned app should feel:

- intimate
- warm
- premium
- emotionally meaningful
- collectible
- tactile
- calm
- feminine without becoming childish
- polished enough for a high-end consumer app

The app should never resemble a generic habit tracker, analytics dashboard, admin interface, or AI-generated template.

---

# 1. Product Concept

The app asks the user one meaningful question each night.

The user records a short voice response within a limited recording window. Once the response is submitted, it becomes sealed. The user cannot replay, edit, redo, or immediately inspect it.

Across the cycle, the app quietly collects these sealed entries. At the end of the cycle, the app unlocks a reflective experience showing emotional shifts, recurring themes, changes in language, meaningful excerpts, and evidence of personal growth.

The design should reinforce four emotional ideas:

1. **Ritual** — every night should feel like opening a private journal.
2. **Sealing** — every response becomes a preserved moment.
3. **Collection** — each completed night adds something beautiful and meaningful.
4. **Revelation** — the final reflection should feel earned, intimate, and emotionally significant.

---

# 2. Core Design Direction

## Theme Name

**Soft Feminine Premium**

## Visual Metaphor

A premium scrapbook and sealed memory journal.

## Primary Progress Mechanic

Replace generic progress squares with a **30-night sticker sheet**.

Each completed night adds a collectible sticker, emblem, stamp, or sealed token. Future nights appear as faint embossed placeholders. The current night glows softly and feels ready to be completed.

The page should feel like the user is gradually filling a meaningful keepsake rather than completing a productivity grid.

## Emotional Tone

The interface should feel like:

- handmade paper
- a handwritten letter
- pressed flowers
- a wax seal
- a private diary
- rose-gold stationery
- an intimate nighttime routine

---

# 3. Design Principles

## 3.1 Meaning before decoration

Every decorative element should support the emotional concept.

Use:

- stickers to represent completed nights
- envelopes to represent sealed thoughts
- flowers to represent growth
- moons and stars to represent nighttime reflection
- wax seals to represent permanence
- ribbons and bows to represent keepsakes
- scrapbook layers to represent accumulated memories

Avoid random gradients, generic glassmorphism, neon effects, or decorative objects that have no relationship to the product story.

## 3.2 Premium, not cute

The app can be feminine and expressive without becoming childish.

Use:

- restrained blush tones
- dusty rose instead of bright pink
- warm cream instead of pure white
- muted plum instead of black
- antique gold instead of yellow
- elegant serif typography
- delicate paper textures

Avoid:

- bubblegum pink
- cartoon mascots
- oversaturated pastel rainbows
- oversized hearts everywhere
- excessive sparkles
- sticker packs that feel juvenile

## 3.3 Tactile depth

The UI should feel layered and physical.

Create depth through:

- subtle paper grain
- soft drop shadows
- embossed placeholder shapes
- torn-paper edges
- layered cards
- delicate tape strips
- wax-seal details
- gentle highlight gradients

The tactile effect must remain subtle. It should feel refined, not skeuomorphic or cluttered.

## 3.4 Emotional restraint

The app should guide reflection without making exaggerated mental-health claims.

Use language such as:

- “You began speaking more about what comes next.”
- “This theme appeared more often near the end of your month.”
- “Your words became gentler toward yourself.”

Avoid definitive claims such as:

- “You are healed.”
- “You overcame your trauma.”
- “You are no longer depressed.”

---

# 4. Color System

## 4.1 Core Colors

```css
:root {
  --background-primary: #F8EFE7;
  --background-secondary: #FFF9F4;
  --surface-primary: #FFFDF9;
  --surface-secondary: #F4E6DE;
  --surface-paper: #F9F0E8;

  --text-primary: #4A2635;
  --text-secondary: #765263;
  --text-muted: #A98794;
  --text-inverse: #FFF9F4;

  --blush-100: #FCE8E8;
  --blush-200: #F6D5D8;
  --blush-300: #EFBCC3;
  --rose-400: #D88C99;
  --rose-500: #BE6F7C;
  --rose-600: #9B5665;

  --plum-500: #6C4052;
  --plum-600: #563144;
  --plum-700: #3F2233;

  --gold-300: #E4C27A;
  --gold-400: #CFA557;
  --gold-500: #B88635;

  --success-soft: #DCE9DF;
  --warning-soft: #F5E5BE;
  --error-soft: #F3D3D3;

  --border-soft: rgba(102, 67, 80, 0.12);
  --border-medium: rgba(102, 67, 80, 0.22);
  --shadow-soft: rgba(82, 48, 62, 0.10);
  --shadow-medium: rgba(82, 48, 62, 0.16);
  --glow-rose: rgba(216, 140, 153, 0.34);
  --glow-gold: rgba(207, 165, 87, 0.30);
}
```

## 4.2 Color Usage

### Background

Use warm ivory or cream. Never use pure white as the main page background.

### Text

Use muted plum as the primary text color. Avoid pure black.

### Primary action

Use dusty rose or muted plum depending on contrast.

### Highlight and progress

Use rose-gold and antique gold sparingly.

### Glow

Glow effects should be soft, blurred, and low-opacity. Never use harsh neon.

---

# 5. Typography System

## 5.1 Font Personality

Use two families:

1. An elegant editorial serif for emotional headings and month titles.
2. A clean modern sans serif for labels, controls, navigation, and body content.

Suggested combinations:

- Instrument Serif + Inter
- Cormorant Garamond + Manrope
- DM Serif Display + DM Sans
- Playfair Display + Inter
- Libre Baskerville + Plus Jakarta Sans

## 5.2 Recommended Scale

```css
--font-display-xl: clamp(4rem, 12vw, 7rem);
--font-display-lg: clamp(3rem, 9vw, 5.25rem);
--font-heading-1: clamp(2rem, 6vw, 3rem);
--font-heading-2: 1.75rem;
--font-heading-3: 1.35rem;
--font-body-lg: 1.125rem;
--font-body-md: 1rem;
--font-body-sm: 0.875rem;
--font-label: 0.75rem;
```

## 5.3 Typography Rules

### Month title

- serif
- large
- high line-height control
- deep plum
- elegant and spacious

### Labels

- uppercase
- letter spacing between 0.18em and 0.28em
- small size
- rose or muted plum

### Question text

- serif
- emotionally prominent
- centered or left-aligned depending on screen
- never cramped

### Body copy

- clean sans serif
- comfortable line length
- avoid overly light text weights

---

# 6. Spacing and Layout

Use an 8-point spacing system.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 40px;
--space-8: 48px;
--space-9: 64px;
--space-10: 80px;
```

## Layout Rules

- use generous breathing room
- maintain strong vertical rhythm
- avoid overpacking the sticker board
- use edge padding between 20px and 28px on mobile
- use larger page margins on tablet and desktop
- allow decorative scrapbook elements to slightly break card boundaries
- keep essential interaction targets unobstructed

---

# 7. Shape Language

## Border Radius

```css
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 24px;
--radius-xl: 32px;
--radius-pill: 999px;
```

## Surface Style

Cards should use:

- warm cream backgrounds
- subtle 1px borders
- soft shadows
- occasional paper grain overlays
- slightly imperfect torn-paper layers only on decorative surfaces

Interactive controls should remain clean and predictable.

---

# 8. Shadow and Glow System

```css
--shadow-card:
  0 12px 30px rgba(82, 48, 62, 0.10),
  0 3px 8px rgba(82, 48, 62, 0.06);

--shadow-floating:
  0 18px 45px rgba(82, 48, 62, 0.16),
  0 6px 16px rgba(82, 48, 62, 0.08);

--glow-current:
  0 0 0 2px rgba(255, 255, 255, 0.78),
  0 0 18px rgba(216, 140, 153, 0.52),
  0 0 34px rgba(207, 165, 87, 0.24);
```

## Glow Rules

Use glow only for:

- current night
- active recording state
- newly earned sticker
- final unlock moment
- primary button hover or press response

Avoid glowing every card or decorative object.

---

# 9. Paper and Texture System

## Texture Types

- warm paper grain
- light watercolor blush
- faint torn-paper edges
- pressed flower overlays
- embossed outlines
- subtle translucent tape

## Texture Rules

- opacity should usually remain between 2% and 9%
- do not reduce text readability
- do not use photographic textures at full opacity
- textures should create warmth, not visual noise

A CSS paper grain can be implemented with a tiny repeating noise image or a low-opacity SVG filter.

---

# 10. Sticker System

## 10.1 Sticker Categories

Create a consistent sticker library based on emotional symbolism.

### Night and reflection

- crescent moon
- stars
- constellation
- tiny night cloud
- lantern

### Growth

- pressed flower
- blooming flower
- sprig
- leaf branch
- seedling

### Sealed memory

- envelope
- wax seal
- ribbon
- journal
- small key

### Comfort and tenderness

- heart
- bow
- warm cup
- pillow cloud
- tiny home

### Journey

- compass
- stepping stones
- path
- suitcase
- little map

## 10.2 Sticker States

### Completed

- full color
- dimensional shadow
- slight paper texture
- subtle highlight

### Current

- illuminated ring
- tiny breathing glow
- gentle floating motion
- no aggressive pulse

### Future

- embossed or debossed outline
- low contrast
- no fill
- feels physically pressed into paper

### Newly earned

- enters with a soft scale-up
- rotates by 1 to 3 degrees
- settles with a small spring
- emits a brief dusting of gold particles

## 10.3 Sticker Assignment

For the MVP, sticker order can be predetermined.

For a later version, sticker selection can reflect:

- the question category
- the dominant theme in the transcript
- the day number
- the user’s selected sticker pack

Never infer sensitive diagnoses or assign alarming symbols automatically.

---

# 11. Motion System

Motion should feel delicate, soft, and purposeful.

## 11.1 Global Motion Values

```css
--duration-fast: 140ms;
--duration-normal: 240ms;
--duration-slow: 420ms;
--duration-ceremonial: 900ms;

--ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-gentle: cubic-bezier(0.16, 1, 0.3, 1);
```

## 11.2 Required Animations

### Page entrance

- fade in from 0 to 1
- translate vertically from 8px to 0
- duration around 420ms
- stagger the header, sticker sheet, question card, and navigation

### Current-night glow

- slow breathing glow between 90% and 100% intensity
- 3.5 to 5 second loop
- no sharp pulse

### Sticker hover

Desktop only:

- lift by 2px
- rotate by 0.5 to 1 degree
- strengthen shadow
- transition around 180ms

### Sticker completion

- scale from 0.72 to 1.04 to 1
- rotate from -3deg to 1deg to 0deg
- brief golden dust particles
- duration 650 to 900ms

### Question card hover or tap

- background brightens slightly
- icon shifts 1 to 2px
- card lifts slightly
- no dramatic scaling

### Recording state

- central microphone aura slowly expands and contracts
- waveform moves smoothly
- background decorative particles drift very slowly
- timer remains stable and easy to read

### Sealing transition

- recording waveform folds or fades inward
- a circular wax-seal mark closes over the entry
- warm light contracts into the seal
- short text appears: “Sealed for later”
- total duration around 900ms to 1.4s

### Final unlock

- paper layers gently separate
- blurred content resolves into focus
- stickers shimmer once
- no confetti explosion

## 11.3 Reduced Motion

Respect `prefers-reduced-motion`.

When enabled:

- remove looping glow animation
- replace spring motion with fades
- disable particle drift
- keep essential state changes immediate and clear

---

# 12. Homepage Specification

## Header

Display:

- centered cycle progress label such as `NIGHT 2 OF 30`
- large month name
- small recorded-night count
- settings button in the upper-right corner

The header should feel spacious and editorial.

## Sticker Sheet

The dominant surface on the page.

Requirements:

- 30 sticker positions
- 6 columns by 5 rows on larger mobile screens, or responsive 5-column arrangement when needed
- 1 completed sticker
- current-night sticker highlighted
- future slots embossed into paper
- small day numbers under each item
- scrapbook-paper container with layered edges
- one or two restrained decorative objects such as dried flowers, tape, or a clip

The board must remain scannable and should not become visually busy.

## Tonight’s Question Card

Requirements:

- warm cream background
- large rounded corners
- subtle shadow
- small journal or book illustration
- uppercase label
- prominent serif question
- clear tap affordance

The entire card should be clickable.

## Sync Status

Use warm gold for noncritical backup status.

Example:

`1 night waiting to back up.`

The icon should be soft and non-alarming.

## Bottom Navigation

Use a floating rounded pill.

Recommended tabs:

- Gallery
- Light Map

Use custom line icons with rounded edges. Active states should use a filled dusty-rose icon or a warm highlight under the label.

---

# 13. Theme Architecture

The app should support future purchasable themes, but the first release should ship with one highly polished theme.

## Theme Object

```ts
export interface AppTheme {
  id: string;
  name: string;
  description: string;
  isPremium: boolean;
  colors: {
    backgroundPrimary: string;
    backgroundSecondary: string;
    surfacePrimary: string;
    surfaceSecondary: string;
    textPrimary: string;
    textSecondary: string;
    accentPrimary: string;
    accentSecondary: string;
    accentMetallic: string;
    border: string;
    glow: string;
  };
  typography: {
    displayFont: string;
    interfaceFont: string;
  };
  progressStyle:
    | "sticker-sheet"
    | "wax-seals"
    | "flower-garden"
    | "constellation"
    | "minimal-stamps";
  texturePreset: "paper" | "night" | "linen" | "minimal";
  stickerPackId?: string;
  motionPreset: "soft" | "dreamy" | "minimal";
}
```

## Initial Theme

```ts
const softFemininePremium: AppTheme = {
  id: "soft-feminine-premium",
  name: "Soft Keepsake",
  description: "Warm paper, blush tones, rose-gold details, and collectible nightly stickers.",
  isPremium: false,
  colors: {
    backgroundPrimary: "#F8EFE7",
    backgroundSecondary: "#FFF9F4",
    surfacePrimary: "#FFFDF9",
    surfaceSecondary: "#F4E6DE",
    textPrimary: "#4A2635",
    textSecondary: "#765263",
    accentPrimary: "#BE6F7C",
    accentSecondary: "#EFBCC3",
    accentMetallic: "#CFA557",
    border: "rgba(102, 67, 80, 0.12)",
    glow: "rgba(216, 140, 153, 0.34)"
  },
  typography: {
    displayFont: "Instrument Serif",
    interfaceFont: "Inter"
  },
  progressStyle: "sticker-sheet",
  texturePreset: "paper",
  stickerPackId: "keepsake-classics",
  motionPreset: "soft"
};
```

## Future Theme Examples

### Moonlight Archive

- deep plum and midnight navy
- constellation progress map
- silver and lavender glow
- premium theme

### Healing Garden

- warm cream and muted sage
- flower-growth progress system
- petals appear each night
- premium theme

### Love Letters

- ivory, deep burgundy, and rose gold
- wax seals and envelopes
- premium theme

### Minimal Journal

- off-white, charcoal, beige
- clean stamp progress system
- free alternative theme

---

# 14. Screen-by-Screen Rebranding Guidance

## Onboarding

The onboarding should feel like opening a private journal.

Use:

- full-screen cream backgrounds
- one key illustration per screen
- editorial headings
- short supportive copy
- subtle page-turn transitions
- progress dots styled as tiny seals or petals

Suggested onboarding sequence:

1. **A question each night**
2. **Speak once, honestly**
3. **Your answer is sealed**
4. **Time reveals the story**

## Notification Permission

Show a gentle illustration of a moon, envelope, or bedside journal.

Copy should emphasize ritual rather than urgency.

Example:

“Choose a quiet time for your nightly question.”

## Pre-Recording Question Screen

Requirements:

- one large centered question
- soft floating paper card
- hold-to-speak button
- current-day sticker visible as a small contextual accent
- subtle animated glow around the microphone control
- calm instructions

## Recording Screen

Requirements:

- minimal distractions
- large timer
- soft waveform
- microphone halo
- question remains visible in small text
- stop or hold interaction must be obvious
- no decorative clutter near controls

## Recording Complete / Sealing Screen

Requirements:

- show the answer becoming a sealed token
- wax-seal animation
- confirmation copy such as `Sealed for later`
- no playback button
- no retry button unless product rules explicitly allow it

## Gallery

This is not an audio playback gallery.

It should show:

- sealed monthly collections
- completed sticker sheets
- locked reflection books
- month and year
- completion status

Each month should look like a keepsake cover.

## Light Map

The Light Map should visualize patterns without feeling like analytics software.

Use:

- soft constellations
- glowing emotional themes
- connected words or motifs
- blurred transitions
- graceful labels

Avoid charts that resemble dashboards unless they are styled very gently.

## Final Reflection / Unlock

Use sections such as:

- The beginning
- What kept appearing
- The turning point
- What changed
- Words you returned to
- A note to your future self

The output should feel like a beautifully written private reflection, not an automated report.

## Settings

Use grouped paper cards.

Sections:

- nightly reminder
- privacy
- recording preferences
- theme
- sticker pack
- account
- data export
- delete account

Keep the settings screen visually simpler than the homepage.

## Theme Store

The theme store should feel curated, not like a gaming cosmetics marketplace.

Each theme card should show:

- preview image
- name
- one-sentence mood description
- progress metaphor
- price or included badge

Use tasteful language such as:

- Included
- Part of Premium
- One-time purchase

Avoid fake scarcity, countdown timers, or manipulative pricing tactics.

---

# 15. Accessibility Requirements

- maintain WCAG AA contrast for text and controls
- do not rely on color alone to show completed/current/future states
- support dynamic text sizing
- maintain tap targets of at least 44 by 44 pixels
- add semantic labels to decorative icons
- mark purely decorative scrapbook details as hidden from screen readers
- support reduced motion
- ensure embossed future slots remain visible in high-contrast mode
- do not place text directly over noisy paper textures

---

# 16. Implementation Notes for Codex

## Recommended Stack

Adapt this to the existing codebase. For a Next.js implementation, prefer:

- Next.js App Router
- TypeScript
- Tailwind CSS or CSS Modules
- Framer Motion for controlled motion
- Lucide or custom SVG icons
- CSS variables for theme tokens
- local or optimized web fonts

## Component Architecture

```txt
components/
  layout/
    AppShell.tsx
    BottomNavigation.tsx
    PageHeader.tsx

  journal/
    StickerSheet.tsx
    StickerSlot.tsx
    NightSticker.tsx
    TonightQuestionCard.tsx
    BackupStatus.tsx
    RecordingButton.tsx
    RecordingWaveform.tsx
    SealingTransition.tsx

  themes/
    ThemeProvider.tsx
    ThemePreviewCard.tsx
    ThemeStore.tsx
    StickerPackPreview.tsx

  decorative/
    PaperTexture.tsx
    PressedFlowers.tsx
    WashiTape.tsx
    WaxSeal.tsx
    GoldSparkles.tsx
```

## State Examples

```ts
type NightStatus = "completed" | "current" | "future" | "missed";

interface NightProgressItem {
  day: number;
  status: NightStatus;
  stickerId?: string;
  questionId?: string;
  recordedAt?: string;
  backupStatus?: "synced" | "pending" | "failed";
}
```

## Rendering Rules

- centralize theme values in CSS variables
- avoid hardcoded colors inside components
- use data-driven sticker rendering
- preserve identical layout structure across themes
- allow theme-specific progress components
- lazy-load heavy decorative assets
- use SVG where possible
- use optimized WebP or AVIF for texture assets

---

# 17. Animation Implementation Examples

## Current Sticker Glow

```tsx
<motion.div
  animate={{
    boxShadow: [
      "0 0 10px rgba(216,140,153,0.22)",
      "0 0 24px rgba(216,140,153,0.48)",
      "0 0 10px rgba(216,140,153,0.22)"
    ],
    y: [0, -1.5, 0]
  }}
  transition={{
    duration: 4.2,
    repeat: Infinity,
    ease: "easeInOut"
  }}
/>
```

## Newly Earned Sticker

```tsx
<motion.div
  initial={{ scale: 0.72, rotate: -3, opacity: 0 }}
  animate={{ scale: [0.72, 1.05, 1], rotate: [-3, 1, 0], opacity: 1 }}
  transition={{ duration: 0.75, ease: [0.34, 1.56, 0.64, 1] }}
/>
```

## Question Card Entrance

```tsx
<motion.button
  initial={{ opacity: 0, y: 14 }}
  animate={{ opacity: 1, y: 0 }}
  whileHover={{ y: -2 }}
  whileTap={{ scale: 0.992 }}
  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
/>
```

---

# 18. Image-Generation Prompt Used for the Reference Direction

Use the following prompt to regenerate or extend the visual direction:

```text
Create a high-fidelity mobile app homepage mockup for a reflective voice-journaling app. Show a single full-screen app UI in portrait orientation, as if it were a polished product design shot. The page should feel like a premium, feminine, emotionally resonant redesign of the user’s current homepage.

Theme: soft feminine premium. Use a beautiful palette of warm ivory, blush pink, dusty rose, soft cream, subtle gold accents, and muted plum text. The overall aesthetic should feel like a private keepsake journal or scrapbook, not a habit tracker. Elegant, warm, and premium, with subtle paper textures, soft shadows, delicate glow, and a calm romantic atmosphere.

Core concept to visualize: each completed night adds a meaningful sticker or stamp instead of a generic colored square. Replace the old square grid with a large “sticker sheet” or “memory sheet” section. This sticker sheet should contain 30 positions arranged in a neat but charming scrapbook-like layout. Some positions are filled with beautiful collectible stickers, some are empty embossed placeholder outlines, and the current night is softly highlighted. Use a mix of meaningful sticker motifs such as a moon, a pressed flower, a tiny heart seal, a star, a ribbon, a little envelope, a cloud, a bow, or a wax-stamp-like seal. Keep them elegant and cohesive, not childish.

Screen content and structure:
- Top center small label: “NIGHT 2 OF 30”.
- Top left main heading: “August” with a smaller sublabel like “1 RECORDED NIGHT”.
- Top right a tasteful settings icon.
- Main central section: a rounded scrapbook-paper or soft card area containing the sticker sheet progress board. Show one completed sticker, a second sticker spot as today’s highlighted current position with a soft glowing outline, and the remaining sticker positions as faint embossed placeholders. The sticker board should be visually rich and charming.
- Below that, a prominent rounded cream question card with a small book/journal icon on the left and the title “Tonight’s question”.
- Under the card, show the question text: “What did you notice on the way home?”
- Add a small status line such as “1 night waiting to back up.” in a subtle gold or warm accent.
- At the bottom, show a premium simple navigation bar with two items: “Gallery” and “Light Map”, each with elegant icons.

Design notes:
- The page must feel more meaningful than the original dark square-grid version.
- Make it visually appealing to users who like soft premium feminine aesthetics.
- Keep typography refined and editorial, mixing an elegant serif for the month title with a clean modern sans or mono-style label text.
- Preserve the feeling of a nighttime ritual and emotional reflection, but expressed through a lighter, softer, more collectible visual language.
- Make the layout look like a believable modern app screen, polished enough for Dribbble or a startup pitch deck.
```

---

# 19. Master Codex Prompt

Copy the prompt below into Codex together with the reference image and this design-system file.

```text
You are redesigning an existing reflective voice-journaling application using the attached reference image and the supplied design-system markdown file.

Your task is to rebrand the entire application into the “Soft Feminine Premium” design language without breaking the existing product logic, routes, data flow, authentication, recording behavior, storage, or backend integrations.

First, inspect the entire codebase and identify:

1. every route and screen
2. every reusable component
3. all current design tokens
4. inconsistent spacing, typography, borders, colors, and interaction patterns
5. all user states, loading states, empty states, error states, and success states
6. all desktop, tablet, and mobile breakpoints
7. all recording, sealing, backup, progress, theme, and reflection-related flows

Then create a clear migration plan before changing code.

The new visual direction must match the supplied reference image:

- warm ivory and cream surfaces
- dusty rose, blush, muted plum, and antique-gold accents
- refined editorial serif headings
- clean modern sans-serif interface text
- layered premium paper surfaces
- subtle paper grain and watercolor washes
- soft rounded cards
- delicate pressed flowers, tape, wax seals, and scrapbook details used sparingly
- meaningful collectible stickers instead of generic progress squares
- embossed placeholders for future nights
- a softly glowing current-night sticker
- subtle shadows and tactile depth
- premium feminine styling without becoming childish

Do not merely recolor the existing UI. Rebuild the visual hierarchy and component styling so the app feels intentionally designed around a private keepsake journal and nightly emotional ritual.

Core homepage requirements:

- preserve the month title and cycle progress
- replace all plain progress squares with a 30-night sticker sheet
- completed nights display collectible stickers
- the current night has a soft breathing rose-gold glow
- future nights appear as subtle embossed outlines
- the question card should feel like a premium paper journal card
- preserve backup status and navigation
- ensure the entire page is responsive and practical on real mobile devices

Create a reusable theme architecture using CSS variables or theme tokens. Do not hardcode theme-specific values throughout individual components. Build the system so future purchasable themes can swap:

- colors
- typography
- textures
- sticker packs
- progress visualization style
- motion preset

The first theme must be called “Soft Keepsake” and use the sticker-sheet progress style.

Add subtle, production-quality animations:

- page elements softly fade and rise into place
- the current-night sticker has a slow breathing glow
- newly completed stickers scale and settle with a gentle spring
- question cards lift slightly on hover and compress subtly on tap
- decorative sparkles drift minimally
- the recording control has a calm expanding aura
- the sealing transition visually closes the recording into a wax seal
- the final reflection unlocks through layered paper and focus transitions

Animations must never feel flashy, bouncy, distracting, or game-like. Respect `prefers-reduced-motion` and provide a reduced-motion fallback.

Accessibility requirements:

- meet WCAG AA contrast
- maintain at least 44px touch targets
- do not rely on color alone for state
- support keyboard navigation
- use semantic HTML
- label all controls properly
- hide decorative assets from assistive technologies
- maintain readable text over all textures

Technical requirements:

- preserve all existing functionality
- use TypeScript strictly
- prefer reusable components over duplicated markup
- centralize tokens
- add loading, empty, offline, backup-pending, backup-failed, recording, recorded, sealed, and completed-cycle states
- optimize decorative images and textures
- use SVG icons where practical
- avoid unnecessary dependencies
- do not introduce layout shifts
- maintain strong performance on mid-range phones

For each major screen, align it with the same design system:

- onboarding
- notification permission
- home
- pre-recording question
- active recording
- recording complete
- sealing transition
- gallery
- light map
- final reflection
- settings
- theme picker/store
- authentication
- error and empty states

Before implementation, produce:

1. a route-by-route audit
2. a component migration plan
3. the design-token architecture
4. the animation plan
5. the file changes you expect to make

Then implement the redesign incrementally. After each major section, verify that the app still works and that no existing behavior was broken.

Use the attached reference image as the source of truth for mood, spacing, texture, hierarchy, and emotional tone. Do not copy any accidental image-generation imperfections literally. Convert the reference into a clean, practical, production-ready design system.
```

---

# 20. Quality Checklist

Before marking the redesign complete, confirm:

- [ ] The app no longer looks like a generic habit tracker.
- [ ] Progress is represented by meaningful stickers, seals, flowers, or theme-specific objects.
- [ ] The default theme feels premium, soft, and emotionally resonant.
- [ ] Pink is used tastefully rather than as a blanket recolor.
- [ ] Typography is consistent across all screens.
- [ ] All screens use the same spacing and radius system.
- [ ] Animations are subtle and respect reduced-motion preferences.
- [ ] The recording experience remains clear and distraction-free.
- [ ] The sealing interaction feels meaningful.
- [ ] The final reflection feels like a reveal rather than a dashboard report.
- [ ] Theme switching is architecturally possible.
- [ ] Mobile layouts remain comfortable on small screens.
- [ ] Decorative details never block controls or reduce readability.
- [ ] Empty, loading, offline, and error states are fully designed.
- [ ] The result feels handcrafted, not AI-generated.

---

# Final Direction

The redesigned application should feel like a beautiful object the user returns to every night.

The strongest product emotion is not productivity. It is anticipation.

The user should feel that every answer becomes a small preserved piece of a larger story, and that the completed month is something personal, beautiful, and worth waiting to uncover.
