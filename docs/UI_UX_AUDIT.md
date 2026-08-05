# Thirty Nights — UI/UX Audit

Date: 2026-08-04
Scope: `App.tsx`, `src/theme.ts`, `src/components/*`, `src/screens/*`, `src/hooks/*`, `app.config.ts`, measured against `soft_feminine_premium_app_design_system.md`.

Method: full read of the UI layer, plus a live pass over the `dist/` web export (served locally, walked through onboarding → hour picker → notification primer → home → settings → gallery → light map) with screenshots, DOM measurement, and computed WCAG contrast ratios.

Findings are tagged:

- **[V]** verified in the running build (screenshot or DOM measurement)
- **[C]** identified from code; deterministic, but not exercised at runtime
- **[N]** native-only behaviour inferred from code; needs an iOS/Android device build to confirm

Severity: **P0** breaks or blocks a user · **P1** visible defect / significant UX cost · **P2** polish and consistency.

---

## 0. Executive summary

The three complaints are real and each has an identifiable root cause rather than a diffuse "needs more polish."

**"Not responsive / spilling out of containers."** `HomeScreen` does not use flexbox for its vertical layout. It hand-computes a `fixedHeight` constant by summing every sibling's height and subtracts it from the viewport (`HomeScreen.tsx:41-61`). Every one of those numbers is a magic constant, several no longer match the padding they represent, and the whole screen is `scroll={false}` so any drift pushes content off the bottom with no recovery. On top of that the breakpoints are mis-tuned — `usableHeight < 860` triggers "compact", which means essentially every phone in circulation gets the degraded layout and the intended design only appears on the largest devices. Separately, the sticker-board decorations use negative offsets to bleed outside their container and are clipped by the 520px device frame **[V]** — the wax seal and the taped flowers are both visibly cut in half on the right edge.

**"Designs feel flat and the whole thing feels unalive."** Three systemic causes, all cheap to fix:

1. **The type system runs at exactly one weight.** `typography.sansMedium` is literally the same value as `typography.sans` (`theme.ts:127-128`), so every "medium" in the app renders as regular. `Fraunces_500Medium` and `Fraunces_400Regular_Italic` are downloaded on every cold start and then **never used anywhere**. Every heading in the app is Fraunces 400. There is no weight contrast to create hierarchy, so everything reads at the same visual volume.
2. **There is no motion vocabulary.** `Easing` is never imported anywhere in the codebase. Every animation uses the default curve. There are no route transitions — screens hard-swap. Onboarding has no swipe gesture and no slide transition. There is no `android_ripple` anywhere; every press is a flat opacity change. The design system's staggered page entrance, sticker dust particles, breathing glow, and shimmer are all unimplemented.
3. **Everything is a flat fill on a flat fill.** `expo-linear-gradient` is used in exactly one place (the page background). `react-native-svg` is installed and **completely unused**. Cards are `rgba(255,253,249,0.68)` on `#F8EFE7` — a 2% lightness difference — with shadows so faint they are invisible in the running build **[V]**. And `Screen`'s "atmosphere" layer paints a hard-edged `rgba(255,255,255,0.18)` rectangle across the top 34% of every screen with no gradient, producing a visible horizontal seam on every single screen **[V, measured: 283.6px tall, hard bottom edge]**.

**"The sealing animation is not proper."** It is the weakest moment in the app and it is broken in a specific, mechanical way: the seal and the envelope are **siblings with no shared coordinate space**, so the seal's hard-coded landing position (`translateY: -75`) has no computed relationship to the target ring inside the envelope (`top: 42, left: 94` inside an envelope at `top: '23%'`). It lands on target only on the one screen height it was tuned against. Full breakdown in §3.

Nothing here is architectural. The data layer, sync boundary, and server contracts are sound; this is all in the presentation layer.

---

## 1. Systemic issues (fix these first — they touch every screen)

### 1.1 The type scale has no weight axis — P0 [V]

`src/theme.ts:120-133`

```ts
const systemSans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) ?? 'sans-serif';
sans: systemSans,
sansMedium: systemSans,   // ← identical to `sans`
```

- `sansMedium` === `sans`. Every usage (`HomeScreen.tsx:451` nav labels, `SegmentedTabs.tsx:46,52`, `WindowGrid.tsx:264,268` day numbers) renders at regular weight. The "active" tab label is styled with `sansMedium` to distinguish it — it does not.
- `typography.serifMedium` (Fraunces 500): **zero usages.**
- `typography.serifItalic` (Fraunces 400 Italic): **zero usages.**
- Both are still loaded in `App.tsx:205`, delaying first paint for fonts that never render.
- `typography.serifSemiBold`: one usage, in a mock notification (`SetupScreens.tsx:180`).

Net effect: every headline, month title, question, section title, and card title in the app is Fraunces 400. This is the single largest contributor to "flat."

**Fix:** add real `fontWeight`s to the sans stack (use the platform font with explicit weights, or ship Inter/DM Sans variable), promote headings to `serifSemiBold`, use `serifMedium` for card titles, and reserve `serifItalic` for report pull-quotes. Then delete unused families from `useFonts`.

### 1.2 The paper atmosphere has a hard seam on every screen — P0 [V]

`src/components/Screen.tsx:144-151`

```ts
paperHighlight: {
  position: 'absolute', top: 0, left: 0, right: 0,
  height: '34%',
  backgroundColor: 'rgba(255,255,255,0.18)',   // ← no gradient, hard bottom edge
},
```

Measured live: a 520 × 283.6px rectangle with a crisp terminating edge. It is visible in every screenshot of every screen. It reads as a rendering artifact, not as light.

