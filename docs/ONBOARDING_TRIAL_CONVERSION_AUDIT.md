# Thirty Nights — Onboarding, Seven-Night Preview, Report Readiness, and Purchase Conversion Audit

Date: 2026-08-10  
Scope: every current first-run screen, permission/consent prompt, recording milestone, seven-night checkpoint, report state, paywall, authentication handoff, purchase/restore path, and the 25-item popup catalog.  
Deliverable type: research and product specification only. No application code was changed.

## Executive decision

The app's main conversion problem is not visual polish or the wording of one button. The default journey does not prepare the product's promised night-seven payoff.

A new user is never asked to create a recoverable account, enable recording backup, or consent to cloud/AI processing during onboarding or the first six nights. Those three conditions are required to upload recordings and generate the seven-night reflection. The intended night-three backup prompt exists only in a developer catalog and is never shown. At night seven, the app finally explains the missing prerequisites, but it provides no button to complete them. After that screen closes, the instructions are difficult or impossible to find again.

This breaks the intended value loop:

> Seven free nights → receive a meaningful personal reflection → understand the value → buy nights 8–30.

The current default loop is closer to:

> Seven free nights → learn that the report was never prepared → search Settings for account, consent, backup, and sync → encounter a two-step paywall and another account detour → possibly see a successful charge reported as a sync failure.

The recommended product model is:

> **First 7 nights included free, with no card. Unlock nights 8–30 with one localized, one-time payment. Nothing renews.**

This is not a store-billing free trial because there is no automatic conversion or recurring charge. Calling it a “free trial” can create the wrong expectation. Use “7 nights included free,” “free seven-night preview,” or “your first 7 nights are included.”

## Highest-priority findings

| Priority | Finding | User/business effect |
|---|---|---|
| P0 | The promised night-seven report is not achievable on the default path. | The app withholds its strongest proof of value at the exact purchase moment. |
| P0 | The night-three account/backup prompt is catalog-only; `seenBackupPrompt` is marked true without displaying anything. | The app permanently records that it showed help it never showed. |
| P0 | Night-seven setup instructions are a dead end and are not durably reopenable. | A user who closes the screen must remember a multi-step Settings path. |
| P0 | Purchase verification is coupled to recording backup. `syncNow()` throws when recordings remain unbacked, even if a store charge succeeded. | A paid user can be told that the purchase failed or remain on the paywall. This is a refund and trust risk. |
| P0 | Purchase entitlement verification is one sync attempt, with no durable pending state or polling. | A valid purchase can remain locked while a webhook is still processing. |
| P0 | Apple requires explicit permission before sharing personal data with third-party AI and clear disclosure of where it is shared. Current copy says only “configured AI vendors.” | Likely store-review/privacy risk; it also weakens user trust. |
| P1 | The checkpoint journey is held in temporary React state. Closing/restarting the app loses the sealing → reward → generation → report route. | Users can miss the only report/paywall handoff. |
| P1 | The paywall asks users to “See the chapters,” then makes them take another step before seeing/buying the plan. | High-intent users face unnecessary taps and ambiguous terminology. |
| P1 | Authentication unmounts and resets the paywall. | Users must repeat the paywall after creating an account; plan selection is lost. |
| P1 | The seven-night experience is presented as a complete seven-night chapter, not as progress toward Thirty Nights. | The free experience does not build desire to finish nights 8–30. |
| P1 | The visible Restore action uses RevenueCat `syncPurchases()` instead of the user-triggered `restorePurchases()` flow recommended by RevenueCat. | Restore behavior and identity transfer can be unreliable or surprising. |
| P1 | Microphone education is shown on every visit to the question flow, even after permission is already granted. | Repeated friction in the core nightly habit. |

## What is already good and should be preserved

- The product metaphor is distinctive: a question arrives, one honest take is sealed, and the accumulated voice becomes a keepsake.
- The microphone system prompt is preceded by an in-context explanation instead of appearing on cold launch.
- Notification permission is requested after the person selects a reminder time and sees a realistic preview.
- The paywall loads localized store prices without first requiring an account.
- The paywall accurately says the current products are one-time payments and do not renew.
- Privacy Policy, Terms of Use, and Restore Purchases are visible on the paywall.
- Raw audio remains on the device until account and processing conditions are met.
- The report generation screen was improved to display real application state rather than fake timer-completed steps.
- Purchases remain server-authoritative rather than granting paid access from unverified client state.

