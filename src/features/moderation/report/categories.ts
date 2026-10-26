/**
 * Report categories and their rules (OneHook moderation, docs/MODERATION.md §1 + §9).
 *
 * The 11 category codes mirror the backend `ReportCategory` taxonomy (also vendored into the
 * telemetry catalog as `ReportCategory`). Titles and one-line descriptions are short, plain-language
 * versions of the §1 definitions. Per-category rules captured here:
 *
 *  - `alsoBlockDefault`: the default for the "Also block this person" toggle. True for every
 *    category EXCEPT SELF_HARM_CONCERN (a support route, not punishment — default OFF).
 *  - `evidenceEligible`: whether the decrypted-chat evidence option may be offered. False for
 *    MINOR_SAFETY, which is escalated immediately and never carries an evidence upload (§9.1). The
 *    server independently gates this via `CreateReportResponse.evidenceAllowed`; the client hides
 *    the option entirely for MINOR_SAFETY.
 *  - `requiresDetails`: whether the free-text details field is mandatory (OTHER only).
 *  - `selfHarm`: SELF_HARM_CONCERN shows support resources first and routes to a support team.
 *  - `minorSafety`: MINOR_SAFETY shows the "escalated immediately" note instead of evidence.
 */
import { ReportCategory } from '../../../lib/analytics/generated/telemetryCatalog';

export { ReportCategory };

export type ReportSeverityTier = 'critical' | 'high' | 'standard';

export interface CategoryMeta {
  code: ReportCategory;
  /** Short, plain-language title shown in the picker. */
  title: string;
  /** One-line description shown under the title. */
  description: string;
  tier: ReportSeverityTier;
  /** Default for the "Also block this person" toggle. */
  alsoBlockDefault: boolean;
  /** Whether the decrypted-chat evidence option may be offered for this category. */
  evidenceEligible: boolean;
  /** OTHER requires a free-text description. */
  requiresDetails: boolean;
  /** SELF_HARM_CONCERN: support route, resources shown first. */
  selfHarm: boolean;
  /** MINOR_SAFETY: escalated immediately, evidence hidden entirely. */
  minorSafety: boolean;
}

/** Ordered list of the 11 categories as shown in the picker. */
export const REPORT_CATEGORIES: CategoryMeta[] = [
  {
    code: ReportCategory.HARASSMENT,
    title: 'Harassment',
    description: 'Repeated unwanted contact, insults, or degradation.',
    tier: 'high',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.THREATS_VIOLENCE,
    title: 'Threats or violence',
    description: 'Threats of physical harm, intimidation, or extortion.',
    tier: 'critical',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.SEXUAL_CONTENT_NONCONSENT,
    title: 'Unwanted sexual content',
    description: 'Unsolicited sexual content, coercion, or sharing intimate images without consent.',
    tier: 'critical',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.MINOR_SAFETY,
    title: 'Minor safety',
    description: 'A suspected underage user, or any sexualization of a minor.',
    tier: 'critical',
    alsoBlockDefault: true,
    evidenceEligible: false,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: true,
  },
  {
    code: ReportCategory.SCAM_FRAUD,
    title: 'Scam or fraud',
    description: 'Money requests, investment or crypto pitches, phishing, or off-platform payment.',
    tier: 'high',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.FAKE_IMPERSONATION,
    title: 'Fake or impersonation',
    description: 'A fake profile, stolen photos, or impersonating a real person or brand.',
    tier: 'high',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.SPAM_PROMOTION,
    title: 'Spam or promotion',
    description: 'Bulk advertising, solicitation, link spam, or driving you to other platforms.',
    tier: 'standard',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.HATE,
    title: 'Hate',
    description:
      'Attacks on protected characteristics such as race, religion, caste, gender, orientation, or disability.',
    tier: 'high',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.SELF_HARM_CONCERN,
    title: 'Self-harm concern',
    description: 'Someone expressing suicidal thoughts or self-harm. This goes to a support team, not punishment.',
    tier: 'critical',
    alsoBlockDefault: false,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: true,
    minorSafety: false,
  },
  {
    code: ReportCategory.OFF_PLATFORM_HARM,
    title: 'Off-platform harm',
    description: 'Harm that started here but continues elsewhere, like doxxing, stalking, or spreading private images.',
    tier: 'high',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: false,
    selfHarm: false,
    minorSafety: false,
  },
  {
    code: ReportCategory.OTHER,
    title: 'Something else',
    description: 'Anything not covered above. Please add a short description.',
    tier: 'standard',
    alsoBlockDefault: true,
    evidenceEligible: true,
    requiresDetails: true,
    selfHarm: false,
    minorSafety: false,
  },
];

const BY_CODE: Record<string, CategoryMeta> = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.code, c])
);

export function getCategoryMeta(code: ReportCategory): CategoryMeta {
  const meta = BY_CODE[code];
  if (!meta) throw new Error(`Unknown report category: ${code}`);
  return meta;
}

/** Max length of the details free-text field (backend CreateReportRequest cap). */
export const DETAILS_MAX_CHARS = 2000;

/**
 * The cases that are explicitly NOT reportable (docs/MODERATION.md §1). Choosing "This isn't a
 * safety issue" shows these and offers Block / Unmatch instead of creating a report.
 */
export const NOT_REPORTABLE_CASES: string[] = [
  'Disagreeing with you or having different opinions.',
  'Not replying, replying slowly, or unmatching.',
  "Someone's protected attributes themselves — race, religion, caste, gender, orientation, disability, body, or accent.",
  "Their dating preferences, or who they are or aren't interested in.",
  'Being boring, unattractive, or a bad conversationalist.',
];