**Fix:** replace with a second `LinearGradient` fading `rgba(255,255,255,0.18) → transparent`, or fold it into the existing gradient's `locations`.

Related, same file:

- `paperTexture` renders at `opacity: 0.82` (`Screen.tsx:132`). The design system explicitly says texture opacity "should usually remain between 2% and 9%" (§9). At 82% the texture is doing the work of a background, which flattens everything layered on top of it.
- The 34 `grain` specks (`Screen.tsx:18-22, 152-158`) are 1×1px views. At device pixel ratios ≥2 they render sub-pixel and mostly vanish; 34 extra views per screen for no visible benefit.
- The two `sparkle` decorations (`Screen.tsx:159-177`) are two crossed rounded rects. In the running build they read as small dim smudges rather than sparkles **[V]** — visible near the top-left and mid-right of every screen.

### 1.3 No motion system — P1 [V/C]

- **`Easing` is never imported.** Every `Animated.timing` in the app uses the default curve. The design system specifies `--ease-soft`, `--ease-spring`, `--ease-gentle` (§11.1); none exist in code.
- **No route transitions.** `App.tsx:137-183` is a `switch` that swaps a component. The only motion on navigation is `Screen`'s 420ms fade, and it only fires on mount.
- **The page entrance is not staggered.** `Screen.tsx:52-66` animates the entire content block as one unit. The spec (§11.2) calls for header → sticker sheet → question card → nav stagger. As built, everything arrives simultaneously, which reads as a page load rather than a composition.
- **No `android_ripple` anywhere.** Every `Pressable` uses opacity only. Android will feel notably deader than iOS.
- **Press feedback is imperceptible.** `Buttons.tsx:102-105` — `transform: [{ scale: 0.992 }]`. A 0.8% scale change is below the perceptual threshold.
- **Haptics appear in 3 places only** (record start, and seal — twice, see §3.7). No haptic on primary buttons, tab switches, sticker taps, or hour selection.

### 1.4 Semantic color tokens collapse to identical values — P1 [C]

`src/theme.ts:67-89`

```ts
bone:     theme.textPrimary,    // #4A2635
paperInk: theme.textPrimary,    // #4A2635  ← same
boneDim:  theme.textSecondary,  // #765263
paperDim: theme.textSecondary,  // #765263  ← same
```

`ReportScreen` is the app's ceremonial payoff and passes `paper` to `Screen` to signal a different surface — but `Screen`'s `paper` flag only swaps three gradient stops, and every `paperInk`/`paperDim` token resolves to the same hex as the normal screens. The "opened chapter" therefore looks like the rest of the app. The indirection exists but is a no-op.

### 1.5 Contrast failures on the app's two accent colors — P1 [V, computed]

Measured against the two real backgrounds:

| Token | Hex | on `#F8EFE7` | on `#FFFDF9` card | Verdict |
|---|---|---|---|---|
| `bone` | `#4A2635` | 11.42 | 12.76 | pass |
| `boneDim` | `#765263` | 5.86 | 6.55 | pass |
| `ember` | `#A84F61` | 4.67 | 5.23 | pass |
| `boneFaint` | `#9A7482` | **3.56** | **3.98** | fails AA at body size |
| `rose` | `#BE6F7C` | **3.21** | **3.59** | fails AA at body size |
| `moss` | `#6F8E78` | **3.18** | **3.55** | fails AA at body size |
| `brass` | `#B88635` | **2.85** | **3.18** | **fails even the large-text floor on the app background** |

Consequences:

- **White text on the primary rose button is 3.59:1** — the app's main CTA fails AA. (`Buttons.tsx:19,81`)
- `textStyles.eyebrow` is `rose` at 11px and is the app's universal label style — used on every screen. Fails.
- `brass` carries the backup status line (`HomeScreen.tsx:405`), all `message` feedback in Settings and Paywall, report statuses, and the `openReport` link. Fails everywhere.
- `moss` carries success states ("Your keepsake is up to date", report `ready`). Fails.

**Fix:** darken the accents for text use (keep the current values for fills/strokes). A `roseText`/`brassText`/`mossText` pair around 4.5:1 preserves the palette while making labels legible.

### 1.6 Systematically undersized text — P1 [V]

Measured on the Light Map screen in the running build: `8px` for "Current streak 0 / Longest 0 / Completion 0%", `9px` for the "WINDOWS THIS YEAR" section heading, `10px` for every stat label.

Full inventory of user-facing text below 12px:

| Size | Where |
|---|---|
| 8px | `ArchiveScreens.tsx:130` `openReport`, `:132` `shelfLabel`, `:141` `secondary` stats · `PaywallScreen.tsx:123` `product` · `SettingsScreen.tsx:176` `version` |
| 9px | `AppHeader.tsx:62` header label · `ArchiveScreens.tsx:135,148` · `HomeScreen.tsx:371` question eyebrow · `PopupCatalogScreen.tsx:52,55` · `ReportScreen.tsx:103,108` · `SetupScreens.tsx:169,175` |
| 10px | `ArchiveScreens.tsx:139,147` · `HomeScreen.tsx:264` · `ReportScreen.tsx:100` |
| 11px | `WindowGrid.tsx:255` day numbers · `SettingsScreen.tsx:172` row detail · `AuthScreen.tsx:128` privacy copy · `SetupScreens.tsx:129` hour chips |

The 11px `rowDetail` in Settings carries load-bearing copy ("Cloud processing consent required"). The 11px privacy line in `AuthScreen` is the most legally significant text in the app and the least readable.

### 1.7 Font scaling is unhandled in both directions — P0 [C]

`allowFontScaling` is never set to `false` anywhere, so all text honours iOS Dynamic Type / Android font scale — but the layouts that contain it are fixed-pixel:

- `HomeScreen.tsx:43-45` — `questionHeight`, `statusHeight`, `navHeight` are hard numbers.
- `AppHeader.tsx:34,42` — fixed `minHeight`.
- `SettingsScreen.tsx:166` — `minHeight: 67` rows.

At 150–200% text scale, all of these will clip. Neither strategy (opt out of scaling, or make the layout fluid) has been chosen.

Compounding it, `adjustsFontSizeToFit` is used as the mitigation in two places (`HomeScreen.tsx:194, 209`) — that prop only works reliably for single-line iOS text. On Android and web, the multi-line question card (`numberOfLines={4}`) will simply truncate with an ellipsis instead of shrinking.

### 1.8 App-level configuration defeats the theme — P0 [C]

`app.config.ts`:

- **`userInterfaceStyle: 'dark'`** — the entire palette is a *light* cream theme. Forcing dark means native surfaces the app doesn't draw (keyboard, `Switch` internals, text-selection handles, share sheet, native dialogs, Android nav bar) come up dark inside a cream app. It also directly contradicts `<StatusBar style="dark" />` in `App.tsx:187` (dark *content*, i.e. for a light background).
- **No `icon`, no `splash`, no `adaptiveIcon`, no `backgroundColor`** are declared, and there is no `expo-splash-screen` plugin entry. The app ships the default Expo icon and a white splash — so every cold start flashes white before the cream UI paints.
- `expo-system-ui` is installed and listed as a plugin but never called, so the Android root/nav-bar background stays at its default and shows during transitions and overscroll.

### 1.9 Dead code and unused dependencies — P2 [V/C]

- `react-native-svg` — installed, **zero imports**. The decorative arcs and sparkles are faked with rotated bordered `View`s; SVG would fix them properly.
- `keepsakeDecorations.washiTape` and `.driedFlowers` — declared in `keepsakeAssets.ts`, never used.
- `HomeScreen.tsx:414-421` — `styles.fact`, never referenced.
- `ArchiveScreens.tsx:53` — `report.status.replace('-', ' ')` on an enum that has no hyphens (`queued|running|ready|failed`).
- `HomeScreen` stylesheet `minHeight` values (`:288, :343, :398, :423`) are all overridden inline with `minHeight: 0`. Dead values that make the file read as if it has constraints it doesn't.

---

## 2. Responsiveness and container overflow

### 2.1 HomeScreen replaces flexbox with hand-computed arithmetic — P0 [V]

`src/screens/HomeScreen.tsx:31-61`

```ts
const fixedHeight = (compact ? 6 : 18)
  + headerBlockHeight + headingBlockHeight + sheetMarginBottom
  + questionHeight + statusHeight + navHeight
  + (compact ? 18 : 8);
const availableBoardHeight = Math.max(150, usableHeight - fixedHeight);
```

Problems:

- The leading and trailing terms (`6/18` and `18/8`) are supposed to represent the screen's own vertical padding, which is set to `2/6` and `4/12` at `:113-114`. **They already disagree.**
- `headerBlockHeight`, `headingBlockHeight`, `statusHeight`, `navHeight` are estimates of what those elements will measure. Any font-scale change, locale change, or text wrap invalidates all of them at once.
- The screen is `scroll={false}` (`:108`), so when the estimate is wrong there is no recovery — content goes off the bottom edge and is unreachable.
- `Math.max(150, ...)` guarantees the board claims 150px even when nothing is left, which pushes the overflow into the nav bar rather than preventing it.

**Fix:** delete the arithmetic. Give the board `flex: 1` with a `minHeight`, let the header/card/status/nav size themselves, and pass the board's measured height to `WindowGrid` via `onLayout` instead of predicting it.

### 2.2 Breakpoints are tuned so that almost every phone is "compact" — P1 [V]

`HomeScreen.tsx:35-37`

```ts
const compact = usableHeight < 860 || deviceWidth < 390;
const dense   = usableHeight < 700 || deviceWidth < 350;
const tiny    = usableHeight <  560;
```

`usableHeight` is *already* net of safe-area insets. On an iPhone 15 (852pt tall, ~735pt usable) and on the 932px-tall test viewport used here **[V]**, `compact` is always true. The full-fidelity layout is effectively unreachable.

Visible consequences in `compact` mode:

- The cloud/identity indicator in the header row is **removed entirely** (`:125-132`) — you lose the sync affordance on the devices most people own.
- Month title drops 57 → 48px, question card 148 → 104px, question text 24 → 21px.

### 2.3 Sticker-board decorations are clipped by the device frame — P1 [V]

Confirmed by zoomed screenshot: the taped-flowers sprig and the wax seal are both cut in half at the right edge.

`HomeScreen.tsx:314-341` positions decorations with negative offsets (`right: -34`, `top: -71`, `right: -24`, `bottom: -22`) so they bleed past the board. But `Screen.tsx:94-100` sets `overflow: 'hidden'` on the 520px device container, and the board sits inside `paddingHorizontal: 22`. The bleed exceeds the available margin, so the decorations are truncated at the frame.

**[N]** On Android this will be worse: `overflow: 'visible'` is not reliably honoured for children escaping a parent that has a background or elevation, so the flower at `top: -71` is likely to be clipped at the board edge rather than the screen edge.

**Fix:** move the decorations into the same absolutely-positioned layer as the board, inside the padding, and cap their offsets to the available margin (or render them as part of the board texture).

### 2.4 The board texture is non-uniformly stretched — P1 [V]