These are strong foundations. The primary work is connecting them into one recoverable journey.

## Current first-run journey

The normal first-use path is longer than it initially appears:

1. Four onboarding slides.
2. Optional five-choice intention questionnaire.
3. Reminder-hour picker.
4. Notification primer.
5. Native notification permission dialog.
6. Personalized plan/summary screen.
7. Home.
8. Sealed-letter opening interaction.
9. Question screen.
10. “I'm ready.”
11. Microphone primer sheet.
12. Native microphone permission dialog.
13. Recording-ready screen.
14. Record and seal.
15. Sealing ceremony.
16. First-night reward.

The intention screen is optional and its answers only alter copy on the plan screen. It does not personalize questions, reminders, reports, or product behavior. The long maker note on the plan screen adds warmth but also delays first value. The flow asks for setup before the person has completed the core action.

### Current onboarding copy does not define the commercial boundary

The fourth slide says, “The first seven nights are yours,” and the plan says, “Your first 7 nights are ready.” Neither clearly says:

- no card is required;
- no automatic charge occurs;
- night 8 is locked without purchase;
- purchase extends the same story through night 30;
- the amount is a one-time localized price;
- the seven-night reflection requires account, backup, and explicit processing permission.

The onboarding plan receives a `fullLength` of 30 but does not visibly use the full-chapter end date. The user is visually trained to think “7 of 7,” while the product later wants them to want “7 of 30.”

## Current permission and consent behavior

### Notifications

Current placement is broadly appropriate:

- the person chooses a reminder time;
- the app shows the exact type of notification and frequency;
- the native permission prompt follows an intentional tap;
- declining does not block onboarding.

Recommended adjustment: merge the time choice and preview into one compact screen so the onboarding feels shorter. Keep the system prompt just-in-time.

### Microphone

Current placement is appropriately contextual, but the implementation appears to reset `permissionGranted` to false each time `QuestionScreen` mounts. Existing permission is checked only when the app returns to the foreground, not when the screen initially loads. As a result, the in-app microphone primer is displayed again each night even when permission was previously granted.

Recommended behavior:

- show the detailed microphone disclosure only before the first native request or after a denial;
- on later nights, check current permission and go directly to the recording-ready state;
- retain a short one-line reminder of the one-take behavior, not a repeated permission sheet.

### Account, backup, and AI processing

The code requires all of the following before raw recordings upload:

1. `authState === 'authenticated'`;
2. a `processingConsentVersion`;
3. a usable network permitted by the Wi-Fi/cellular preference.

None is established during onboarding. The only live consent control is:

> Settings → Account & Backup → Recording backup → “I agree — enable processing”

The sheet says data “may be processed by configured AI vendors.” This is too vague for a product that currently sends audio to OpenAI for transcription and sends transcripts to OpenAI for report generation, while using Supabase for storage. Apple’s current review guideline explicitly requires clear disclosure of where personal data is shared with third-party AI and explicit permission before sharing it.

The consent also cannot currently be withdrawn in the app; the Settings sheet only offers enablement and network choices. If consent is the legal basis, valid consent generally needs to be specific, informed, affirmative, and withdrawable. Legal counsel should confirm the applicable legal basis and retention/deletion behavior before launch.

## The missing night-three prompt

`src/data/popups.ts` describes M20:

> Trigger: After sealing night three  
> Title: Want these backed up?  
> Actions: Create account / Later

This prompt is not wired into the real UI. In `src/lib/localRepository.ts`, sealing the third recording simply sets `seenBackupPrompt` to true. There are no runtime reads of that flag. This is worse than a missing prompt because future logic would believe the person already saw it.

This missing prompt is the earliest direct cause of the night-seven failure.

## Current night-seven journey

When night seven is recorded, temporary component state sends the user through:

1. sealing;
2. reward;
3. generation/readiness screen;
4. report screen;
5. paywall, but only after another “Continue the thread” or “See the chapters” action.

### Failure state for the default user

