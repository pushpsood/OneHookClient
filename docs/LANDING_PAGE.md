# OneHook Landing Page

The public home page at `/`. It introduces OneHook's "one connection at a time" idea, sends
visitors to the invite, sign-in, Dating Science and Private Messenger pages, and hosts the in-page
Mr.OneHook mascot.

The whole page, including its copy, lives in one component: `src/components/Landing.tsx`.

## Running it

```bash
npm run dev        # Vite dev server on http://localhost:3000
```

The page needs no backend. The floating Mr OneHook chat widget calls the chatbot service directly
(see "Mr OneHook on the landing page").

## Where the buttons go

| Control | Destination |
|---|---|
| "Redeem Invite" (nav; "Sign up" on small screens), "Redeem your invite" (hero and final CTA), "Start the conversation" | `/redeem`. Web sign-up is off (`WEB_SIGNUP_ENABLED = false` in `src/config/signup.config.ts`), so `RedeemInvite` shows `SignupInAppNotice` |
| "Sign in" (nav), "I have an account" (final CTA) | `/login`. After sign-in, `Login` navigates to `/auth/setup`, which continues to `/app` (and from there to `/onboarding` while the account is still onboarding) |
| "Dashboard" (nav, shown instead of "Sign in" when signed in) | `/app` |
| "Logout" (nav, signed in only) | `getCognitoAuth().logout()`, then the store `logout()`. Errors from the Cognito call are ignored. The page stays on `/` |
| Dating Science / Private Messenger links | `/science` / `/messenger` |
| Pricing | `/pricing` |
| Philosophy, How it works, Intelligence, Get the app | smooth-scroll to `#philosophy`, `#features`, `#under-the-hood`, `#get-app` |

Signing out from inside the app (`src/app/AppContent.tsx`, `performLogout`) asks for confirmation,
then navigates to `/`.

## Page structure

Sections in render order. Chapter numbers come from the `Kicker` component's `chapter` prop.

1. **Navigation** (fixed). `BrandWordmark` (`/media/onehook-512.png` plus the text "ONEHOOK."),
   a chrome pill with Dating Science and Private Messenger, the four section links, Pricing, and the
   account buttons. A layout effect measures two hidden copies of the nav and folds links into an
   "Explore" dropdown when they would overflow: level 0 shows everything inline, level 1 folds the
   four section links, level 2 folds everything. Below `md` there is a separate "Explore" menu. A
   scroll-spy underlines the section whose top has passed 38% of the viewport height; a nav click
   holds the highlight until its smooth scroll stops (180 ms without scrolling, at most 3 s).
2. **Hero.** Background video on black, the kicker "By invitation · One at a time", and the
   `HeroHeadline` "One connection. Zero distractions." A `Typewriter` types the subline "Talk to
   someone ready to prioritise you." and, from `sm` up, "Locked end-to-end, so only the two of you
   can read it." Below it: Dating Science, "Redeem your invite" (shortened to "Redeem invite" when
   the full label does not fit) and Private Messenger; the line "Have an invite code? Redeem it in
   seconds. Not yet? Ask a member to bring you in."; `HeroBadges` ("End-to-end encrypted", "One match
   at a time", "Matched by science", on one line or stacked one per line); and "Made in India, for
   the world".
3. **Couple stories** ("Every hook starts with a sentence."). An accordion of the four hard-coded
   `COUPLE_STORIES` (Aisha & Rohan, Noah & Priya, Dev & Sara, Meera & Kabir), each with an opener,
   names, city, an "origin" pill (Met on OneHook / Joined as a couple) and a "presence" pill. Each
   card uses `CoupleIllustration`, an anonymous SVG of two faceless busts, instead of a photo. The
   spotlight moves every 4.5 s; hovering the row pauses it, and hovering or focusing a card selects
   it. On touch screens a horizontal swipe of at least 40 px changes the card. Dots below choose a
   card directly. Code comments describe these as real couples; that cannot be verified from this
   repository.