`HomeScreen.tsx:138` — `<ImageBackground resizeMode="stretch">`. The deckled paper edge and pink border are distorted at every aspect ratio; in the running build the border is visibly thicker at the bottom-left than at the top. Use `resizeMode="repeat"` with a tileable texture, or a 9-slice with `capInsets`.

### 2.5 `AppHeader` right slot cannot hold both of its own buttons — P1 [C]

`AppHeader.tsx:46-52` — `side: { width: 50 }`, but the right slot can render both `onSettings` and `onShare` (`:26-27`), each a 46×46 `IconButton`. Two buttons need 92px in a 50px box with `justifyContent: 'flex-end'`; the second will overflow. No current caller passes both, but the component's own API allows it.

### 2.6 `BottomSheet` has no height ceiling and no scroll — P0 [C]

`src/components/BottomSheet.tsx`

- The sheet has no `maxHeight` and no `ScrollView` (`:75-86`). The Settings backup sheet renders a long body plus **three** actions plus a footer; the delete sheet renders a long body plus three actions; the mic-denied sheet renders three actions. On a small device these will extend past the top of the screen, and since there is no scroll the primary action can become unreachable.
- The hidden position is the constant `520` (`:24, :29, :33`). Any sheet taller than 520px does not fully leave the screen when dismissed.
- **Exit animation never plays.** `visible` is passed straight to `<Modal visible={visible}>` (`:42`), so the modal unmounts the instant the flag flips and the spring-out is never seen. Sheets vanish abruptly.
- `paddingBottom: 34` is hard-coded (`:85`) instead of using `useSafeAreaInsets()` — too much on devices without a home indicator, potentially too little under Android gesture nav.

### 2.7 No keyboard avoidance anywhere — P0 [C]

`KeyboardAvoidingView` appears nowhere in the codebase. `AuthScreen.tsx:99` is a `TextInput` positioned below a heading, a card, two provider buttons and a divider, with the submit button below it. On iOS the keyboard will cover both the field and the button. `keyboardShouldPersistTaps` is set, which preserves tap handling but does nothing about visibility.

### 2.8 The year heatmap is not a calendar — P1 [V, measured]

`ArchiveScreens.tsx:76-103`. Measured live: 365 cells at **6.15px each**, laid out as **7 rows of 53 consecutive days** (53/53/53/53/53/53/47).

That is not a week-column heatmap — it is 365 dots in reading order, with no weekday alignment, no month labels, no axis, and no tap targets. The `columns = 53` constant implies a GitHub-style layout that the wrap order does not produce. At 6px the cells convey nothing.

### 2.9 The Light Map legend contradicts the color mapping — P1 [V]

`ArchiveScreens.tsx:104-108` renders `windowRamp` **in array order** under the labels "Earlier evening → Later night". But `hueForHour` (`theme.ts:201-208`) maps:

| Hour | Ramp index |
|---|---|
| 18–20 (earliest) | `[3]` gold |
| 20–22 | `[1]` |
| 22–24 | `[0]` |
| 00–01 | `[2]` |
| 01–03 | `[4]` |
| 03–05 | `[5]` |
| else | `[6]` green |

So the swatch shown first as "earlier evening" is actually 22:00–midnight, and the actual earliest-evening color sits fourth. The legend is wrong as displayed **[V — confirmed visually: dark plum, rose, pink, gold, mauve, brown, green, which is not a monotonic time ramp]**.

### 2.10 Gallery thumbnails are illegible at any card size — P1 [V]

`ArchiveScreens.tsx:119, 127` — `currentThumbnail` is a fixed 94×94 box and `WindowGrid thumbnail` hard-codes `widthLimit = 82` (`WindowGrid.tsx:151`), giving ~11px stickers. In the running build this renders as a grey smudge. Meanwhile `archiveCard` is `width: '47.5%'` with `aspectRatio: 0.94`, so on a wide device the card grows to ~224px while the grid inside stays at 82px — a tiny grid floating in a large empty card.

### 2.11 90-night chapters can only ever show one 30-night window — P1 [C]

`HomeScreen.tsx:72, 153` slices to `segmentStart … segmentStart + 30` based on the current night, and `WindowGrid` hard-codes a 6×5 grid (`WindowGrid.tsx:152, 158-175`). A 90-night purchaser has no way to page back to nights 1–30 or forward to 61–90 from Home.

Conversely, a 7-night trial user sees their 7 nights padded out with 23 embossed placeholders (`WindowGrid.tsx:161-174`), which reads as 23 failures. Same problem on the 7-night report (`ReportScreen.tsx:47`) and on onboarding slide 4, which pairs the copy "The first seven nights are yours" with a 30-slot board **[V]**.

### 2.12 Waveform bars cannot shrink — P2 [C]

`Waveform.tsx:8, 34-38` renders 54 bars at a fixed `width: 2` with `gap: 2` — a 214px hard minimum — inside containers with `width: '100%'` and `justifyContent: 'space-between'` *and* `gap`. Combining `space-between` with `gap` produces inconsistent spacing, and the fixed widths mean the row cannot compress in a narrow container.

### 2.13 Paywall tier cards overlap and overflow — P1 [C]

`PaywallScreen.tsx:117-125`:

- The selection radio is `position: 'absolute', right: 18, bottom: 18`. `report` reserves `paddingRight: 30` to clear it — but `product` (`:123`), which sits below and is the longest string on the card, reserves nothing and will run under the radio.
- `tierTop` (`:119`) is a `space-between` row with `nights` at 24px serif and `price` at 28px serif, neither with `flexShrink`. A long localized price (`Rp 1.499.000`, `₩29,000`) will push or wrap.

### 2.14 `Screen`'s `flex: 1` inside a `ScrollView` — P2 [V, no impact on web]