For a default local-only user, the generation screen says variants of:

- no recoverable account yet;
- cloud processing not enabled;
- report not queued;
- turn it on in Settings → Recording backup.

The only action is “Continue.” There is no “Set up my reflection,” “Create account,” “Enable processing,” “Back up now,” or “Retry” button. The following report screen repeats the prerequisite explanation but still provides no direct setup action. Its “Continue the thread” action goes to the paywall, not to report setup.

If the person closes the app:

- `pendingReport`, the route, and the selected report are temporary component state;
- cold launch routes only to Home;
- if no report object was queued, Gallery has no report checkpoint row to reopen;
- the user must infer the Settings path from memory.

This exactly matches the reported experience: the instructions are visible once, then disappear, and the person must rediscover how to synchronize recordings.

### Missed-night edge case

The special checkpoint route is triggered when sealing nights 7, 30, 60, or 90. If night seven is missed instead of recorded, no seal event triggers that route. The server may later consider a checkpoint eligible, but the conversion/report UI is not guaranteed to appear. The durable experience must be derived from chapter/checkpoint state, not only from a one-time recording event.

## Current paywall and purchase journey

### The offer is too indirect

The expired-trial Home card says “Continue your keepsake” and “See the chapters.” The paywall begins with a value screen whose CTA is also “See the chapters.” Only the second page shows plans and prices.

At the exact moment the business wants one clear outcome, the app introduces a taxonomy (“chapters”) and an extra decision. The direct offer should be the remaining 23 nights of the same Thirty Nights journey.

### Product language conflicts

- The Home and onboarding experience treats 7 nights as a full chapter.
- The paywall says “What the next chapter adds.”
- Other paywall copy says the purchase “extends this same chapter.”
- The value screen says a reflection needs more than the current target length, while the product promises and generates a mini-reflection at night 7.

Use one model everywhere:

> Your first seven nights are included. One payment unlocks nights 8–30 in this same chapter and the full night-30 reflection.

### Ninety nights distracts from the core purchase

The app is named Thirty Nights, and the stated conversion goal is the 30-night plan. Presenting 30 and 90 as equal choices—while marking 90 as “THE FULL ARC”—creates choice and can make 30 feel incomplete. For the night-seven conversion, make 30 the single dominant offer. Put 90 behind “Compare options,” or introduce it after night 30 when it is contextually relevant.

### Account handoff loses paywall state

Purchasing requires an authenticated account. Tapping buy routes away to `AuthScreen`. Returning remounts `PaywallScreen`, whose local state starts again on the value page with the 30-night option selected. The user must repeat the paywall journey, and a previous 90-night selection is lost.

The purchase flow should either:

- permit purchase under the stable anonymous app/user identity and invite account linking immediately afterward; or
- preserve a durable `purchaseIntent` containing the product, localized price, paywall source, and return step, then return directly to the store confirmation after authentication.

The first option needs a careful server/RevenueCat identity design. The second is the smaller product change.

### A successful charge can look like a failure

After the store returns a successful transaction, the paywall calls a general `syncNow()`. That function intentionally throws if any recording is still unbacked. A default night-seven user has unbacked recordings because account/processing setup was skipped. Therefore, purchase verification can catch and display a recording-backup error after a valid charge.

Purchase entitlement verification and audio backup must be separate operations with separate statuses. Never reuse an “everything synchronized” method as the success criterion for a financial transaction.

Recommended purchase states:

- `store-confirming`;
- `server-verifying`;
- `granted`;
- `pending-approval`;
- `cancelled`;
- `failed`, with a transaction/reference-safe recovery path.

After store success, poll or subscribe until the authoritative grant appears, with a reasonable timeout that leaves a durable “Purchase received—finishing setup” state. On app foreground/restart, reconcile unfinished purchases automatically.

### Restore behavior needs correction and verification

The visible Restore button currently calls RevenueCat `syncPurchases()`. RevenueCat’s current guidance is to use `restorePurchases()` for an explicit, user-triggered restore. `syncPurchases()` is primarily intended for migration/programmatic reconciliation and may cause identity transfer/alias effects.