4. **01 Philosophy** (`#philosophy`). Heading "Connection isn't a numbers game." A full-bleed
   manifesto panel over a grayscale photo (colour on hover): "We're not here to maximize your
   options. We're here to make one of them count.", a paragraph about the single-active-connection
   rule, and the quote "The secret of wisdom is knowing what to leave out." From `lg` up a
   `ManifestoPhone` device mock sits beside the text, with three floating cards ("It's a match / Say
   hello to Isha", a profile photo and an "End-to-end encrypted" pill). Then "What we hold to":
   `PrincipleValues` with four cards, Intention, Constraint, Authenticity and Privacy.
5. **02 How it works** (`#features`). A `RelationshipToggle` (Single / Seeing someone) switches
   the copy. Single: "Three steps. One focus." Seeing someone: "Two steps. One person." The three
   step cards are Discover with Intent, Connect with Purpose and "Get Hooked, Intentionally". For
   "Seeing someone", the Discover card stays in place as a dashed "Already found" card. "Before
   OneHook" and "After OneHook" lines frame the cards, and a chrome link points to `/science`
   (Single) or `/messenger` (Seeing someone).
6. **03 Intelligence** (`#under-the-hood`, inside the `#features` section). "The science of one good
   match." with six labels: Truly nearby, Read for meaning, A two-way spark, Your intent, respected,
   A fair shot for everyone, Private by design. An "Explore the science" button opens `/science`.
7. **Mr.OneHook** (`#mascot`). See "Mascot" below.
8. **04 Get the app** (`#get-app`). "Your one connection, in your pocket." App Store and Google Play
   badges, and from `lg` up a QR code. Both store links in `src/config/app-store-links.ts` are
   currently `null`, so both badges read "Coming soon" and the footnote reads "Already a member? Sign
   in on the web" (link to `/login`). The QR code (`qrcode.react`, level H, with the brand mark in
   the middle) always encodes `APP_DOWNLOAD_URL` (`https://app.onehook.club`) and is captioned "Scan
   to install".
9. **Final CTA.** Kicker "Invite-only · Limited spots", heading "Ready for one real thing?", then
   "Redeem your invite" and "I have an account".
10. **`SiteFooter`** (`src/components/common/SiteFooter.tsx`).
11. **`StickyCta`** (`src/components/common/StickyCta.tsx`, shared with `/science`). A floating bar
    with "Get the app" (scrolls to `#get-app`) and "Redeem invite". It appears while scrolling down
    past 70% of the first screen, and hides when scrolling up, when the footer is in view, or while
    the Mr OneHook chat window is open.

Arriving with a hash (for example `/#get-app`) scrolls to that section after layout.

## Where the copy lives

All text is inline JSX or a constant in `Landing.tsx`:

| Content | Location |
|---|---|
| Hero headline words | `HERO_WORDS` |
| Hero badges | `HeroBadges` |
| Couple stories | `COUPLE_STORIES`, with pill labels in `ORIGIN_META` / `PRESENCE_META` |
| Principle cards | `PRINCIPLE_VALUES` |
| How-it-works steps | `allHowItWorksSteps` (inside `Landing`) |
| Device mock profile, chat thread and profile rows | `PHONE_PROFILE`, `PHONE_OWNER`, `PHONE_THREAD`, `PHONE_PROFILE_ROWS` |
| Membership names in the device mock | `MOST_POPULAR_TIER`, `PAID_TIER_NAMES` from `src/config/membership.config.ts` |

`OPENERS` is defined in the file but not rendered anywhere.

Page title, description and JSON-LD come from `ROUTE_SEO['/']` in `src/config/seo-routes.ts`
(rendered by `Seo`). The visually hidden text inside the `<h1>` is the sentence screen readers get.

## Assets

All under `public/` and served from the site root.