`Screen.tsx:104-112` sets `contentContainerStyle: { flexGrow: 1 }` with a child at `flex: 1`. This is the classic RN pattern that can pin content to viewport height and prevent scrolling past one screen. **Verified not to reproduce on react-native-web** — Settings scrolls correctly. Flagging as **[N]** to re-test on a device build, since Yoga's handling differs from the web layout engine.

---

## 3. The sealing animation

`src/screens/TransitionScreens.tsx:11-59`. Called out specifically; here is what is actually wrong.

### 3.1 The seal has no spatial relationship to its target — P0 [C]

The envelope is `position: 'absolute', top: '23%'` with a target ring at `left: 94, top: 42` *inside* it (`:105-114`). The travelling seal is a **sibling** of the envelope, centred by the parent's `alignItems/justifyContent: 'center'`, and ends at a hard-coded `translateY: -75, translateX: 0` (`:46-47`).

Those two coordinate systems are unrelated. The `23%` moves with viewport height, the `-75` does not. **The seal lands on the ring only at the one screen height this was tuned on.** On any other device it lands short, long, or off-centre. This is the core of "the sealing animation is not proper."

**Fix:** make the seal a child of the envelope, positioned relative to the target ring, or measure the ring with `onLayout` and animate to its measured centre.

### 3.2 The timing is roughly double the spec — P1 [C]

Spec (§11.2): sealing transition total 900ms–1.4s.

Actual: 400 + 700ms timings + a spring (~400–600ms) ≈ **1.5s of motion, then a hard-coded `setTimeout(onDone, 1550)`** (`:30`) — **≈3s** before the screen advances. And `GeneratingScreen` then holds for another **4.35s** (`:75`). Sealing one night costs ~7 seconds of non-interactive waiting.

### 3.3 It does not depict the thing it is named after — P1 [C]

Spec calls for: the waveform folds/fades inward → a circular wax mark closes over the entry → warm light contracts into the seal → "Sealed for later."

Built: a static outlined rectangle appears with no entrance, and a seal image flies up from off-screen. Nothing "closes over" anything. The envelope never animates — the flap does not close. There is no visual continuity from the recording screen: the waveform the user was just watching simply disappears on route change.

### 3.4 The motion arc is perspective-inconsistent — P2 [C]

`:44-49` — the seal starts at `translateY: 210` (below centre) and moves **up** to `-75`, while scaling **1.5 → 0.74 → 1**. Something moving away from the viewer should recede; something moving up-screen toward an envelope reads as approaching. Large-to-small while travelling upward reads as the object shrinking, not as depth.

Also `opacity: [0, 0.1, 1] → [0, 1, 1]` — the seal is invisible for the first 10% and then pops in at full opacity rather than fading.

### 3.5 The seal has no shadow on either platform — P2 [C/N]

`:141-148` sets `shadowColor`, `shadowOpacity`, `shadowRadius` but **no `shadowOffset` and no `elevation`**. No `elevation` means no shadow on Android at all. On iOS, a shadow on a transparent-background `View` wrapping an `<Image>` produces either nothing or an artifact, since there is no opaque shape to cast from.

### 3.6 The gleam is a static white blob — P2 [C]

`:150-159` — `sealGleam` mounts instantly at a fixed `left: 17, top: 15` with no animation and no fade. It does not track the seal art and does not read as a highlight. The spec asks for a single shimmer.

### 3.7 Double haptic on seal — P2 [C]

`Haptics.notificationAsync(Success)` fires in `TransitionScreens.tsx:29` **and** in `QuestionScreen.tsx:130`. Users get two success buzzes for one action.

### 3.8 Reduced-motion path skips the confirmation — P1 [C]

`:17-21` — with reduce-motion on, the screen sets the final state and calls `onDone` after **350ms**. The user gets a flash and never reads "Sealed for later." Reduced motion should remove *motion*, not the confirmation. Spec §11.3: "keep essential state changes immediate and clear."

There is also no `accessibilityLiveRegion` / announcement, so screen-reader users get no confirmation that the night was sealed.

### 3.9 "Sealed for later." can collide with the envelope — P2 [C]

`:160-166` — `position: 'absolute', bottom: '24%'`, a percentage that drifts with viewport height while the envelope is pinned at `top: '23%'` with a fixed 158px height. On short screens the two converge.

### 3.10 `GeneratingScreen` shows fabricated progress — P1 [C]

`TransitionScreens.tsx:61-98`. The three steps ("Saving your take" / "Checking private backup" / "Queuing an eligible report") complete on **fixed timers** at 900ms, 1950ms and 3000ms. They reflect no real state.

This will display "Checking private backup ✓" to a user who has no account, has not granted processing consent, or is on cellular with Wi-Fi-only backup — i.e. exactly the users for whom no backup happened. That contradicts the product's own stated discipline everywhere else in the codebase (no fake prices, no sample reports, no local paid grants). The `bloom` behind it (`:167-174`) is a static circle with no motion at all.

---

## 4. Screen-by-screen findings