The 30/90 products must be configured as permanent/non-consumable entitlements. With current RevenueCat/Google Billing versions, consumed one-time Android products may no longer be queryable for restore. Test restore on a fresh install and second device with the same store account and the intended app identity.

### Auth friction on Android

The current Android auth UI presents “Continue with Apple” plus email/password. The source comments say Google sign-in may be resurfaced later. For an Android conversion flow, the absence of Google sign-in is avoidable friction. A platform-native one-tap option should be available before launch if account creation remains required.

## Popup catalog audit

The 25-item popup catalog is a design/developer preview, not an event-driven popup system. Only a subset has a live equivalent. Product decisions must be based on live triggers, not catalog presence.

| ID | Intended trigger | Live status / recommendation |
|---|---|---|
| M1 | First record attempt | Live equivalent exists. Show only before the first native microphone request. |
| M2 | Microphone denied | Live equivalent exists with Settings/check-again actions. Keep. |
| M3 | After hour picker | Live full-screen notification primer exists. Keep, preferably merged with time setup. |
| M4 | Notifications denied | No matching immediate denial sheet in the main path; current flow continues to Plan. A soft, non-shaming reminder in Settings is enough. |
| M5 | Tap sealed window | Live generic night-detail sheet exists. Keep concise. |
| M6 | Recording under 10 seconds | Live equivalent exists. Action order is safe. Keep. |
| M7 | Leave while recording | Live equivalent exists. Keep. |
| M8 | Report generation | A real state-driven full-screen readiness view exists. Add direct actions and persistence. |
| M9 | Report generation failed | Live report failure card/retry exists. Keep and add support/reference path. |
| M10 | Three or more missed nights | Catalog-only. Avoid a shaming modal; use inline compassionate copy when relevant. |
| M11 | After seven-night report | Catalog-only as a sheet, while a paywall path exists elsewhere. Replace with the direct single-offer paywall after the report value moment. |
| M12–M13 | Delete everything / second confirmation | Live deletion sheet exists but does not require typed DELETE. Current clear multi-option confirmation is preferable on mobile. |
| M14 | Restore found nothing | No exact live result; restore currently reports generic sync text. Add platform-localized result (“Google Play account” or “App Store account”). |
| M15 | Storage low | Catalog-only. Add only when storage can actually be measured and the recording is at risk. |
| M16 | Backup pending offline | Home status line is the better persistent pattern. Keep it inline, not a popup. |
| M17 | Sign out with local recordings | Sign-out is deliberately not offered, so this catalog item is obsolete. |
| M18 | Reminder changed after 8 PM | Catalog-only. Current scheduling behavior should be verified before adding. |
| M19 | Five-minute cap | Automatic recording completion exists; a short inline explanation is preferable to a popup. |
| M20 | After sealing night three | **Critical missing live trigger.** Implement as contextual setup, but ideally begin after night one and persist after dismissal. |
| M21 | Purchase while anonymous | Auth route exists, but not as a continuity-preserving sheet. Preserve purchase intent. |
| M22 | Duplicate email | Auth surfaces provider errors but no dedicated duplicate-email recovery choice. Add only if actual provider errors require it. |
| M23 | Interrupted purchase recovered | No durable recovered-purchase success screen. Add “Nights 8–30 are open” with “Start Night 8.” |
| M24 | Ask-to-Buy pending | A toast exists, but pending state is not durable. Persist it and reconcile on foreground. |
| M25 | Account deletion | Live deletion flow exists. Keep. |

The rule for new prompts should be: use a modal only when the person must make an immediate decision or a destructive action needs confirmation. Use persistent cards/checklists for multi-step, asynchronous, or recoverable work.

## Recommended short onboarding

Do not put every permission and legal paragraph on cold start. Split the journey into a concise early disclosure and contextual consent/action.

### Screen 1 — Value and free boundary

**Headline:** One honest answer each night.  
**Body:** Speak once, seal it, and hear the patterns that only time can reveal.  
**Offer line:** Your first 7 nights are included free. No card required.  
**CTA:** Begin my seven nights

Show the seven-sticker preview and a small “How it works” expandable link rather than four separate slides.

### Screen 2 — How the full journey works

Use a simple timeline:

- Tonight: answer one question in your own voice.
- Night 7: receive your first reflection.
- After night 7: unlock nights 8–30 with one payment; nothing renews.

