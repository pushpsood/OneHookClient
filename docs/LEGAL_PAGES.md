# OneHook Legal Pages

What the Privacy Policy, Terms of Service and Contact pages contain, how they are built, and where
their text does not match the implementation. This document describes the pages; the pages
themselves are the published text.

## Files and routes

| Route | Component | Stated dates |
|---|---|---|
| `/privacy` | `src/components/legal/Privacy.tsx` | Last updated October 27, 2026; effective from May 23, 2026 |
| `/terms` | `src/components/legal/Terms.tsx` | Last updated and effective May 23, 2026 |
| `/contact` | `src/components/legal/Contact.tsx` | none |

`src/components/legal/Pricing.tsx` (`/pricing`) shares the folder but is a membership page, not a
legal page.

Each page renders `Seo` with its `ROUTE_SEO` entry (`src/config/seo-routes.ts`), `SiteHeader` with a
`pageTitle`, the content with a Motion fade-in, and `SiteFooter`. The footer links to all three
pages. All three routes are public, indexable, listed in `sitemap.xml`, and in
`PRERENDER_BODY_PAGES` (`src/prerender-entry.tsx`), so the build writes their full text into
`dist/privacy/index.html`, `dist/terms/index.html` and `dist/contact/index.html`. No test in
`src/tests` checks the text of these pages.

## Privacy Policy (`Privacy.tsx`)

Sections, in order:

1. **Introduction.** Data minimisation.
2. **Information We Collect.** Account information (email, name and date of birth, optional birth
   time / time zone / birthplace, location area, photos, videos and audio, profile details,
   preferences, optional sexual orientation), usage information, and communication data.
3. **How We Use Your Information.** Includes the `#birth-details` block: date of birth is given
   once, shown only as age, correctable by support with proof at most twice; optional birth details
   are used only for traditional-compatibility ordering, birthplace coordinates are rounded to about
   1 km, and birthplace search uses Amazon Location Service.
4. **Applying with a Video (Admissions Assist)** (`#admissions-assist`). Data collected for video
   applications, automated checks (check words, Amazon Rekognition content moderation, spoken-content
   phrases, speaking time), reviewer access, Amazon Transcribe redaction, the Admissions Assist
   model, consent, decisions (14-day invite, 6-month reapply), retention (90 days after a decision,
   30 days after an invite is used), withdrawal, and storage in AWS Mumbai.
5. **Reporting & Safety** (`#reporting-safety`). Report contents; the optional chat copy (last 200
   messages or 30 days of one conversation, whichever is smaller, text only, previewed before
   sending); access controls; queue prioritisation; outcomes and appeals; self-harm and minor reports;
   child sexual abuse handling (reporting to Indian authorities, optionally NCMEC, 180-day
   preservation); retention (attached chat 180 days after close, case record 365 days).
6. **Data Security & Encryption.** End-to-end encryption, data at rest, data in transit, access
   controls, audits.
7. **We Do Not Share Your Data**, with limited exceptions (legal, safety, service providers,
   consent).
8. **Data International Transfers.** Data is stored in India.
9. **Data Retention.**
10. **Your Privacy Rights.** Requests to `privacy@onehook.club`, answered within 30 days.
11. **Regulatory Compliance.** GDPR, CCPA, HIPAA & HITECH, SOC 2 Type II, COPPA.
12. **Security Incident Response.**
13. **Third-Party Service Providers.**
14. **Contact Us.**
15. **Changes to This Policy.**

Deep links: `ADMISSIONS_ASSIST_ANCHOR` (`'admissions-assist'`) and `REPORTING_SAFETY_ANCHOR`
(`'reporting-safety'`) are exported. Nothing else in this repository imports them; the comments say
they are the targets of the native app's video-consent checkbox and report flow. Because the
app-wide `ScrollToTop` leaves hashed navigations alone, `Privacy` scrolls to `location.hash` itself
in a `requestAnimationFrame` after mount.

## Terms of Service (`Terms.tsx`)

Sections: 1 Agreement to Terms, 2 Service Description (invite-only dating platform), 3 Eligibility &
Account Terms (18+, one account per person), 4 Acceptable Use Policy, 5 User-Generated Content
(including "Message Privacy"), 6 Identity Verification & Safety (photo verification, optional
background checks), 7 Prohibited Activities, 8 Intellectual Property Rights, 9 Disclaimer of
Warranties, 10 Limitation of Liability, 11 Moderation & Account Enforcement (content removal,
warning or suspension, 7 to 30 day temporary ban, permanent ban; appeals to `support@onehook.club`
within 30 days), 12 Fees & Payments, 13 Termination, 14 Disputes & Arbitration (AAA arbitration,
California law), 15 Indemnification, 16 API & Developer Access (no public API), 17 Changes to These
Terms (30 days' notice), 18 Severability, 19 Contact Information.

## Contact page (`Contact.tsx`)

- Three email cards: `support@onehook.club` (general inquiries), `privacy@onehook.club` (data
  protection questions) and `hello@onehook.club` (partnerships and media).
- A form with name, email, subject and message, all required. There is no contact API. Submitting
  sets `window.location.href` to a `mailto:support@onehook.club` link with the subject and a body
  that ends with the sender's name and email, so the visitor's mail client composes the message.
  The page then shows "Thank you for your message! We'll get back to you soon." for 3 seconds and
  clears the form.
- A note links to the Privacy Policy.
- Telemetry: the email links send `UiElement.LANDING_EMAIL_LINK` with a mailbox value derived by
  `mailboxValue` (`support`, `privacy`, or `other` for `hello@`); the privacy link sends
  `LANDING_POLICY_LINK`.

## Email addresses named on the pages

| Address | Where | Stated use |
|---|---|---|
| `support@onehook.club` | Contact, Privacy §14, Terms §6, §11, §14, §19 | General support, safety reports, appeals, disputes |
| `privacy@onehook.club` | Contact, Privacy §4, §10, §14 | Privacy rights and Admissions Assist withdrawal (30 days) |
| `security@onehook.club` | Privacy §14 | Security issues |
| `legal@onehook.club` | Terms §19 | Legal notice |
| `hello@onehook.club` | Contact | Business, partnerships, media |

Whether these mailboxes exist and are monitored cannot be checked from this repository. The pages
state no response times other than the 30-day ones in the table.

## How end-to-end encryption actually works

Use this when reviewing the legal text. Details are in the README section "End-to-End Encrypted
Chat (web)" and in `src/lib/chat-encryption.ts`.

- Each browser has a non-extractable P-256 ECDH device key in IndexedDB, registered with
  `POST /chat/devices`.
- A message is encrypted once, on the sender's device, with AES-256-GCM (AAD bound to the
  `matchId`). Its content key is wrapped for every registered device of both members and for each
  member's account-history key. The server stores and relays ciphertext and wraps.
