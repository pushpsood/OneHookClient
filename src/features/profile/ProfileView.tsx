import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, SlidersHorizontal } from 'lucide-react';
import type { UserProfile } from '../../types';
import { ProfileApi } from '../../api/profile';
import { SetPasswordCard } from '../../components/profile/SetPasswordCard';
import { usePreferences } from '../../hooks/use-api';
import { ApiError } from '../../lib/api-client';
import { isPremium, useAppStore } from '../../store/app-store';
import { useToast } from '../../components/common/Toast';
import { getOptimizedProfileImageSrc } from '../../utils/profile-image';

const LivenessVerification = lazy(() =>
  import('../../components/profile/LivenessVerification').then((module) => ({
    default: module.LivenessVerification,
  }))
);

export function ProfileView({
  user,
  onUpgrade,
  upgrading,
  onVerified,
}: {
  key?: string;
  user: UserProfile;
  onUpgrade?: () => void;
  upgrading?: boolean;
  onVerified?: () => void;
}) {
  // Tier is server-owned: read it from the authoritative State snapshot, never from the profile
  // (the Profile read model intentionally omits subscriptionTier).
  const { userState } = useAppStore();
  const premium = useAppStore(isPremium);
  const tierLabel = userState?.subscriptionTier ?? '—';
  const { showToast } = useToast();
  const { prefs, save: savePreferences, saving } = usePreferences(user.id);
  const [savingProfile, setSavingProfile] = useState(false);
  const [basic, setBasic] = useState({
    displayName: user.displayName || user.name || '',
    bio: user.bio || '',
    age: String(user.age || ''),
    gender: user.gender || '',
    interestedInGenders: (prefs?.genders || user.interestedIn || []).join(', '),
  });
  const [optional, setOptional] = useState({
    maxDistanceKm: String(prefs?.maxDistanceKm || ''),
    minAge: String(prefs?.minAge || ''),
    maxAge: String(prefs?.maxAge || ''),
    relationshipType: user.relationshipType || '',
    wantsKids: user.wantsKids || '',
    familyPlans: user.familyPlans || '',
    smoking: user.smokingStatus || '',
    drinking: user.drinkingStatus || '',
    cannabis: user.cannabisStatus || '',
    drugs: user.drugsStatus || '',
    religion: user.religion || '',
    interests: (user.interests || []).join(', '),
    starSign: user.starSign || '',
  });

  useEffect(() => {
    setBasic((prev) => ({
      ...prev,
      interestedInGenders: (prefs?.genders || user.interestedIn || []).join(', '),
    }));
    setOptional((prev) => ({
      ...prev,
      maxDistanceKm: String(prefs?.maxDistanceKm || ''),
      minAge: String(prefs?.minAge || ''),
      maxAge: String(prefs?.maxAge || ''),
      relationshipType: user.relationshipType || '',
      wantsKids: user.wantsKids || '',
      familyPlans: user.familyPlans || '',
      smoking: user.smokingStatus || '',
      drinking: user.drinkingStatus || '',
      cannabis: user.cannabisStatus || '',
      drugs: user.drugsStatus || '',
      religion: user.religion || '',
      interests: (user.interests || []).join(', '),
      starSign: user.starSign || '',
    }));
  }, [prefs, user]);

  const csv = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const numberOrUndefined = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const handleSaveMatchingDetails = async () => {
    try {
      setSavingProfile(true);
      const interests = csv(optional.interests);

      // Lifestyle / relationship attributes are PROFILE fields.
      await ProfileApi.upsert(user.id, {
        displayName: basic.displayName,
        bio: basic.bio,
        age: numberOrUndefined(basic.age) || 18,
        gender: basic.gender,
        relationshipType: optional.relationshipType || undefined,
        wantsKids: optional.wantsKids || undefined,
        familyPlans: optional.familyPlans || undefined,
        smokingStatus: optional.smoking || undefined,
        drinkingStatus: optional.drinking || undefined,
        cannabisStatus: optional.cannabis || undefined,
        drugsStatus: optional.drugs || undefined,
        religion: optional.religion || undefined,
        starSign: optional.starSign || undefined,
        interests,
      });

      // Matching preferences are limited to age range, distance, and genders.
      await savePreferences({
        maxDistanceKm: numberOrUndefined(optional.maxDistanceKm),
        minAge: numberOrUndefined(optional.minAge),
        maxAge: numberOrUndefined(optional.maxAge),
        genders: csv(basic.interestedInGenders),
      });

      showToast('Your changes are saved.', 'success');
    } catch (error) {
      showToast(
        error instanceof ApiError
          ? error.message
          : 'We couldn’t save your changes. Please try again.',
        'error'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const optionalCount = [
    optional.maxDistanceKm,
    optional.minAge,
    optional.maxAge,
    optional.relationshipType,
    optional.wantsKids,
    optional.familyPlans,
    optional.smoking,
    optional.drinking,
    optional.cannabis,
    optional.drugs,
    optional.religion,
    optional.interests,
    optional.starSign,
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 p-12 bg-[#F9F9F9] overflow-y-auto"
    >
      <div className="max-w-6xl mx-auto bg-white border border-border p-12 space-y-12 shadow-sm">
        <div className="flex items-center gap-16">
          <div className="relative">
            <div className="w-56 h-56 bg-border overflow-hidden grayscale border-4 border-white shadow-xl">
              <img
                src={getOptimizedProfileImageSrc(user.photos?.[0])}
                alt="Me"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-accent text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.3em] shadow-xl">
              LEVEL 12
            </div>
          </div>
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-6xl font-serif italic tracking-tighter uppercase">{user.name}</h2>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-accent font-black uppercase tracking-[0.4em]">
                  {tierLabel}
                </span>
                {user.verified && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-border"></span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-accent font-black uppercase tracking-[0.3em]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  </>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-border"></span>
                <span className="text-[11px] opacity-30 font-bold uppercase tracking-widest italic">
                  {user.birthDate}
                </span>
              </div>
            </div>
            <p className="text-base opacity-60 leading-relaxed font-serif max-w-sm italic border-l-2 border-border pl-6">
              "{user.bio}"
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 py-8 border-y border-border">
          <div className="space-y-3">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              Profile Basics
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">
              {[basic.displayName, basic.age, basic.gender].filter(Boolean).length}/3
            </div>
          </div>
          <div className="space-y-3 border-x border-border px-8">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              More About You
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">
              {optionalCount}
            </div>
          </div>
          <div className="space-y-3 text-right">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              Profile Status
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">
              {(user.moderationStatus || 'APPROVED').toLowerCase()}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10">
          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
                Your Basics
              </div>
              <p className="mt-2 text-xs opacity-50 leading-relaxed">
                Start with your name, age, gender, and who you&rsquo;d like to meet. Add more
                whenever you&rsquo;re ready.
              </p>
            </div>
            <Field label="Display name">
              <input
                value={basic.displayName}
                onChange={(e) => setBasic((prev) => ({ ...prev, displayName: e.target.value }))}
                className="field-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Age">
                <input
                  value={basic.age}
                  type="number"
                  min="18"
                  onChange={(e) => setBasic((prev) => ({ ...prev, age: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Gender">
                <input
                  value={basic.gender}
                  onChange={(e) => setBasic((prev) => ({ ...prev, gender: e.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>
            <Field label="Interested in">
              <input
                value={basic.interestedInGenders}
                onChange={(e) =>
                  setBasic((prev) => ({ ...prev, interestedInGenders: e.target.value }))
                }
                placeholder="Women, Men"
                className="field-input"
              />
            </Field>
            <Field label="Bio">
              <textarea
                value={basic.bio}
                onChange={(e) => setBasic((prev) => ({ ...prev, bio: e.target.value }))}
                className="field-input min-h-28 resize-none"
              />
            </Field>
          </section>

          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Match Preferences &amp; More
              </div>
              <p className="mt-2 text-xs opacity-50 leading-relaxed">
                Choose who you&rsquo;d like to meet, then share any lifestyle details that can help
                us suggest people you may click with.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Distance km">
                <input
                  value={optional.maxDistanceKm}
                  type="number"
                  min="1"
                  onChange={(e) =>
                    setOptional((prev) => ({ ...prev, maxDistanceKm: e.target.value }))
                  }
                  className="field-input"
                />
              </Field>
              <Field label="Min age">
                <input
                  value={optional.minAge}
                  type="number"
                  min="18"
                  onChange={(e) => setOptional((prev) => ({ ...prev, minAge: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Max age">
                <input
                  value={optional.maxAge}
                  type="number"
                  min="18"
                  onChange={(e) => setOptional((prev) => ({ ...prev, maxAge: e.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Relationship">
                <select
                  value={optional.relationshipType}
                  onChange={(e) =>
                    setOptional((prev) => ({ ...prev, relationshipType: e.target.value }))
                  }
                  className="field-input"
                >
                  <option value="">Open</option>
                  <option value="CASUAL">Casual</option>
                  <option value="SERIOUS">Serious</option>
                  <option value="FRIENDSHIP">Friendship</option>
                </select>
              </Field>
              <Field label="Kids">
                <select
                  value={optional.wantsKids}
                  onChange={(e) => setOptional((prev) => ({ ...prev, wantsKids: e.target.value }))}
                  className="field-input"
                >
                  <option value="">Open</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="OPEN">Open to it</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(
                ['familyPlans', 'smoking', 'drinking', 'cannabis', 'drugs', 'religion'] as const
              ).map((key) => (
                <div key={key}>
                  <Field label={key.replace(/[A-Z]/g, ' $&')}>
                    <input
                      value={optional[key]}
                      onChange={(e) => setOptional((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="field-input"
                    />
                  </Field>
                </div>
              ))}
            </div>
            <Field label="Interests">
              <input
                value={optional.interests}
                onChange={(e) => setOptional((prev) => ({ ...prev, interests: e.target.value }))}
                placeholder="Design, jazz, climbing"
                className="field-input"
              />
            </Field>
            <Field label="Star sign">
              <input
                value={optional.starSign}
                onChange={(e) => setOptional((prev) => ({ ...prev, starSign: e.target.value }))}
                placeholder="Virgo"
                className="field-input"
              />
            </Field>
          </section>
        </div>

        {userState != null && !premium && (
          <div className="bg-accent/5 border border-accent/20 p-8 space-y-4">
            <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
              More with Premium
            </div>
            <p className="text-xs opacity-60 leading-relaxed max-w-xl">
              Get read receipts, delivery confirmations, the option to delete chats for everyone,
              and room for more connections at once.
            </p>
            <button
              onClick={onUpgrade}
              disabled={upgrading}
              className="w-full py-4 bg-accent text-white text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.01] transition-all disabled:opacity-40"
            >
              {upgrading ? 'Upgrading…' : 'Upgrade to Premium'}
            </button>
          </div>
        )}

        <div className="flex gap-8">
          <button
            onClick={handleSaveMatchingDetails}
            disabled={savingProfile || saving}
            className="flex-1 py-5 bg-accent text-white text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.02] shadow-2xl transition-all disabled:opacity-40"
          >
            {savingProfile || saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button className="flex-1 py-5 border border-border text-[11px] font-black uppercase tracking-[0.4em] hover:bg-bg transition-all">
            Invite Someone
          </button>
        </div>

        <SetPasswordCard />

        <Suspense fallback={null}>
          <LivenessVerification verified={Boolean(user.verified)} onVerified={onVerified} />
        </Suspense>

        <div className="text-center opacity-10 mt-12">
          <span className="text-[10px] uppercase tracking-[0.8em] font-mono">
            EST. 2024 • Verified Identity Protocol Enabled
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">{label}</span>
      {children}
    </label>
  );
}