Also show the concise privacy promise:

> Recordings stay on this phone unless you choose secure backup and reflection processing. We ask before anything is uploaded or sent to an AI provider.

**CTA:** Choose my reminder

### Screen 3 — Reminder and notification

Combine the current hour picker and notification preview. Keep “Not now.” Trigger the native notification prompt only after “Allow one nightly reminder.”

### Remove or defer

- Defer the intention questionnaire until after the first night, or remove it unless it produces real personalization.
- Move the long maker note to an About screen, post-first-night reward, or occasional journal artifact.
- Do not request microphone permission until the first recording action.
- Do not show a bulk OS-permission screen at startup.

This reduces the pre-value path while making the commercial model clearer than it is today.

## Recommended report-readiness journey

### Before first upload: explicit disclosure and permission

Immediately after the first successful seal—or before the first action that uploads data—show one contextual setup screen:

**Headline:** Prepare your seven-night reflection  
**Body:** Your recording is safe on this phone. To create your reflection at night 7, Thirty Nights needs to securely back up your recordings and process them.

The detailed disclosure should plainly name:

- what leaves the phone: raw voice recordings and associated night/date metadata;
- where it is stored: the production storage provider, currently Supabase;
- where it is processed: OpenAI for transcription and reflection generation;
- why: to create the person’s private reports and playable evidence clips;
- security model: encrypted in transit and at rest, but not end-to-end encrypted;
- retention/deletion policy and how to delete;
- whether data is used for provider model training, based on the actual provider contract/settings;
- how to withdraw permission and what happens to already-uploaded data.

Do not claim “not used for training,” “no human review,” or a retention period until operational configuration and contracts support the claim.

**Primary CTA:** Create account and prepare my reflection  
**Secondary CTA:** Keep this night on my phone for now

Consent must be a clear affirmative action separate from acceptance of general Terms. If account creation is needed, maintain continuity through both actions.

### If setup is dismissed

Do not rely on another transient popup. Put a persistent Home card directly above the backup status:

> **Your night-7 reflection needs setup**  
> 1 night saved on this phone · Account, permission, and backup still needed  
> **Finish setup**

Update the card from real state:

- account needed;
- processing permission needed;
- waiting for Wi-Fi;
- uploading 3 of 7;
- processing;
- report ready;
- action needed, with Retry.

### Reminder cadence

- After night 1: present the contextual setup once.
- After night 3: if incomplete, show a short sheet pointing to the persistent card. Do not mark it seen until actually rendered.
- Night 6/Home: inline “Your first reflection arrives tomorrow” plus any remaining setup step.
- Before sealing night 7: if still incomplete, explain that the recording can remain local but the reflection cannot be generated until setup is completed. Do not block recording.
- After night 7: show the persistent state screen with direct actions and safe-to-close messaging.

## Recommended night-seven purchase moment

The highest-quality conversion moment is after the user sees or listens to the personal seven-night reflection. If processing is still underway, let them buy independently, but keep the progress UI honest.

### Direct offer copy

**Eyebrow:** 7 of 30 nights kept  
**Headline:** Continue your chapter.  
**Body:** Unlock nights 8–30 and your full night-30 reflection. Your first seven nights stay exactly where they are.  
**Price:** {localized price} once · no subscription · nothing renews  
**Primary CTA:** Unlock nights 8–30 — {localized price}  
**Secondary:** Not now  
**Links:** Restore purchase · Terms · Privacy

Avoid “See the chapters.” The user is not browsing a catalog; they are continuing the story already in progress.

### If the person dismisses

- Home becomes a durable locked-night state, not a normal completed chapter.
- Night 8 is visible as the next destination and tapping it opens the direct offer.
- The primary Home card says “Unlock nights 8–30,” includes the localized price once loaded, and opens the plan screen directly.
- Gallery, the seven-night report, export, Settings, deletion, and Restore remain accessible.
- Reopening the app should not show an unavoidable popup every time. The locked Home state is the persistent conversion surface; intentional taps reopen the paywall.

### Purchase completion

On verified grant:

**Headline:** Nights 8–30 are open.  
**Body:** Your seven nights are already part of the chapter. Tonight’s next question is ready when its date arrives.  
**CTA:** Go to Night 8

If the store marks the purchase pending, retain a durable status and reconcile on foreground. Do not make the person purchase again.

## Required state model

The UX cannot be reliable if these are only temporary route flags. Persist or derive at least:

- onboarding version completed;
- microphone primer shown / current OS permission;
- report-processing disclosure version and affirmative permission state;
- permission withdrawal state/time;
- backup prompt actually shown, not merely eligible;
- report readiness by checkpoint;
- unresolved checkpoint that should reopen after restart;
- paywall source (`night7_report`, `locked_night8`, `home_card`, `settings_restore`, etc.);
- pending product/purchase intent across authentication;
- store transaction pending verification;
- verified entitlement/grant;
- restore result;
- last surfaced purchase invitation, for frequency control.

The UI should be derived from durable domain state. Sealing night seven is an event; “night-seven checkpoint needs attention” is a state.

## Measurement plan

No authoritative source gives one universally best popup cadence for every app. Instrument the journey and test it.

Minimum events, with no recording content or sensitive text in analytics:

- onboarding viewed/completed/skipped by step and version;
- reminder time accepted, notification prompt shown, granted, denied;
- microphone primer shown, native prompt shown, granted, denied;
- first recording started/sealed;
- each milestone night sealed/missed;
- report setup viewed/accepted/deferred;
- account started/completed/failed by method;
- processing permission accepted/withdrawn and disclosure version;
- upload waiting/started/completed/failed, counts only;
- checkpoint report queued/ready/failed/viewed/listened;
- paywall viewed by source and variant;
- plan selected;
- checkout started/cancelled/pending/store-success/server-granted/failed;
- time from store success to grant;
- restore started/found/not-found/failed;
- locked Night 8 tapped;
- purchase success screen viewed and Night 8 opened.

Primary funnel:

> install → first seal → three seals → report-ready setup complete → night 7 complete → report viewed → paywall viewed → checkout started → authoritative grant → night 8 opened

Guardrail metrics:

- onboarding completion time and abandonment;
- permission denial rates;
- night-one completion;
- report setup completion before nights 3, 6, and 7;
- report readiness latency/failure;
- purchase cancellation/refund/support contacts;
- duplicate checkout attempts while a transaction is pending.

## Implementation order

### Phase 0 — Financial and policy safety

1. Separate purchase entitlement verification from recording backup/sync errors.
2. Add durable purchase-pending verification and foreground reconciliation.
3. Verify 30/90 products are non-consumable permanent entitlements and correct Restore behavior on both stores.
4. Use a user-triggered RevenueCat restore flow and show explicit results.
5. Replace vague third-party-AI disclosure with a reviewed, provider-specific disclosure and affirmative permission.
6. Add a way to withdraw processing permission and define deletion/retention effects with counsel.

### Phase 1 — Make the promised free payoff work

1. Wire the post-first-night / night-three setup journey.
2. Correct `seenBackupPrompt` semantics.
3. Add direct account, consent, backup, and retry actions to readiness/report states.
4. Make checkpoint readiness durable and reopenable after restart or a missed checkpoint night.
5. Show observable upload/report progress and safe-to-close messaging.

### Phase 2 — Make purchase direct

1. Replace “See the chapters” with the direct nights 8–30 offer.
2. Make 30 nights the dominant post-seven-night plan; demote 90 to comparison or later upsell.
3. Preserve purchase intent through account creation, or support a carefully designed anonymous purchase flow.
4. Add verified-success and durable-pending screens.
5. Turn locked Night 8 and the Home card into persistent purchase entry points.

### Phase 3 — Shorten onboarding

1. Compress four intro slides to two value/business-model screens.
2. Combine reminder time and notification preview.
3. remove/defer the intention questionnaire unless it creates meaningful personalization.
4. show the microphone primer only when permission is actually needed.

### Phase 4 — Experiment

Test, one variable at a time:

- paywall immediately after report summary versus after report audio/first evidence quote;
- one 30-night offer versus 30 primary + hidden 90 comparison;
- “Continue your chapter” versus “Unlock nights 8–30” headline;
- post-night-one report setup versus night-three setup, while requiring completion by night six;
- concise versus detailed value page, without hiding price or payment terms.