| Use | File |
|---|---|
| Hero video and poster | `/media/young-couple-in-love-on-a-romantic-date-2022-03-31-17-43-11-utc-1280.mp4`, `...-poster.jpg` |
| Philosophy manifesto backdrop | `/media/aerial-view-of-the-city-in-the-fog-5ZBZNUT-1600.jpg` |
| Step 1, Discover with Intent | `/media/man-with-backpack-walking-on-snow-covered-forest-b-JAJ77DS-1600.jpg` |
| Step 2, Connect with Purpose | `/media/man-playing-guitar-close-up-1600.jpg` |
| Step 3, Get Hooked | `/media/photodune-33277756-pleased-redhead-woman-student-watches-training-webinar-1600.jpg` |
| Device mock and floating card photos | `/media/profile-demo/profile-1.jpg`, `profile-2.jpg`, `profile-3.jpg`, `profile-male-1.jpg` |
| Brand mark (wordmark, device mock, QR centre) | `/media/onehook-512.png` |
| Fade below the Intelligence block | `/gradient-fade.png` |

There are no remote images. The only external media is the mascot's YouTube embed.

## Styling

- Tailwind CSS 4 through `@tailwindcss/vite`. There is no `tailwind.config.js`; theme tokens are
  defined in `src/index.css` (`:root` and `@theme`). On public routes `--color-accent` is
  `#1a1a1a`, so `bg-accent` / `text-accent` are near-black.
- Fonts are Inter (sans), Playfair Display (serif) and JetBrains Mono, loaded from Google Fonts in
  `index.html`. Section headings are light sans (`SECTION_TITLE`). The `Accent` component sets one
  word per heading in Playfair italic, either with a brushed-silver gradient (`tone="silver"`, dark
  sections) or in the accent colour (`tone="ink"`, light sections).
- From How it works down, the background is `#EEF0F3`; the hero, the couple stories, Intelligence
  and Get the app are dark.

## Animation

Animations use the `motion` package (`motion/react`) plus CSS keyframes in `src/index.css`.

| Effect | How it works | Reduced motion |
|---|---|---|
| Hero headline accent | The Playfair accent hops between the four words, starting after 1.6 s, holding 1.3 to 2.7 s, with an 18% chance of a 110 ms "misfire" onto another word. Each change plays the `oh-glitch-in` / `oh-glitch-out` keyframes | Static accent on "One" |
| Typewriter subline | 34 ms per character after 350 ms | Full text at once |
| Section entrances | `whileInView` fade/slide, once | Not disabled |
| Manifesto panel | Scroll-linked (`useScroll`, offset `center end` to `end end`): photo scale 1.08 to 1.26, headline scale 0.9 to 1 and opacity 0.4 to 1, vignette peaking mid-travel | Off (static vignette) |
| Device mock and floating cards | Pointer tilt (up to ±8° around Y and ±6° around X) with springs; the cards move with scroll at different speeds | Off |
| Couple accordion | Active card grows (`flexGrow` 5 vs 1) on a spring | Instant |
| Principle cards | On hover-capable screens of at least 1024 px, the hovered column widens to 1.45fr | CSS transition off |
| Relationship toggle | Pulsing ring and "Which one are you?" prompt until the first pick | Prompt only |
| Chrome pill shine | `oh-chrome-sweep` keyframes, 4.8 s loop | Off |
| Intelligence backdrop | `ScienceOrbitBackdrop` (from the science page), focused while "Explore the science" is hovered or focused. Mounted only on screens of at least 1024 px with a fine pointer, because it is heavy on phones | Handled inside the component (`useReducedMotion`) |
| Get the app | From `lg` up, the copy slides out from behind the QR with a clip-path; otherwise a fade-up | Fade-up |
| Paint stroke | From `lg` up, a pink (`#ff69b4`) five-layer SVG curve runs from the couple-stories section to the mascot's brush tip (`#mascot-core`). Coordinates are recomputed on resize | Not disabled |