### 4.1 QuestionScreen — `src/screens/QuestionScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P0** | **Hold-to-record is the only input** (`:199-200`). The copy says "Five minutes maximum" — the user must physically hold a button for five minutes. There is no tap-to-start/tap-to-stop mode. |
| 2 | **P0** | Any finger slip off the button fires `onPressOut` and permanently ends the one-and-only take. No slop, no `onResponderTerminate` guard. |
| 3 | **P0** | An accidental sub-10s tap opens the `short` sheet whose **only** action is "Seal it" (`:209-218`), with `blocking` and `onClose={() => undefined}`. There is no discard or retry — a 1-second mis-tap permanently burns the night. |
| 4 | **P1** | **The waveform is fake.** `Waveform.tsx:9` computes amplitude from the bar index. It does not read `expo-audio` metering, and it does not animate. The user gets no confirmation the mic is hearing them — on a one-take app with no playback, that is a serious trust gap. |
| 5 | **P1** | `progress={seconds / 90}` (`:180`) — the waveform saturates at 90s but the cap is 300s. The last 3.5 minutes give no feedback. No progress ring toward the cap, no warning as it approaches. |
| 6 | **P1** | `sealing` state (`:42, :127`) is set but never rendered. During the SQLite write + file move + checksum the UI is frozen with no spinner and no disabled state. |
| 7 | **P1** | The timer polls at 120ms and rounds to whole seconds (`:35, :173`), so it visibly stutters and can skip or repeat a digit. |
| 8 | **P2** | The recording state change is `#F6D5D8` → `#F2C2C6` (`:342, :353`) — a difference of ~4% lightness. The only real signal is the label text changing. |
| 9 | **P2** | `recordPulse` (`:184-195`) is a single ring on a 1200ms linear loop with no easing, so it snaps back to scale 1 at each cycle boundary. Spec asks for a slow expand/contract aura. |
| 10 | **P2** | The `question` → `ready` phase change (`:143`) is an instant swap with no transition; the `Screen` entrance does not re-fire because the component does not remount. |
| 11 | **P2** | Backgrounding the app silently stops and seals the recording (`:71`) with no warning sheet. |
| 12 | **P2** | `question` at 41px (`:295-299`) with `scroll={false}` and a `minHeight: 280` paper card — at large font scale this overflows with no way to scroll. |

### 4.2 HomeScreen — `src/screens/HomeScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | Tonight's sticker uses the **completed** artwork (`WindowGrid.tsx:132`), so an unrecorded night looks like a recorded one apart from a ring **[V]**. Spec says future = embossed, current = highlighted, completed = full colour — the current state has borrowed the completed state's art. |
| 2 | **P1** | The month title is `new Intl.DateTimeFormat('en', …)` on `new Date()` (`:122`) — hard-coded English despite `expo-localization` being a dependency, and it shows the *current calendar month* rather than the chapter's month, so it disagrees with the `NIGHT n OF m` label above it. |
| 3 | **P1** | A disabled question card (`:178, :355`) renders at `opacity: 0.88` — visually indistinguishable from enabled. Users will tap it and get nothing. |
| 4 | **P1** | The bottom nav has **no active state** (`:217-227`) despite the spec explicitly calling for one, and it is not the "floating pill" described — it is a static row in a non-scrolling layout. |
| 5 | **P2** | Tapping a sealed night opens a generic "It's sealed." sheet (`:229-235`) with no night number, date, or duration — while `App.tsx:190-199` has a much richer sheet for revealed nights. Inconsistent. |
| 6 | **P2** | Missed nights are not tappable at all (`WindowGrid.tsx:192`) and give no explanation. Dead end for the state users will most want explained. |
| 7 | **P2** | `lastRecordedToday` (`:66-69`) compares `recordedAt.toDateString()` against device-local today, bypassing the domain's `expectedLocalDate` logic. Around midnight or after a timezone change the card copy ("Tonight is still closed") can contradict the grid. |
| 8 | **P2** | Sticker tap targets: `hitSlop` of 1–3px (`WindowGrid.tsx:77`) on stickers that are ~35–45px in compact/dense mode. Below the 44px minimum. |

### 4.3 SettingsScreen — `src/screens/SettingsScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | **Every group has a hanging divider under its last row** (`:166`) **[V]** — clearly visible under "Thirty-minute nudge", "Keepsake Classics", "Restore purchases" and "Delete everything". |
| 2 | **P1** | Rows with a `control` but no `onPress` are pressable (`:20`) and show press feedback but do nothing. Tapping the "Notifications" label appears broken; it should toggle the switch. |
| 3 | **P1** | `run()` writes its result to a `message` at the very bottom of a long scrolling screen (`:117`). Tap "Export everything" mid-page and the confirmation appears off-screen. No toast, no scroll-to-message. |
| 4 | **P1** | `blocking={working}` on the delete sheet (`:156`) never has an effect — the sheet closes before the `await`. Account deletion (a network + DB round trip) runs with **no progress indication**. |
| 5 | **P1** | There is no sign-out. "Account connected" has `onPress={undefined}` (`:101`), so it is a dead row with no chevron and no way to manage the account. |
| 6 | **P2** | Three consecutive rows use the same `Bell` icon and four use the same `Shield` **[V]** — the list is unscannable. |
| 7 | **P2** | `Switch` off-state uses `trackColor.false = colors.inkSoft` (`#F4E6DE`) on a `#FFFDF9` group — nearly invisible **[V]**. |
| 8 | **P2** | `version` is the hard-coded string `'THIRTY NIGHTS · BUILD 1.0.0'` (`:131`) rather than reading from `expo-constants`. |

### 4.4 OnboardingScreen — `src/screens/OnboardingScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | **No swipe gesture.** Slides advance only by button or dot tap (`:103, :108`). Every user will try to swipe first and conclude the app is unresponsive. |
| 2 | **P1** | No transition between slides — content hard-swaps, and `WindowVisual` remounts across visual kinds so the glow loop restarts. |
| 3 | **P1** | Slide 4 says "The first seven nights are yours" beside a **30-slot** board **[V]**; the 23 embossed slots read as locked content on the slide meant to convey generosity. |
| 4 | **P2** | `visual: { height: '36%', minHeight: 250 }` (`:126-131`) inside `scroll={false}` — on short devices `minHeight` wins and the content overflows with no scroll. |
| 5 | **P2** | Dots are 9px with `hitSlop: 10` → ~29px targets, and have no `accessibilityRole`, label, or state. |
| 6 | **P2** | Titles use hard `\n` breaks (`:14, :20, :26, :32`) which will break badly at large font scale or in other locales. |
| 7 | **P2** | No skip control. |

