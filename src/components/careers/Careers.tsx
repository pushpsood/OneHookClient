import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Server,
  MonitorSmartphone,
  Megaphone,
  Scale,
  Sparkles,
  Heart,
  Globe,
  Zap,
  ShieldCheck,
  Send,
  CheckCircle2,
  PenTool,
  Smartphone,
  Brain,
  Gauge,
  Users,
  IndianRupee,
} from 'lucide-react';
import { BrandWordmark } from '../common/BrandWordmark';
import { SiteFooter } from '../common/SiteFooter';

/**
 * Careers page — showcases the open roles with an engaging, on-brand UI
 * and a role-aware application form. The role picked from the dropdown is fed
 * back into the questionnaire: a role-specific prompt appears alongside the
 * "how will you contribute" field, plus the standard, compliance-safe hiring
 * questions (work authorization, age, consent to data processing, and an
 * explicitly voluntary equal-opportunity section).
 */

type RoleId =
  | 'backend'
  | 'frontend'
  | 'product'
  | 'mobile'
  | 'ml'
  | 'sre'
  | 'security'
  | 'marketing'
  | 'people'
  | 'legal';

interface RoleDef {
  id: RoleId;
  title: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  skills: string[];
  /**
   * Indicative annual CTC range. Benchmarked against the average Amazon/Google
   * India fresher CTC for the equivalent profile: the lower bound is ~20% above
   * that market baseline, and the upper bound is 2x the lower bound. Only the
   * CTC range is shown publicly (competitors are not named in the UI).
   */
  comp: string;
  /** Role-specific question fed into the questionnaire when this role is picked. */
  roleQuestion: string;
  roleQuestionPlaceholder: string;
}

