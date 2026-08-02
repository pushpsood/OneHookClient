import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { BrandWordmark } from '../common/BrandWordmark';
import { SiteFooter } from '../common/SiteFooter';

export function Privacy() {
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
            Privacy Policy
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
            <h2 className="text-3xl font-serif italic mb-4">1. Introduction</h2>
            <p className="text-lg opacity-70 leading-relaxed">
              OneHook ("we," "us," "our," or "Company") is committed to protecting your privacy and
              ensuring you have a positive experience on our platform. This Privacy Policy explains
              our information practices, what data we collect, how we use it, and your rights
              regarding your personal information.
            </p>
            <p className="text-lg opacity-70 leading-relaxed mt-4">
              We operate under the principle of <strong>data minimization</strong>: we collect only
              what is necessary to provide our services, and we protect your data with
              industry-leading security measures.
            </p>
          </div>

          {/* Data We Collect */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">2. Information We Collect</h2>

            <h3 className="text-2xl font-bold mb-3 mt-6">Account Information</h3>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Email address</li>
              <li>Name and date of birth</li>
              <li>Location (geographic area only)</li>
              <li>Profile photos (encrypted storage)</li>
              <li>Bio and interests</li>
              <li>Sexual orientation (optional, for matching)</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3 mt-6">Usage Information</h3>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Anonymized interaction patterns (swiping, messaging frequency)</li>
              <li>App performance metrics</li>
              <li>Device type and operating system</li>
              <li>IP address (anonymized for security)</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3 mt-6">Communication Data</h3>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Messages between matched users (end-to-end encrypted)</li>
              <li>Support inquiries and responses</li>
              <li>
                <strong>Important:</strong> Messages are encrypted server-side and we cannot access
                the content
              </li>
            </ul>
          </div>

          {/* How We Use Data */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">3. How We Use Your Information</h2>
            <div className="bg-bg p-6 rounded-lg border border-border mt-4 space-y-4">
              <div>
                <h4 className="font-bold mb-2">✓ To Provide Our Service</h4>
                <p className="opacity-70">
                  Creating your profile, matching with other users, facilitating communication
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">✓ To Improve Security</h4>
                <p className="opacity-70">
                  Fraud detection, preventing unauthorized access, protecting user safety
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">✓ To Enhance the Platform</h4>
                <p className="opacity-70">
                  Anonymous analytics, feature improvement, bug fixes (no personal data linked)
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">✓ To Communicate with You</h4>
                <p className="opacity-70">
                  Important account notifications, policy updates, security alerts (opt-out
                  available for non-critical)
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">✗ We Do NOT Use Your Data For</h4>
                <p className="opacity-70">
                  Marketing to third parties, selling to data brokers, algorithmic profiling,
                  behavioral manipulation
                </p>
              </div>
            </div>
          </div>

          {/* Data Security */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">4. Data Security & Encryption</h2>
            <div className="bg-accent/5 p-6 rounded-lg border border-accent/20 mt-4 space-y-4">
              <div>
                <h4 className="font-bold mb-2">End-to-End Encryption (E2EE)</h4>
                <p className="opacity-70">
                  All messages between users are encrypted end-to-end using industry-standard
                  encryption (TLS 1.3). We cannot decrypt or read message contents.
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Data at Rest</h4>
                <p className="opacity-70">
                  All data stored in our databases is encrypted using AES-256 encryption. Profile
                  photos are encrypted and separated from personally identifiable information.
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Data in Transit</h4>
                <p className="opacity-70">
                  All communication between your device and our servers uses HTTPS/SSL protocols. We
                  use PINNING to prevent man-in-the-middle attacks.
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Access Controls</h4>
                <p className="opacity-70">
                  Only authorized personnel can access user data, with multi-factor authentication
                  required. Access is logged and audited.
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-2">Regular Security Audits</h4>
                <p className="opacity-70">
                  We conduct regular penetration testing and security audits. Vulnerabilities are
                  addressed immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Third-Party Sharing */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">5. We Do Not Share Your Data</h2>
            <div className="bg-red-50 p-6 rounded-lg border border-red-200 mt-4">
              <p className="font-bold text-red-900 mb-4">❌ OneHook Does NOT:</p>
              <ul className="list-disc list-inside space-y-2 text-red-800">
                <li>Sell your personal data to third parties</li>
                <li>Share data with marketing companies or data brokers</li>
                <li>Use your data to build profiles for other companies</li>
                <li>Rent or lease your data</li>
                <li>Share location data with anyone except security purposes</li>
                <li>Provide access to competitors or dating platforms</li>
              </ul>
            </div>

            <h3 className="text-2xl font-bold mb-3 mt-8">Limited Sharing Exceptions</h3>
            <p className="opacity-70 mb-4">
              We may share data only in these limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>
                <strong>Legal Requirements:</strong> If required by law or court order (we will
                notify you unless prohibited)
              </li>
              <li>
                <strong>Safety & Security:</strong> To prevent fraud, abuse, or to protect user
                safety
              </li>
              <li>
                <strong>Service Providers:</strong> Only with vendors who sign strict data
                processing agreements (DPAs)
              </li>
              <li>
                <strong>With Your Consent:</strong> Only if you explicitly authorize sharing
              </li>
            </ul>
          </div>

          {/* International Transfers */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">6. Data International Transfers</h2>
            <p className="opacity-70 leading-relaxed">
              OneHook operates primarily in the United States. If you are outside the US, your data
              may be transferred to and processed in the United States. By using OneHook, you
              consent to this transfer. Where required by law (e.g., GDPR), we implement appropriate
              safeguards including:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70 mt-4">
              <li>Standard Contractual Clauses (SCCs)</li>
              <li>Data Processing Agreements (DPAs)</li>
              <li>Encryption of data in transit</li>
            </ul>
          </div>

          {/* Data Retention */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">7. Data Retention</h2>
            <div className="bg-bg p-6 rounded-lg border border-border mt-4 space-y-3">
              <div>
                <strong>Active Accounts:</strong>
                <p className="opacity-70">Data retained while your account is active</p>
              </div>
              <div>
                <strong>After Deletion:</strong>
                <p className="opacity-70">
                  Data deleted within 30 days of account deletion (except where required by law)
                </p>
              </div>
              <div>
                <strong>Backups:</strong>
                <p className="opacity-70">
                  Backups may retain data for up to 90 days for disaster recovery purposes
                </p>
              </div>
              <div>
                <strong>Legal Holds:</strong>
                <p className="opacity-70">
                  Data may be retained longer if required by legal proceedings or regulatory
                  requirements
                </p>
              </div>
            </div>
          </div>

          {/* Your Rights */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">8. Your Privacy Rights</h2>
            <p className="opacity-70 mb-4">
              You have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside space-y-3 opacity-70">
              <li>
                <strong>Right to Access:</strong> Request a copy of all your personal data we hold
              </li>
              <li>
                <strong>Right to Correction:</strong> Update or correct inaccurate information
              </li>
              <li>
                <strong>Right to Deletion:</strong> Request permanent deletion of your account and
                data
              </li>
              <li>
                <strong>Right to Export:</strong> Download your data in a portable format
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Opt out of non-essential data collection
              </li>
              <li>
                <strong>Right to Lodge Complaints:</strong> File a complaint with your data
                protection authority
              </li>
            </ul>
            <p className="opacity-70 mt-6">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@onehook.club" className="text-accent font-mono">
                privacy@onehook.club
              </a>
              . We will respond within 30 days.
            </p>
          </div>

          {/* Compliance */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">9. Regulatory Compliance</h2>
            <div className="space-y-4">
              <div className="border-l-4 border-accent pl-4">
                <h4 className="font-bold mb-2">GDPR (EU General Data Protection Regulation)</h4>
                <p className="opacity-70">
                  OneHook complies with GDPR requirements for EU users, including lawful basis for
                  processing, data subject rights, and DPA requirements.
                </p>
              </div>
              <div className="border-l-4 border-accent pl-4">
                <h4 className="font-bold mb-2">CCPA (California Consumer Privacy Act)</h4>
                <p className="opacity-70">
                  For California residents, we provide rights to know, delete, and opt-out of data
                  sales (which we do not do anyway).
                </p>
              </div>
              <div className="border-l-4 border-accent pl-4">
                <h4 className="font-bold mb-2">HIPAA & HITECH</h4>
                <p className="opacity-70">
                  While OneHook does not handle health data, we implement similar security protocols
                  for all data.
                </p>
              </div>
              <div className="border-l-4 border-accent pl-4">
                <h4 className="font-bold mb-2">SOC 2 Type II</h4>
                <p className="opacity-70">
                  Our infrastructure is regularly audited for security, availability, and
                  confidentiality controls.
                </p>
              </div>
              <div className="border-l-4 border-accent pl-4">
                <h4 className="font-bold mb-2">COPPA (Children's Online Privacy)</h4>
                <p className="opacity-70">
                  OneHook is not intended for users under 18. We do not knowingly collect data from
                  minors.
                </p>
              </div>
            </div>
          </div>

          {/* Security Incident Response */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">10. Security Incident Response</h2>
            <p className="opacity-70 mb-4">In the event of a data breach, we will:</p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>Notify affected users without undue delay (as required by law)</li>
              <li>Provide details of what data was compromised</li>
              <li>Offer credit monitoring if financial data was involved</li>
              <li>Notify regulatory authorities where required</li>
              <li>Post a public incident report within 72 hours</li>
            </ul>
          </div>

          {/* Third-Party Services */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">11. Third-Party Service Providers</h2>
            <p className="opacity-70 mb-4">
              We use limited third-party services only where necessary. All processors sign Data
              Processing Agreements (DPAs) ensuring the same level of data protection:
            </p>
            <ul className="list-disc list-inside space-y-2 opacity-70">
              <li>
                <strong>Cloud Infrastructure:</strong> Amazon Web Services (AWS) - US-based, SOC 2
                certified
              </li>
              <li>
                <strong>Email Service:</strong> Sendgrid - for transactional emails only, no
                marketing
              </li>
              <li>
                <strong>Analytics:</strong> Self-hosted and anonymous only
              </li>
              <li>
                <strong>Payment Processing:</strong> Stripe - PCI DSS Level 1 compliant
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">12. Contact Us</h2>
            <div className="bg-bg p-6 rounded-lg border border-border mt-4 space-y-3">
              <div>
                <strong>Privacy Inquiries:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:privacy@onehook.club" className="text-accent hover:underline">
                    privacy@onehook.club
                  </a>
                </p>
              </div>
              <div>
                <strong>Data Access Requests:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:privacy@onehook.club" className="text-accent hover:underline">
                    privacy@onehook.club
                  </a>
                </p>
              </div>
              <div>
                <strong>Security Issues:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:security@onehook.club" className="text-accent hover:underline">
                    security@onehook.club
                  </a>
                </p>
              </div>
              <div>
                <strong>General Support:</strong>
                <p className="opacity-70 font-mono">
                  <a href="mailto:support@onehook.club" className="text-accent hover:underline">
                    support@onehook.club
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Changes to Policy */}
          <div>
            <h2 className="text-3xl font-serif italic mb-4">13. Changes to This Policy</h2>
            <p className="opacity-70">
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by email or through the platform. Your continued use of OneHook after changes
              constitutes acceptance of the updated policy.
            </p>
          </div>

          {/* Footer */}
          <div className="pt-8 mt-12 border-t border-border">
            <p className="text-sm opacity-50 text-center">
              © 2026 OneHook. Your privacy is our priority. Last updated May 23, 2026.
            </p>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