- History on a new device is unlocked from a device wrap, a passkey PRF wrap, or a QR transfer from
  another signed-in device. Platform escrow is written only by the native apps.
- Call signalling (SDP and ICE) is sealed the same way.
- There is no forward secrecy and no safety-number verification of peer keys.
- TLS protects the connection to the servers. It is a separate layer and is not what makes the
  chats end-to-end encrypted.

In this client, decrypted message text leaves the device in two cases, both started by the member:
a chat copy attached to a report (Privacy §5), and excerpts the member confirms in the Mr OneHook
member chat (README, "Mr OneHook member chat").

## Statements that do not match the implementation

These are in the page text. They need a legal or product decision before the text changes; this
document does not change the pages.

| Page and section | Text | What the code shows |
|---|---|---|
| Privacy §2, Communication Data | "Messages are encrypted server-side and we cannot access the content" | Messages are encrypted on the device (`src/lib/chat-encryption.ts`). The same policy says so correctly in §6 |
| Privacy §6, Data in Transit | "We use PINNING to prevent man-in-the-middle attacks" | The web client does no certificate pinning, and browsers offer no way to do it. Possibly true of the native apps; not verifiable here |
| Privacy §2 "Anonymized interaction patterns" and §3 "Anonymous analytics ... (no personal data linked)" | Analytics are anonymous | Signals go to `POST /signals` with the member's Cognito JWT, and the server re-stamps identity (`src/lib/analytics/analyticsClient.ts`). They are linked to the account. A denylist strips message content and PII attributes. Analytics are currently off (`enableAnalytics: false`) |
| Terms §5, Message Privacy | OneHook "cannot and does not access message content for any purpose except in response to law enforcement requests" | With end-to-end encryption OneHook cannot read messages for law enforcement either. It receives plaintext only when a member attaches a chat to a report or confirms Mr OneHook excerpts |
| Privacy §13 | "Amazon Web Services (AWS) - US-based" | §8 and the infrastructure say data is stored in India; the frontend and Cognito are in `ap-south-1` |
| Privacy §13 | "Payment Processing: Not yet accepting any payments" | Terms §12 describes paid tiers that renew automatically, and `/pricing` lists prices in rupees. The web has no checkout |

Processing that the Privacy Policy does not mention:

- The public Mr OneHook widget on `/`, `/pricing` and `/science` (`src/components/Chatbot/ChatbotWidget.tsx`)
  asks for gender and "who you're into" and sends them, with the conversation, to
  `chatbot.gamma.onehook.club`. The README describes that service as an Azure App Service. The
  member Mr OneHook chat sends member-confirmed message excerpts to the same service.
- Google sign-in (Google Identity Services) and the Google Fonts stylesheet loaded by `index.html`.
- The mascot video, embedded from `youtube-nocookie.com` on the landing page.
- Rekognition Face Liveness for profile verification (`src/api/liveness.ts`). Terms §6 asks members
  to allow "facial recognition verification"; Privacy §4 says Admissions Assist uses no face
  recognition but does not cover liveness.

Other differences between the two documents: Privacy §5 describes outcomes as dismiss, warn, limit,
suspend or ban, with two-person bans and appeals decided by a different reviewer, while Terms §11
lists fixed 7 to 30 day bans and email appeals. Terms §14 applies California law and AAA
arbitration; Privacy says OneHook operates primarily in India.

Claims that cannot be verified from this repository: AES-256 encryption at rest, MFA and audited
staff access, penetration testing, SOC 2 Type II audits, "Email Service: SNS", IP anonymisation,
backup retention (90 days), data-processing agreements, and the 72-hour public incident report.

## Changing the pages

- Update the dates in both places on a page: the hero ("Last updated") and the footer line at the
  bottom of the content.
- Keep the `#birth-details`, `#admissions-assist` and `#reporting-safety` ids stable. According to
  the code comments, the native app's consent checkbox and report flow link to the last two.
- If a page's meaning changes, update its `ROUTE_SEO` description, which appears in search results
  and link previews. `seo-routes.test.ts` enforces title and description lengths.
- Every new link or button needs `trackProps` (`TELEMETRY_CONTRACT.txt`); in-page anchors use
  `data-track-exempt`, as the `#birth-details` links do.