## Acceptance criteria

A release should not ship until all of these can be demonstrated on physical iOS and Android devices:

1. A fresh user can understand before starting that seven nights are free, no card is required, and nights 8–30 require one non-renewing payment.
2. A user can finish the pre-value onboarding quickly without answering the intentions questionnaire.
3. Notification and microphone prompts appear only in context and denials have a recoverable path.
4. A user who opts into a night-seven reflection sees exactly what data is uploaded, where it is stored, that it is sent to OpenAI, and why.
5. A user can decline cloud processing and continue recording locally without deceptive report promises.
6. A user who defers setup sees a persistent, direct “Finish setup” path through night seven.
7. Closing the app during the night-seven milestone does not lose the checkpoint or instructions.
8. A missed night-seven edge case still produces the correct durable checkpoint/paywall state.
9. The night-seven reflection generates without manual Settings discovery for a user who opted in.
10. The first paid offer directly states nights 8–30, the localized full price, one-time charge, and no renewal.
11. Creating an account from the checkout returns to the exact plan and continues checkout without repeating the paywall.
12. A successful store purchase can never be reported as failed because audio backup is incomplete.
13. A delayed or pending store purchase survives restart and unlocks exactly once after verification.
14. Restore succeeds on a clean install/second device and a not-found result names the correct platform store account.
15. A verified buyer sees “Nights 8–30 are open” and a direct path to Night 8.

## Research and policy sources

The following policy items are requirements or strong platform guidance. Conversion recommendations are product inferences and should be A/B tested.

- [Google Play Billing: one-time products](https://developer.android.com/google/play/billing/one-time-products) — one-time products are a single charge for non-renewing access. This supports describing the current seven free nights as included access rather than an auto-renewing billing trial.
- [Google Play Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533) — one-time benefits must not be disguised as subscriptions; true trials require clear duration, post-trial price, renewal, and cancellation disclosure.
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738) — digital features must use Play Billing where applicable; prices and purchase requirements must be accurate and clear.
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311) — prominent in-app disclosure and affirmative consent are required when sensitive data collection/use may not be within reasonable user expectation.
- [Android runtime permission guidance](https://developer.android.com/training/permissions/requesting) — ask in context when the person invokes the feature, allow cancellation, and degrade gracefully after denial.
- [Android onboarding guidance](https://developer.android.com/design/ui/mobile/guides/patterns/onboarding) — collect only critical information upfront and show value before unnecessary setup.
- [Android persistent work guidance](https://developer.android.com/develop/background-work/background-tasks/persistent) — supports durable background upload/report work with observable state rather than a disappearing instructional popup.
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — sections 2.3.2, 3.1.1, 5.1.1(v), and 5.1.2(i) cover clear IAP metadata, in-app purchase/restore, optional login unless account features are significant, account deletion, and explicit disclosure/permission before sharing personal data with third-party AI.
- [RevenueCat restoring purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases) — recommends a visible `restorePurchases()` action and describes `syncPurchases()` as a different programmatic/migration mechanism.
- [RevenueCat State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) — broad evidence that conversion is front-loaded and paywall timing matters. These are subscription benchmarks and are directional, not direct benchmarks for this one-time-purchase product.
- [RevenueCat paywall timing/JTBD case study](https://www.revenuecat.com/blog/growth/jtbd-paywall-optimization) — supports placing an offer after an actual value/“aha” moment instead of merely showing it as early as possible.
- [European Commission: when consent is valid](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-consent-valid_en) — if consent is the legal basis, it must be freely given, informed, specific, affirmative, clear, and withdrawable.

## Final recommendation

Do not solve this by adding more one-time popups. Solve it with three durable surfaces:

1. a shorter onboarding that clearly defines “7 free, then one payment for nights 8–30”;
2. a persistent report-readiness card/checklist with direct setup and retry actions;
3. a direct, single-purpose night-seven offer that survives account creation, store delay, dismissal, and app restart.

The product should let the person feel the value before asking for payment, but it must prepare that value before night seven. That is the missing bridge between the free experience and the full Thirty Nights purchase.