### 4.5 SetupScreens — `src/screens/SetupScreens.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | **Only six hours are selectable** (`:9`, `20/21/22/23/0/1`) and the minute is forced to 0 (`App.tsx:143`). A user who sleeps at 21:30 or 02:00 cannot set their reminder — yet Settings displays `22:00` (`SettingsScreen.tsx:67`), implying a full time picker. |
| 2 | **P1** | Sprawling `space-between` layout leaves ~190px of dead space above and below the clock card **[V]**. |
| 3 | **P2** | Hour chips are ~35px tall with 11px mono labels — below tap-target minimum and hard to read **[V]**. |
| 4 | **P2** | `clockWrap` (`:90-102`) sets iOS shadow props with **no `elevation`** → no shadow on Android. |
| 5 | **P2** | The mock notification hard-codes "Night 1" and a fixed question (`:62-63`) regardless of the user's actual night or question set. |

### 4.6 ReportScreen — `src/screens/ReportScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | **Pause then play restarts from zero.** `play()` (`:31-42`) always calls `player.replace(source)`, so the "Pause report" / "Listen from the beginning" toggle silently loses position. |
| 2 | **P1** | The worker builds per-quote evidence clips with ffmpeg, but `quoteCard` (`:62-68`) has no play control. The most compelling feature in the product is not reachable from the UI. |
| 3 | **P1** | No seek control; the `Waveform` displays progress but is not scrubbable (`:56`). |
| 4 | **P2** | This is the ceremonial payoff screen and it uses the same tokens, same background treatment and same type weights as every other screen — see §1.4. Spec §11.2 "final unlock" (layers separating, content resolving into focus, a single shimmer) is entirely unimplemented. |
| 5 | **P2** | `styles.body` is serif (`:105`) while `textStyles.body` is sans — the same semantic role uses different fonts on different screens. |
| 6 | **P2** | Errors render as 12px serif in ember (`:113`). |
| 7 | **P2** | `summary` uses the hard-coded hex `#F2DDE0` (`:109`), outside the token set. |
| 8 | **P2** | Raw enum values are shown to users as status text (`ArchiveScreens.tsx:53`): "running", "queued". |

### 4.7 GalleryScreen / LightMapScreen — `src/screens/ArchiveScreens.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | "WINDOWS THIS YEAR" renders completed chapters as **featureless colour rectangles** with one faint arc (`:111, :150-151`) **[V]** — no month, no count, no sticker preview. Spec: "Each month should look like a keepsake cover." This is the flattest surface in the app. |
| 2 | **P1** | `openReport` (`:18, :130`) is an 8px uppercase link in a ~11px-tall `Pressable` with no `hitSlop`. Effectively untappable. |
| 3 | **P1** | The empty Gallery leaves ~340px of dead space below a single line of centred text **[V]**. |
| 4 | **P2** | `SegmentedTabs` navigates between two separate screens rather than switching content, so the "tab" has no transition and no shared context; both tabs' back buttons go Home. |
| 5 | **P2** | Tab targets measure 40px tall **[V, measured]** — below the 44px minimum. |
| 6 | **P2** | `archiveGrid` uses `justifyContent: 'space-between'` with `width: '47.5%'` items (`:124, :126`) and no `columnGap`; a third item lands hard-left with an inconsistent gutter. |

### 4.8 AuthScreen — `src/screens/AuthScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P0** | No keyboard avoidance — see §2.7. |
| 2 | **P1** | The native Apple button (`:88-94`) has no `disabled`/`loading` binding while every other control does (`:95, :96, :103`). Double-tapping can start two auth flows. |
| 3 | **P2** | Field errors render as separate text below the input (`:101`); the input itself never takes an error style. |
| 4 | **P2** | No `returnKeyType`, no `onSubmitEditing`, no `inputMode`. |
| 5 | **P2** | The privacy disclosure (`:109, :128`) is 11px `boneFaint` — 3.56:1 contrast, the least readable text on the screen. |

### 4.9 PaywallScreen — `src/screens/PaywallScreen.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | Prices show `'—'` until products load (`:88`) with no skeleton — `loading` only drives the button spinner. Reads as broken. |
| 2 | **P1** | "Restore purchases" uses `variant="ghost"` (`:105`) — transparent background *and* transparent border (`Buttons.tsx:94-97`). An invisible button with only a 13px mono label. |
| 3 | **P1** | Overlap and overflow in the tier cards — see §2.13. |
| 4 | **P2** | Purchase errors surface only as centred 13px brass text (`:130`) at 2.85:1 contrast. |
| 5 | **P2** | `accessibilityRole="radio"` on the tiers with no `radiogroup` parent (`:87`). |

### 4.10 Buttons — `src/components/Buttons.tsx`

| # | Sev | Finding |
|---|---|---|
| 1 | **P1** | White on rose = **3.59:1** — the primary CTA fails AA. |
| 2 | **P1** | `disabled` renders at `opacity: 0.38` (`:106-108`). On the `paper`/`outline` variants over a cream background this is far below any legibility floor. |
| 3 | **P2** | Primary CTA label is 13px mono with `letterSpacing: 0.1` (`:109-115`) — reads as a caption, not an action. |
| 4 | **P2** | The label is `flex: 1, textAlign: 'center'` between two 26px icon slots, so a left-icon button's text is centred in the *remaining* space and sits visually off-centre in the button. |
| 5 | **P2** | No `numberOfLines` on the label — a long localized string silently grows the button to three lines. |
| 6 | **P2** | `TextButton` (`:47-53`) is 12px with `hitSlop: 10` → ~32px target, and takes no `accessibilityLabel`. |
| 7 | **P2** | Press feedback is `scale: 0.992` — imperceptible. No haptic. |

