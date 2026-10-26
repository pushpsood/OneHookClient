/**
 * Member report flow copy (OneHook moderation Phase 2).
 *
 * The web app has no i18n framework; its existing mechanism is inline string constants co-located
 * with the feature (see e.g. ChatView's BLOCK_REASONS, ADD_BY_USERNAME_CONFIRMATION). This module
 * centralises the report flow copy the same way so the strings live in one reviewable place and the
 * UI never hard-codes them inline. No message text, user ids or free text ever appears in telemetry
 * or logs; these are static UI strings only.
 */

/** A self-harm support resource (config so it can change per region — docs/MODERATION.md §9.5). */
export interface SupportResource {
  name: string;
  /** Phone number as dialled (tel: link target). */
  phone: string;
  region: string;
  availability: string;
}

/** India, 24x7 — the resource surfaced for SELF_HARM_CONCERN (docs/MODERATION.md §9.5). */
export const SELF_HARM_RESOURCES: SupportResource[] = [
  { name: 'Tele-MANAS', phone: '14416', region: 'India', availability: '24x7' },
];

export const REPORT_STRINGS = {
  entryLabel: 'Report',
  blockLabel: 'Block',

  dialogTitle: 'Report',
  close: 'Close',
  back: 'Back',
  cancel: 'Cancel',
  next: 'Continue',

  // ── Category picker ──
  pickerHeading: 'What happened?',
  pickerSubheading: 'Pick the closest reason. Your report goes to our safety team.',
  notReportableRow: "This isn't a safety issue",
  notReportableRowHint: 'Different opinions, slow replies, who they like, and similar',

  // ── Not-reportable explainer ──
  notReportableHeading: "This isn't something we act on",
  notReportableBody:
    "These aren't safety issues, so reporting them won't create a case. If you'd rather not see or hear from this person, you can block or unmatch them instead.",
  notReportableBlock: 'Block',
  notReportableUnmatch: 'Unmatch',

  // ── Self-harm support ──
  selfHarmHeading: "If someone's in crisis, help is available",
  selfHarmBody:
    'Thank you for looking out for them. This report goes to a support team, not to punishment. If you or they are in immediate danger, please contact local emergency services.',
  selfHarmCallPrefix: 'Call',
  selfHarmContinue: 'Continue report',

  // ── Details ──
  detailsLabel: 'Add details',
  detailsLabelRequired: 'Add details (required)',
  detailsPlaceholder: 'Share anything that helps our team understand what happened.',
  detailsRequiredHint: 'Please add a short description so we can review this.',

  // ── Also block ──
  alsoBlockLabel: 'Also block this person',
  alsoBlockHint: 'They won’t be able to contact you or see you.',

  // ── Evidence ──
  evidenceCheckboxLabel: 'Share a decrypted copy of this chat with OneHook Safety',
  evidenceNudgeLine: 'Reports with the chat attached are resolved faster and more accurately.',
  evidencePanelHeading: 'What gets shared',
  evidencePanelWhat:
    'The last 200 messages or the last 30 days of this chat — whichever is smaller. Each message includes its time, who sent it (you or them), and the text.',
  evidencePanelNoMedia: 'No photos or media are shared in this version.',
  evidencePanelNotNotified: 'The other person is not told that you shared the chat.',
  evidencePreviewButton: 'Preview what will be shared',
  evidencePreviewHeading: 'Exactly what will be shared',
  evidencePreviewEmpty: 'There are no messages in this chat to share.',
  evidencePreviewYou: 'You',
  evidencePreviewThem: 'Them',

  // ── Minor safety ──
  minorSafetyEscalated:
    'This report is escalated to our safety team immediately. You don’t need to attach anything.',

  // ── Submit / confirmation ──
  submit: 'Submit report',
  submitting: 'Submitting…',
  confirmationHeading: 'Your report was sent',
  confirmationBody:
    "Thanks for telling us. Our safety team reviews every report. We won't tell this person who reported them.",
  confirmationBlocked: "You've also blocked this person, so they can no longer contact you or see you.",
  confirmationDone: 'Done',

  // ── Evidence outcome (non-blocking) ──
  evidenceAttached: 'The chat was attached to your report.',
  evidenceFailed: "Your report was sent. We couldn't attach the chat.",
  evidenceRetry: 'Retry attaching the chat',
  evidenceRetrying: 'Attaching…',
  evidenceTerminalNote:
    "Your report was sent. This chat can't be attached to this report, and you don't need to do anything else.",

  // ── Errors ──
  rateLimited: "You've sent a lot of reports recently. Please try again in a little while.",
  submitError: "We couldn't send your report just now. Please try again.",
} as const;

export type ReportStrings = typeof REPORT_STRINGS;
