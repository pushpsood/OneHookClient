import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { BrandWordmark } from '../common/BrandWordmark';
import { SiteFooter } from '../common/SiteFooter';

export function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] hover:opacity-60 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <BrandWordmark className="text-2xl font-bold tracking-tighter uppercase" />
          <div className="w-20" />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 px-6 bg-gradient-to-b from-bg to-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight mb-6">
            Terms of Service
          </h1>
          <p className="text-lg opacity-60">
            Last updated: May 23, 2026
            <br />
            Effective from: May 23, 2026
          </p>
        </motion.div>
      </section>

      {/* Content */}
      <section className="py-24 px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-4xl mx-auto space-y-12"
        >
          {/* Introduction */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">1. Agreement to Terms</h2>
            <p className="text-lg opacity-70 leading-relaxed">
              These Terms of Service ("Terms") constitute a legally binding agreement between you
              and OneHook ("Company," "we," "us," "our"). By accessing, downloading, or using the
              OneHook application and website, you agree to be bound by these Terms. If you do not
              agree, please do not use our service.
            </p>
          </div>

          {/* Service Description */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">2. Service Description</h2>
            <p className="opacity-70 mb-4">
              OneHook is an exclusive, invite-only dating platform designed for individuals seeking
              intentional, one-at-a-time connections. The service includes:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>User profile creation and verification</li>
              <li>Discovery and matching features</li>
              <li>End-to-end encrypted messaging</li>
              <li>Connection management tools</li>
              <li>User verification and safety features</li>
            </ul>
          </div>

          {/* Eligibility & Account Terms */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">3. Eligibility & Account Terms</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Age Requirement</h3>
            <p className="opacity-70">
              You must be at least 18 years old to use OneHook. By creating an account, you
              represent and warrant that you meet this requirement.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Account Registration</h3>
            <p className="opacity-70 mb-4">When creating your account, you agree to:</p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Provide accurate, truthful, and complete information</li>
              <li>Use photos that are recent and accurately represent you</li>
              <li>Update your information if it changes</li>
              <li>Maintain the confidentiality of your password</li>
              <li>Accept responsibility for all activity under your account</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3 mt-6">One Account Per Person</h3>
            <p className="opacity-70">
              Each user may maintain only one active account. Creating multiple accounts or
              impersonating others is prohibited and may result in permanent ban.
            </p>
          </div>

          {/* Acceptable Use Policy */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">4. Acceptable Use Policy</h2>
            <p className="opacity-70 mb-4">You agree NOT to:</p>

            <div className="space-y-4">
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Sexual Harassment or Abuse</h4>
                <p className="opacity-70">
                  Engage in sexual harassment, send unsolicited explicit content, or coerce others
                  into sexual activity
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Violence & Threats</h4>
                <p className="opacity-70">
                  Make threats, incite violence, or engage in abusive behavior
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Discrimination</h4>
                <p className="opacity-70">
                  Discriminate against or demean anyone based on race, gender, sexual orientation,
                  religion, or other protected characteristic
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Fraud & Deception</h4>
                <p className="opacity-70">
                  Catfish, use fake photos, impersonate others, or deceive users about your identity
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Illegal Activity</h4>
                <p className="opacity-70">
                  Use OneHook for illegal purposes, including sex trafficking, drug dealing, or
                  fraud
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Spam & Solicitation</h4>
                <p className="opacity-70">
                  Send unsolicited commercial messages, pyramid schemes, or phishing attempts
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Hacking & Security Violations</h4>
                <p className="opacity-70">
                  Attempt to access unauthorized areas, exploit vulnerabilities, or harm system
                  integrity
                </p>
              </div>
              <div className="border-l-4 border-red-300 pl-4">
                <h4 className="font-bold mb-2">Intellectual Property Violation</h4>
                <p className="opacity-70">Upload copyrighted content without permission</p>
              </div>
            </div>
          </div>

          {/* User Content */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">5. User-Generated Content</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Your Rights & Responsibilities</h3>
            <p className="opacity-70">
              You retain ownership of all content you create (photos, messages, bio). By uploading
              content to OneHook, you grant us a limited, non-exclusive license to use it solely for
              operating the platform.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Content Standards</h3>
            <p className="opacity-70">
              You may not upload content that is nude, sexually explicit, violent, or otherwise
              violates these Terms. Violations will result in content removal and potential account
              suspension.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Message Privacy</h3>
            <p className="opacity-70">
              Messages between users are encrypted end-to-end. OneHook cannot and does not access
              message content for any purpose except in response to law enforcement requests.
            </p>
          </div>

          {/* Verification & Safety */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">6. Identity Verification & Safety</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Photo Verification</h3>
            <p className="opacity-70 mb-4">
              OneHook uses photo verification technology to confirm users' identity. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Upload recent photos that accurately represent you</li>
              <li>Allow our system to perform facial recognition verification</li>
              <li>Verify your identity if requested during moderation review</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3 mt-6">Background Checks</h3>
            <p className="opacity-70">
              OneHook may implement optional background checking through third-party services to
              enhance user safety. By using the service, you consent to such checks where required
              by law or company policy.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">User Safety Obligation</h3>
            <p className="opacity-70">
              You agree to meet other users safely, never share financial information, and report
              suspicious behavior to support@onehook.club.
            </p>
          </div>

          {/* Prohibited Activities */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">7. Prohibited Activities</h2>
            <p className="opacity-70 mb-4">The following activities are explicitly prohibited:</p>
            <div className="space-y-3 opacity-70">
              <p>• Commercialization (selling services, promoting businesses, MLM schemes)</p>
              <p>• Scraping, crawling, or accessing data without authorization</p>
              <p>• Attempting to reverse-engineer or hack the platform</p>
              <p>• Using bots, automated scripts, or fake profiles</p>
              <p>• Sharing account access or selling accounts</p>
              <p>• Redistribution or republication of OneHook content</p>
              <p>• Attempting to contact users outside the platform to circumvent features</p>
            </div>
          </div>

          {/* Intellectual Property */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">8. Intellectual Property Rights</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">OneHook's Property</h3>
            <p className="opacity-70">
              All OneHook content, including the platform design, algorithms, features, and
              functionality, is the exclusive property of OneHook and protected by copyright and
              patent law. Unauthorized use is prohibited.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Limited License</h3>
            <p className="opacity-70">
              We grant you a personal, non-transferable, non-exclusive license to use OneHook for
              its intended purpose only. You may not copy, modify, or distribute any part of the
              platform.
            </p>
          </div>

          {/* Disclaimer of Warranties */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">9. Disclaimer of Warranties</h2>
            <p className="opacity-70">
              OneHook is provided "AS IS" without warranties of any kind, express or implied. We do
              not warrant that:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70 mt-4">
              <li>The service will be uninterrupted or error-free</li>
              <li>You will find a compatible match</li>
              <li>Relationships formed result in long-term commitment</li>
              <li>The platform is free from security vulnerabilities</li>
              <li>User-provided information is accurate</li>
            </ul>
          </div>

          {/* Limitation of Liability */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">10. Limitation of Liability</h2>
            <div className="bg-red-50 p-6 rounded-lg border border-red-200 mt-4">
              <p className="opacity-70 mb-4">
                To the maximum extent permitted by law, OneHook shall not be liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 opacity-70">
                <li>Indirect, incidental, or consequential damages</li>
                <li>Legal fees or professional services sought through connections</li>
                <li>Harm caused by other users or third parties</li>
                <li>Loss of data or service interruption</li>
                <li>Any damages exceeding the amount paid for the subscription (if any)</li>
              </ul>
            </div>
          </div>

          {/* Moderation & Enforcement */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">
              11. Moderation & Account Enforcement
            </h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Content Moderation</h3>
            <p className="opacity-70">
              OneHook uses automated systems and human moderators to enforce these Terms. Violations
              of our Acceptable Use Policy may result in:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70 mt-3">
              <li>Content removal</li>
              <li>Account warning or suspension</li>
              <li>Temporary ban (7-30 days)</li>
              <li>Permanent ban and deletion</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3 mt-6">Appeal Process</h3>
            <p className="opacity-70">
              If your account is suspended, you may appeal by contacting support@onehook.club with
              supporting evidence. We will review and respond within 30 days.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Law Enforcement Cooperation</h3>
            <p className="opacity-70">
              We cooperate with law enforcement and will disclose user information only pursuant to
              valid legal warrants or subpoenas. We will notify users of such requests unless
              legally prohibited.
            </p>
          </div>

          {/* Fees & Payments */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">12. Fees & Payments</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Pricing</h3>
            <p className="opacity-70">
              OneHook currently offers a free tier with optional paid premium features. Pricing is
              subject to change upon 30 days' notice.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Billing</h3>
            <p className="opacity-70">
              Premium subscriptions renew automatically unless cancelled. You may cancel anytime in
              account settings.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Refunds</h3>
            <p className="opacity-70">
              As per app store policies, refunds must be requested through iOS App Store or Google
              Play Store, not directly with OneHook.
            </p>
          </div>

          {/* Termination */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">13. Termination</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">You May Terminate</h3>
            <p className="opacity-70">
              You may delete your account anytime via account settings. Data deletion follows our
              Privacy Policy.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">We May Terminate</h3>
            <p className="opacity-70">
              We may terminate your account for violations of these Terms or to comply with legal
              obligations. We will provide notice unless doing so would compromise security.
            </p>
          </div>

          {/* Disputes & Arbitration */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">14. Disputes & Arbitration</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Informal Resolution</h3>
            <p className="opacity-70">
              If you have a dispute with OneHook, email support@onehook.club describing the issue.
              We will attempt to resolve it informally within 30 days.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Binding Arbitration</h3>
            <p className="opacity-70">
              If informal resolution fails, disputes shall be resolved through binding arbitration
              under the American Arbitration Association (AAA) rules, except for: injunctive relief
              to prevent harm, law enforcement matters, and intellectual property disputes.
            </p>

            <h3 className="text-2xl font-bold mb-3 mt-6">Governing Law</h3>
            <p className="opacity-70">
              These Terms are governed by the laws of the United States, specifically the State of
              California, without regard to conflict of law principles.
            </p>
          </div>

          {/* Indemnification */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">15. Indemnification</h2>
            <p className="opacity-70">
              You agree to indemnify and hold harmless OneHook from any claims, damages, or legal
              fees arising from:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70 mt-3">
              <li>Your use of OneHook in violation of these Terms</li>
              <li>Your infringement of third-party rights</li>
              <li>Harm you cause to other users</li>
              <li>Your illegal activity</li>
            </ul>
          </div>

          {/* API & Data Access */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">16. API & Developer Access</h2>
            <p className="opacity-70">
              OneHook does not currently provide a public API. Any unauthorized access to systems or
              data is prohibited and may result in legal action.
            </p>
          </div>

          {/* Changes to Terms */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">17. Changes to These Terms</h2>
            <p className="opacity-70">
              We may update these Terms from time to time. Material changes will be notified via
              email or app notification, with at least 30 days' notice. Continued use after changes
              constitutes acceptance.
            </p>
          </div>

          {/* Severability */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">18. Severability</h2>
            <p className="opacity-70">
              If any provision of these Terms is found unenforceable, it shall be modified to the
              minimum extent necessary, and remaining provisions shall remain in full effect.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">19. Contact Information</h2>
            <div className="bg-bg p-6 rounded-lg border border-border mt-4 space-y-3">
              <div>
                <strong>Terms Questions:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:support@onehook.club" className="text-accent hover:underline">
                    support@onehook.club
                  </a>
                </p>
              </div>
              <div>
                <strong>Legal Notice:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:legal@onehook.club" className="text-accent hover:underline">
                    legal@onehook.club
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-8 mt-12 border-t border-border">
            <p className="text-sm opacity-50 text-center">
              © 2026 OneHook. All rights reserved. Last updated May 23, 2026.
            </p>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