const ROLES: RoleDef[] = [
  {
    id: 'backend',
    title: 'Backend Developer',
    tagline: 'Architect the trust layer',
    icon: Server,
    blurb:
      'Design the APIs, real-time messaging, and E2EE plumbing that keep one connection at a time feeling instant and secure.',
    skills: ['Node / Go / Java', 'AWS + serverless', 'Distributed systems', 'Security-first APIs'],
    comp: '\u20B927\u201354 LPA CTC',
    roleQuestion:
      'Describe a scalable system or API you designed. What were the biggest reliability, security, or performance challenges — and how did you solve them?',
    roleQuestionPlaceholder:
      'e.g. I designed an event-driven matching pipeline that handled 10k events/sec...',
  },
  {
    id: 'frontend',
    title: 'Frontend Developer',
    tagline: 'Craft moments, not clutter',
    icon: MonitorSmartphone,
    blurb:
      'Turn a minimalist, intention-driven vision into fluid, accessible interfaces across web and mobile that feel effortless.',
    skills: ['React / React Native', 'TypeScript', 'Motion & interaction', 'Accessibility (a11y)'],
    comp: '\u20B925\u201350 LPA CTC',
    roleQuestion:
      'Share a UI or interaction you are proud of. How did you balance performance, accessibility, and design fidelity?',
    roleQuestionPlaceholder:
      'e.g. I rebuilt a swipe deck with gesture physics while keeping it fully keyboard-navigable...',
  },
  {
    id: 'marketing',
    title: 'Marketing',
    tagline: 'Tell a story worth one yes',
    icon: Megaphone,
    blurb:
      'Grow a brand that stands against endless swiping. Own positioning, campaigns, and community for OneHook.',
    skills: ['Brand & content', 'Growth / performance', 'Community', 'Analytics & storytelling'],
    comp: '\u20B913\u201326 LPA CTC',
    roleQuestion:
      'Pitch a growth or brand campaign for a privacy-first, intention-driven dating app. Which channels and metrics would you focus on, and why?',
    roleQuestionPlaceholder:
      'e.g. A "Trade a thousand maybes for one yes" campaign anchored on...',
  },
  {
    id: 'legal',
    title: 'Legal',
    tagline: 'Guard privacy as a promise',
    icon: Scale,
    blurb:
      'Keep OneHook trustworthy by design — data privacy, safety policy, and compliance for a platform handling sensitive, personal moments.',
    skills: ['Data privacy (GDPR / DPDP)', 'Contracts', 'Trust & safety policy', 'Regulatory compliance'],
    comp: '\u20B915\u201330 LPA CTC',
    roleQuestion:
      'How would you approach data-privacy compliance (GDPR / India DPDP Act) for a platform handling sensitive personal and dating data?',
    roleQuestionPlaceholder:
      'e.g. I would start with a data-mapping exercise and privacy-by-design review of...',
  },
  {
    id: 'product',
    title: 'Product & Design',
    tagline: 'Shape what we build and why',
    icon: PenTool,
    blurb:
      'Own the roadmap and the craft — from user insight to pixel-perfect flows — for OneHook, which respects people\u2019s time.',
    skills: ['Product strategy', 'UX / UI design', 'User research', 'Design systems'],
    comp: '\u20B921\u201342 LPA CTC',
    roleQuestion:
      'Walk us through a product or design decision you made from insight to launch. How did you measure whether it worked?',
    roleQuestionPlaceholder:
      'e.g. I noticed drop-off at onboarding step 3, ran interviews, and redesigned...',
  },
  {
    id: 'mobile',
    title: 'Mobile Engineer (iOS / Android)',
    tagline: 'Native feel, one connection',
    icon: Smartphone,
    blurb:
      'Build fast, delightful iOS and Android experiences that bring OneHook\u2019s intention-driven vision into people\u2019s pockets.',
    skills: ['Swift / Kotlin', 'React Native', 'Offline & real-time', 'App performance'],
    comp: '\u20B925\u201350 LPA CTC',
    roleQuestion:
      'Describe a mobile feature you shipped end to end. How did you handle performance, offline states, or platform differences?',
    roleQuestionPlaceholder:
      'e.g. I built an E2EE chat with optimistic UI and background sync...',
  },
  {
    id: 'ml',
    title: 'ML / Data Scientist',
    tagline: 'Teach the match to matter',
    icon: Brain,
    blurb:
      'Design the recommendation and matching intelligence that helps people find one real connection, not endless noise.',
    skills: ['ML / recommendations', 'Python', 'Experimentation', 'Data pipelines'],
    comp: '\u20B927\u201354 LPA CTC',
    roleQuestion:
      'How would you design and evaluate a matching model for a dating app that optimizes for meaningful connections over raw engagement?',
    roleQuestionPlaceholder:
      'e.g. I\u2019d define a north-star metric beyond swipes, then run holdout experiments...',
  },
  {
    id: 'sre',
    title: 'Site Reliability Engineer',
    tagline: 'Keep the promise up',
    icon: Gauge,
    blurb:
      'Own reliability, observability, and on-call for a real-time platform where trust depends on things simply working.',
    skills: ['AWS / IaC', 'Observability', 'Incident response', 'CI/CD'],
    comp: '\u20B924\u201348 LPA CTC',
    roleQuestion:
      'Tell us about an outage or reliability problem you owned. How did you diagnose it, and what did you change to prevent a repeat?',
    roleQuestionPlaceholder:
      'e.g. We had cascading failures from a dependency; I added circuit breakers and SLOs...',
  },
  {
    id: 'security',
    title: 'Security Engineer',
    tagline: 'Trust as our foundation',
    icon: ShieldCheck,
    blurb:
      'Protect sensitive personal data and our E2EE guarantees — from threat modeling to secure-by-default engineering.',
    skills: ['AppSec', 'E2EE / cryptography', 'Threat modeling', 'Cloud security'],
    comp: '\u20B924\u201348 LPA CTC',
    roleQuestion:
      'How would you threat-model a privacy-first dating app with end-to-end encryption? Where would you focus first, and why?',
    roleQuestionPlaceholder:
      'e.g. I\u2019d map data flows and trust boundaries, then prioritize account takeover and...',
  },
  {
    id: 'people',
    title: 'People / HR / Recruiting',
    tagline: 'Build the team behind the team',
    icon: Users,
    blurb:
      'Hire thoughtfully, grow a healthy culture, and keep our people practices fair, compliant, and human.',
    skills: ['Recruiting', 'People ops', 'Culture & L&D', 'HR compliance'],
    comp: '\u20B911\u201322 LPA CTC',
    roleQuestion:
      'How would you build a hiring process that is fast, fair, and inclusive for an early-stage team? How would you measure success?',
    roleQuestionPlaceholder:
      'e.g. Structured interviews with clear rubrics, diverse sourcing, and a candidate-first...',
  },
];