The couple spotlight keeps advancing every 4.5 s under reduced motion; only its transition becomes
instant.

## Mascot

The `#mascot` section renders `AlienScanner` from `src/components/mascot` (the pink egg-shaped
Mr.OneHook with a paint brush and bucket; see `src/components/mascot/README.md`) with
`primaryColor="#ff69b4"`, `scanColor="#0052CC"`, `forceExcited` and `hideTooltips`. Its size is
`clamp(84px, 28vw, 180px)`.

- The button above it ("Click to watch Mr.OneHook explain more about onehook.club") and a click on
  the mascot open a YouTube embed from `youtube-nocookie.com` (video `Vphot1Wxvx8`, autoplay) in place
  of the section content. "Close Video", Escape, or a click outside the player and the mascot close
  it.
- A pill below links to Mr.OneHook's Instagram (`instagram.com/mr.onehook`) and YouTube
  (`youtube.com/@mr.onehook`).

### Mr OneHook on the landing page

Separately from the in-page mascot, `MrOneHookDock` (`src/components/Chatbot/MrOneHookDock.tsx`)
mounts the floating `ChatbotWidget` on `/`, `/pricing` and `/science`. The widget stays hidden while a
section marked with `hideMrOneHook` fills the screen; on the landing page those are the hero and the
couple stories. Its label reads "Say hi to Mr.OneHook" while `#mascot-container` is on screen and
"Talk to Mr.OneHook!" otherwise. Before the first message it asks for gender and, optionally, who the
visitor is into. Messages and those two answers go to `POST ${chatbotUrl}/api/public/product-chat`
with no authorization header.

## SEO and pre-rendering

`/` is in `PRERENDER_BODY_PAGES` (`src/prerender-entry.tsx`). At build time the `prerender-pages`
plugin in `vite.config.ts` renders `Landing` to HTML inside `dist/index.html`, adjusting Motion's
initial styles so the static HTML is visible. In the browser, `createRoot` replaces that markup.
The route is listed in `sitemap.xml`.

## Telemetry

Every control spreads `trackProps(UiElement.…)` as the telemetry contract requires
(`TELEMETRY_CONTRACT.txt`). Landing uses `LANDING_NAV_LINK`, `LANDING_SECTION_NAV`,
`LANDING_MOBILE_MENU_TOGGLE`, `LANDING_LOGIN`, `LANDING_GET_STARTED`, `LANDING_DEMO_INTERACT`
(couple dots and cards, relationship toggle, mascot, video close, device-mock tabs),
`LANDING_SOCIAL_LINK`, `LANDING_OPEN_IN_APP`, and `SETTINGS_SIGN_OUT` for the nav Logout button.
The swipe gesture carries `data-track-exempt` because the dots record the same choice.

## Tests

No test in `src/tests` renders or imports `Landing.tsx`. The telemetry tests (`telemetry-coverage`,
`telemetry-guard`) scan the source and cover its controls, and `seo-routes.test.ts` covers
`ROUTE_SEO`.

Manual checks:

- [ ] `/` loads; the hero video plays muted, or the poster shows if autoplay is blocked.
- [ ] Signed out, the nav shows "Sign in" and "Redeem Invite"; signed in, "Dashboard" and "Logout".
- [ ] Section links scroll to the right section and the underline follows scrolling.
- [ ] Narrowing the window folds the nav into "Explore" in two stages.
- [ ] The Single / Seeing someone toggle swaps headline, copy and the Discover card.
- [ ] Clicking the mascot plays the video; Escape and a click outside close it.
- [ ] With "reduce motion" on, the headline accent stays on "One" and the typewriter text is
      complete at once.
- [ ] Mr OneHook stays hidden over the hero and the couple stories.

## Deployment

The page ships in the normal production build (`npm run build`). Production deploys go through the
AWS CodePipeline described in the README ("Deployment"); there is no separate landing-page deploy.