---

## 5. Accessibility

Beyond the contrast and tap-target findings already listed:

| Sev | Finding |
|---|---|
| **P1** | No screen title anywhere uses `accessibilityRole="header"`. Screen-reader users cannot navigate by heading. |
| **P1** | `BottomSheet` has no `accessibilityViewIsModal` and no initial focus, so VoiceOver/TalkBack can still reach the content behind the sheet. |
| **P1** | `SealingScreen` makes no announcement — see §3.8. |
| **P1** | Reduced motion drops confirmations rather than only motion (`TransitionScreens.tsx:17-21, 67-72`). |
| **P2** | `WindowGrid` exposes a summary label *and* 30 individual buttons (`:179-193`) — a screen reader walks 30 stickers with no grouping. |
| **P2** | The recording timer has no live region, so a blind user has no sense of elapsed time on a screen where duration is the entire interaction. |
| **P2** | Onboarding dots have no role, label, or state. |
| **P2** | No error boundary anywhere — a render error yields a white screen with no recovery. |

---

## 6. Suggested order of work

**Stage 1 — highest visual return per hour (mostly single-line changes)**

1. Fix the type weights (§1.1) — real `fontWeight`s on sans, `serifSemiBold` for headings, `serifMedium` for card titles, `serifItalic` for report quotes. Biggest single lever against "flat."
2. Replace `paperHighlight` with a gradient (§1.2) and drop `paperTexture` opacity from 0.82 into the 5–10% range.
3. Fix `userInterfaceStyle` to `'light'`, and add `icon` / `splash` / `adaptiveIcon` / `backgroundColor` (§1.8).
4. Darken `rose` / `brass` / `moss` / `boneFaint` for text use (§1.5).
5. Raise every sub-12px string to ≥12px (§1.6).
6. Remove the trailing divider on the last row of each Settings group; de-duplicate the row icons (§4.3).

**Stage 2 — the layout rewrite**

7. Delete `HomeScreen`'s `fixedHeight` arithmetic and rebuild with flexbox (§2.1); re-tune the breakpoints so a normal phone gets the full layout (§2.2).
8. Bring the board decorations inside the frame (§2.3) and stop stretching the board texture (§2.4).
9. Give `BottomSheet` a `maxHeight` + `ScrollView`, measure its height for the hidden position, keep it mounted through the exit animation, and use safe-area insets (§2.6).
10. Add `KeyboardAvoidingView` to `AuthScreen` (§2.7).
11. Decide on font scaling — cap it, or make the fixed-height containers fluid (§1.7).

**Stage 3 — the recording and sealing ceremony**

12. Add tap-to-start/tap-to-stop alongside hold; add slip protection; give the short-take sheet a discard option (§4.1 #1–3).
13. Drive the waveform and the record aura from real `expo-audio` metering (§4.1 #4).
14. Show progress toward the 5-minute cap; show a sealing state while `onSeal` runs (§4.1 #5–6).
15. Rebuild the seal animation with a shared coordinate space, spec timing (~1.2s total), a closing flap, and an animated gleam; drop the 1550ms dead hold; fix the double haptic; keep the confirmation under reduced motion (§3).
16. Replace `GeneratingScreen`'s fake checklist with real state, or reduce it to an honest indeterminate wait (§3.10).

**Stage 4 — making it feel alive**

17. Add an `Easing` set matching the design tokens and apply it everywhere (§1.3).
18. Stagger the page entrance; add route transitions.
19. Add swipe + slide transitions to onboarding (§4.4).
20. Add `android_ripple`, meaningful press states, and haptics on primary actions.
21. Give the current-night sticker its own art distinct from completed, and a breathing glow that works on Android (§4.2 #1).
22. Add an active state to the bottom nav (§4.2 #4).

**Stage 5 — the archive screens**

23. Rebuild the Light Map as a real calendar heatmap with weekday alignment, month labels, larger cells, and tappable days (§2.8); fix the legend order (§2.9).
24. Make Gallery chapter cards look like keepsake covers with month, count, and a legible sticker preview (§2.10, §4.7 #1).
25. Add paging for 90-night chapters and stop padding trial chapters to 30 slots (§2.11).
26. Wire evidence-clip playback and audio seeking into the report (§4.6 #1–3).

---

## Appendix — verification notes

- The web export in `dist/` was served at `localhost:8765` and walked end to end. Screenshots confirmed: the 34% seam, decoration clipping, the compact-mode layout on a 932px viewport, hanging Settings dividers, duplicate row icons, the invisible switch off-state, illegible Gallery thumbnails, the flat Light Map chapter swatch, and the legend ordering.
- DOM measurement confirmed: the highlight band (520 × 283.6px, `rgba(255,255,255,0.18)`, hard edge), heatmap cells at 6.15px in 7 rows of 53, 8/9/10px text on the Light Map, and 40px segmented-tab targets.
- Contrast ratios were computed from the exact token hex values against both real background colours.
- **Not verified on device:** everything tagged **[N]** — Android `elevation`/`overflow` behaviour, `shadowOffset` omissions, native keyboard avoidance, Dynamic Type scaling, `adjustsFontSizeToFit` on Android, and the `flex: 1`-inside-`ScrollView` question in §2.14. These need an iOS/Android development build to confirm or dismiss.