const PERKS = [
  { icon: Globe, title: 'Remote-first', text: 'Work from wherever you do your best thinking.' },
  { icon: Zap, title: 'Real ownership', text: 'Small team, high trust, visible impact from day one.' },
  { icon: Heart, title: 'OneHook has a soul', text: 'Build something that respects people\u2019s time and attention.' },
  { icon: ShieldCheck, title: 'Privacy by design', text: 'We treat user trust as OneHook\u2019s foundation, not an afterthought.' },
];

const initialForm = {
  name: '',
  email: '',
  phone: '',
  role: '' as '' | RoleId,
  experience: '',
  portfolio: '',
  contribution: '',
  roleAnswer: '',
  // Compliance / mandatory hiring questions
  workAuthorized: '',
  ageConfirm: false,
  noticePeriod: '',
  dataConsent: false,
  // Voluntary (must not affect hiring decision)
  gender: '',
  referralSource: '',
};

export function Careers() {
  const navigate = useNavigate();
  const [formData, setFormData] = React.useState(initialForm);
  const [submitted, setSubmitted] = React.useState(false);

  const selectedRole = ROLES.find((r) => r.id === formData.role);

  const scrollToForm = (roleId?: RoleId) => {
    if (roleId) setFormData((prev) => ({ ...prev, role: roleId }));
    document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const value =
      target instanceof HTMLInputElement && target.type === 'checkbox'
        ? target.checked
        : target.value;
    setFormData((prev) => ({ ...prev, [target.name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would POST to a backend / applicant-tracking endpoint.
    setSubmitted(true);
    setTimeout(() => {
      setFormData(initialForm);
      setSubmitted(false);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-border sticky top-0 z-40 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] hover:opacity-60 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <BrandWordmark className="text-2xl font-bold tracking-tighter uppercase" />
          <button
            onClick={() => scrollToForm()}
            className="hidden sm:inline-flex text-[10px] font-black uppercase tracking-[0.25em] px-4 py-2 bg-accent text-white rounded-full hover:opacity-90 transition-opacity"
          >
            Apply
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-6 bg-gradient-to-b from-bg to-white">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 border border-border rounded-full text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            <Sparkles className="w-3.5 h-3.5 text-accent" /> We&rsquo;re hiring
          </div>
          <h1 className="text-5xl md:text-7xl font-serif italic tracking-tight mb-6">
            Build the anti-swipe.
          </h1>
          <p className="text-xl opacity-60 italic max-w-2xl mx-auto">
            We&rsquo;re a small team betting that one real connection beats a thousand maybes. Help us
            build a dating platform with intention, privacy, and taste.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => scrollToForm()}
              className="px-8 py-4 bg-accent text-white text-[11px] font-black uppercase tracking-[0.3em] rounded-full hover:scale-[1.03] transition-transform"
            >
              See open roles
            </button>
          </div>
        </motion.div>
      </section>

      {/* Perks */}
      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {PERKS.map((perk, idx) => (
            <motion.div
              key={perk.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              className="p-6 border border-border rounded-lg text-center hover:shadow-lg transition-shadow"
            >
              <perk.icon className="w-6 h-6 text-accent mx-auto mb-3" />
              <h3 className="text-sm font-bold uppercase tracking-widest mb-1">{perk.title}</h3>
              <p className="text-xs opacity-60 leading-relaxed">{perk.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Open roles */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif italic tracking-tight mb-4">
              Open Roles
            </h2>
            <p className="opacity-60 italic">Ten ways to shape what comes next.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {ROLES.map((role, idx) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group relative flex flex-col p-8 border border-border rounded-xl hover:border-accent hover:shadow-xl transition-all"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-14 h-14 rounded-full bg-accent/5 border border-border flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
                    <role.icon className="w-6 h-6" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 italic">
                    {role.tagline}
                  </span>
                </div>
                <h3 className="text-2xl font-serif italic tracking-tight mb-3">{role.title}</h3>
                <div className="inline-flex items-center gap-1.5 self-start mb-4 px-3 py-1 rounded-full bg-accent/5 border border-accent/20 text-accent text-[11px] font-black tracking-wide">
                  <IndianRupee className="w-3 h-3" />
                  {role.comp.replace('\u20B9', '')}
                </div>
                <p className="text-sm opacity-60 leading-relaxed mb-6">{role.blurb}</p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {role.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-3 py-1 border border-border rounded-full text-[9px] uppercase tracking-[0.15em] font-bold opacity-50"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => scrollToForm(role.id)}
                  className="mt-auto self-start text-[10px] font-black uppercase tracking-[0.3em] text-accent inline-flex items-center gap-2 hover:gap-3 transition-all"
                >
                  Apply for this role <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="py-24 px-6 bg-gradient-to-b from-white to-bg">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-serif italic tracking-tight mb-4">
              Apply
            </h2>
            <p className="opacity-60 italic">
              Pick a role and tell us how you&rsquo;d move OneHook forward.
            </p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onSubmit={handleSubmit}
            className="bg-white p-8 md:p-12 rounded-xl border border-border shadow-sm"
          >
            {submitted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8 p-4 bg-green-50 border border-green-200 rounded flex items-start gap-3 text-green-700"
              >
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  Thank you for applying{selectedRole ? ` for ${selectedRole.title}` : ''}! Our team
                  will review your application and be in touch.
                </p>
              </motion.div>
            )}

            <div className="space-y-6">
              {/* Basics */}
              <div className="grid sm:grid-cols-2 gap-6">
                <Field label="Full name" htmlFor="name" required>
                  <input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="career-input"
                    placeholder="Your full name"
                  />
                </Field>
                <Field label="Email address" htmlFor="email" required>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="career-input"
                    placeholder="you@email.com"
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <Field label="Phone" htmlFor="phone" required>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="career-input"
                    placeholder="+1234567890"
                  />
                </Field>
                <Field label="Years of experience" htmlFor="experience" required>
                  <select
                    id="experience"
                    name="experience"
                    value={formData.experience}
                    onChange={handleChange}
                    required
                    className="career-input"
                  >
                    <option value="">Select…</option>
                    <option value="0-1">0–1 years</option>
                    <option value="2-4">2–4 years</option>
                    <option value="5-8">5–8 years</option>
                    <option value="9+">9+ years</option>
                  </select>
                </Field>
              </div>

              {/* Dynamic role dropdown */}
              <Field label="Which role are you applying for?" htmlFor="role" required>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  required
                  className="career-input"
                >
                  <option value="">Select a role…</option>
                  {ROLES.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Role-specific question (driven by the selected role) */}
              {selectedRole && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-6 border-l-2 border-accent/40 pl-5"
                >
                  <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-accent">
                    <selectedRole.icon className="w-3.5 h-3.5" /> {selectedRole.title} — a few specifics
                  </div>
                  <p className="text-xs opacity-60 -mt-3">
                    Indicative compensation:{' '}
                    <span className="font-bold text-accent">{selectedRole.comp}</span>
                  </p>

                  <Field label={selectedRole.roleQuestion} htmlFor="roleAnswer" required>
                    <textarea
                      id="roleAnswer"
                      name="roleAnswer"
                      value={formData.roleAnswer}
                      onChange={handleChange}
                      required
                      rows={4}
                      className="career-input resize-none"
                      placeholder={selectedRole.roleQuestionPlaceholder}
                    />
                  </Field>

                  <Field
                    label={`How would you contribute to OneHook as our ${selectedRole.title}?`}
                    htmlFor="contribution"
                    required
                  >
                    <textarea
                      id="contribution"
                      name="contribution"
                      value={formData.contribution}
                      onChange={handleChange}
                      required
                      rows={4}
                      className="career-input resize-none"
                      placeholder="What would you own, improve, or change in your first 90 days?"
                    />
                  </Field>
                </motion.div>
              )}

              <Field label="Portfolio / LinkedIn / GitHub (optional)" htmlFor="portfolio">
                <input
                  id="portfolio"
                  name="portfolio"
                  type="url"
                  value={formData.portfolio}
                  onChange={handleChange}
                  className="career-input"
                  placeholder="https://…"
                />
              </Field>

              {/* Compliance / mandatory hiring questions */}
              <div className="pt-4 mt-2 border-t border-border space-y-6">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">
                  Required hiring questions
                </div>

                <Field
                  label="Are you legally authorized to work in the country where this role is based?"
                  htmlFor="workAuthorized"
                  required
                >
                  <select
                    id="workAuthorized"
                    name="workAuthorized"
                    value={formData.workAuthorized}
                    onChange={handleChange}
                    required
                    className="career-input"
                  >
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="sponsorship">Yes, but I would require sponsorship</option>
                  </select>
                </Field>

                <Field label="Notice period / earliest availability" htmlFor="noticePeriod" required>
                  <input
                    id="noticePeriod"
                    name="noticePeriod"
                    value={formData.noticePeriod}
                    onChange={handleChange}
                    required
                    className="career-input"
                    placeholder="e.g. Immediate, 2 weeks, 30 days"
                  />
                </Field>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="ageConfirm"
                    checked={formData.ageConfirm}
                    onChange={handleChange}
                    required
                    className="mt-1 w-4 h-4 accent-accent flex-shrink-0"
                  />
                  <span className="text-xs opacity-70 leading-relaxed">
                    I confirm that I am at least 18 years of age. <span className="text-accent">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="dataConsent"
                    checked={formData.dataConsent}
                    onChange={handleChange}
                    required
                    className="mt-1 w-4 h-4 accent-accent flex-shrink-0"
                  />
                  <span className="text-xs opacity-70 leading-relaxed">
                    I consent to OneHook processing the personal data in this application for
                    recruitment purposes, in line with the{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/privacy')}
                      className="text-accent hover:underline"
                    >
                      Privacy Policy
                    </button>
                    . <span className="text-accent">*</span>
                  </span>
                </label>
              </div>

              {/* Voluntary equal-opportunity section */}
              <div className="pt-4 mt-2 border-t border-border space-y-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">
                    Voluntary &amp; confidential
                  </div>
                  <p className="mt-2 text-xs opacity-50 leading-relaxed">
                    OneHook is an equal-opportunity employer. The questions below are optional and
                    used only for anonymized diversity reporting. Your answers will not be shared
                    with hiring managers and will never affect our decision.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <Field label="Gender (optional)" htmlFor="gender">
                    <select
                      id="gender"
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="career-input"
                    >
                      <option value="">Prefer not to say</option>
                      <option value="woman">Woman</option>
                      <option value="man">Man</option>
                      <option value="non-binary">Non-binary</option>
                      <option value="self-describe">Prefer to self-describe</option>
                    </select>
                  </Field>
                  <Field label="How did you hear about us? (optional)" htmlFor="referralSource">
                    <input
                      id="referralSource"
                      name="referralSource"
                      value={formData.referralSource}
                      onChange={handleChange}
                      className="career-input"
                      placeholder="LinkedIn, a friend, our app…"
                    />
                  </Field>
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit application
              </button>

              <p className="text-xs opacity-50 text-center leading-relaxed">
                We respect your privacy. Your application is used solely for recruitment. See our{' '}
                <button
                  type="button"
                  onClick={() => navigate('/privacy')}
                  className="text-accent hover:underline"
                >
                  Privacy Policy
                </button>{' '}
                for details.
              </p>
            </div>
          </motion.form>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-60"
      >
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
    </div>
  );
}
