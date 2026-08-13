import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ProfileApi } from '../../api/profile';
import { PreferencesApi } from '../../api/preferences';
import { StateApi } from '../../api/state';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { UserState } from '../../types';

const GENDER_OPTIONS = ['M', 'F', 'NB'];
const INTERESTED_IN_OPTIONS = ['M', 'F', 'NB'];

type Step = 'basics' | 'preferences' | 'optional';

const OPTION_LABELS: Record<string, string> = {
  M: 'Man',
  F: 'Woman',
  NB: 'Non-binary',
  CASUAL: 'Casual dating',
  SERIOUS: 'A serious relationship',
  FRIENDSHIP: 'Friendship',
  YES: 'Yes',
  NO: 'No',
  OPEN: 'Open to it',
  NEVER: 'Never',
  SOCIALLY: 'Socially',
  REGULARLY: 'Regularly',
};

function formatOptionLabel(value: string): string {
  return OPTION_LABELS[value] ?? value;
}

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState('');
  const [bio, setBio] = useState('');
  const [interestedInGenders, setInterestedInGenders] = useState<string[]>([]);

  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  const [minAge, setMinAge] = useState(21);
  const [maxAge, setMaxAge] = useState(45);

  const [relationshipType, setRelationshipType] = useState('');
  const [wantsKids, setWantsKids] = useState('');
  const [smoking, setSmoking] = useState('');
  const [drinking, setDrinking] = useState('');
  const [interests, setInterests] = useState('');

  const userId = currentUser?.id || 'me';

  const toggleInterestedIn = (value: string) => {
    setInterestedInGenders((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  };

  const saveBasics = async () => {
    if (!displayName.trim() || !gender || interestedInGenders.length === 0) {
      showToast('Please add your name, gender, and who you’d like to meet.', 'error');
      return;
    }
    if (age < 18) {
      showToast('You need to be at least 18 to join OneHook.', 'error');
      return;
    }
    setStep('preferences');
  };

  const savePreferences = async () => {
    setStep('optional');
  };

  const finishOnboarding = async (skipOptional: boolean) => {
    setSaving(true);
    try {
      // Lifestyle/relationship attributes belong on the PROFILE, not preferences.
      const profilePayload: Record<string, unknown> = {
        displayName,
        age,
        gender,
        bio,
      };

      if (!skipOptional) {
        if (relationshipType) profilePayload.relationshipType = relationshipType;
        if (wantsKids) profilePayload.wantsKids = wantsKids;
        if (smoking) profilePayload.smokingStatus = smoking;
        if (drinking) profilePayload.drinkingStatus = drinking;
        if (interests.trim()) {
          profilePayload.interests = interests
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

      await ProfileApi.upsert(userId, profilePayload);

      // Matching preferences: age range, distance, and interested-in genders.
      await PreferencesApi.upsert(userId, {
        maxDistanceKm,
        minAge,
        maxAge,
        genders: interestedInGenders,
      });

      await StateApi.completeOnboarding();

      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          name: displayName,
          gender,
          bio,
          interestedIn: interestedInGenders,
          currentState: UserState.AVAILABLE,
        });
      }

      showToast('Your profile is ready. Let’s find your next Hook!', 'success');
      navigate('/app', { replace: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'We couldn’t save your profile. Please try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-white border border-border p-12 space-y-8"
      >
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-40 font-bold">
            Step {step === 'basics' ? '1' : step === 'preferences' ? '2' : '3'} of 3
          </p>
          <h1 className="text-4xl font-serif italic uppercase tracking-tighter">
            {step === 'basics' && 'Your Profile'}
            {step === 'preferences' && 'Your Preferences'}
            {step === 'optional' && 'A Little More About You'}
          </h1>
          <p className="text-xs opacity-60 italic leading-relaxed">
            {step === 'basics' &&
              'Share the basics so we can introduce you to people who fit what you’re looking for.'}
            {step === 'preferences' &&
              'Choose how far you’d like to look and the age range you’re comfortable with.'}
            {step === 'optional' &&
              'A few extra details can help us suggest better matches. You can always add them later in Membership.'}
          </p>
        </div>

        {step === 'basics' && (
          <div className="space-y-5">
            <Field label="Display name *">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border-b border-border py-2 outline-none text-sm"
                placeholder="The name people will see"
              />
            </Field>
            <Field label="Age *">
              <input
                type="number"
                min={18}
                max={99}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full border-b border-border py-2 outline-none text-sm"
              />
            </Field>
            <Field label="Your gender *">
              <OptionRow options={GENDER_OPTIONS} value={gender} onChange={setGender} />
            </Field>
            <Field label="Interested in *">
              <MultiOptionRow
                options={INTERESTED_IN_OPTIONS}
                selected={interestedInGenders}
                onToggle={toggleInterestedIn}
              />
            </Field>
            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full border border-border p-3 outline-none text-sm resize-none"
                placeholder="Share a little about yourself"
              />
            </Field>
            <button
              onClick={saveBasics}
              className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'preferences' && (
          <div className="space-y-5">
            <Field label={`Max distance: ${maxDistanceKm} km`}>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min age">
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={minAge}
                  onChange={(e) => setMinAge(Number(e.target.value))}
                  className="w-full border-b border-border py-2 outline-none text-sm"
                />
              </Field>
              <Field label="Max age">
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={maxAge}
                  onChange={(e) => setMaxAge(Number(e.target.value))}
                  className="w-full border-b border-border py-2 outline-none text-sm"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('basics')}
                className="flex-1 py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-bold"
              >
                Back
              </button>
              <button
                onClick={savePreferences}
                className="flex-1 py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'optional' && (
          <div className="space-y-5">
            <Field label="What are you looking for?">
              <OptionRow
                options={['CASUAL', 'SERIOUS', 'FRIENDSHIP']}
                value={relationshipType}
                onChange={setRelationshipType}
              />
            </Field>
            <Field label="How do you feel about kids?">
              <OptionRow
                options={['YES', 'NO', 'OPEN']}
                value={wantsKids}
                onChange={setWantsKids}
              />
            </Field>
            <Field label="Smoking">
              <OptionRow
                options={['NEVER', 'SOCIALLY', 'REGULARLY']}
                value={smoking}
                onChange={setSmoking}
              />
            </Field>
            <Field label="Drinking">
              <OptionRow
                options={['NEVER', 'SOCIALLY', 'REGULARLY']}
                value={drinking}
                onChange={setDrinking}
              />
            </Field>
            <Field label="Your interests (separate with commas)">
              <input
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="w-full border-b border-border py-2 outline-none text-sm"
                placeholder="Hiking, jazz, design"
              />
            </Field>
            <div className="flex gap-3">
              <button
                onClick={() => finishOnboarding(true)}
                className="flex-1 py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-bold"
              >
                Skip for now
              </button>
              <button
                onClick={() => finishOnboarding(false)}
                className="flex-1 py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">{label}</span>
      {children}
    </label>
  );
}

function OptionRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-3 py-1 border text-[10px] uppercase tracking-widest font-bold ${
            value === opt ? 'border-accent bg-accent text-white' : 'border-border opacity-60'
          }`}
        >
          {formatOptionLabel(opt)}
        </button>
      ))}
    </div>
  );
}

function MultiOptionRow({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={`px-3 py-1 border text-[10px] uppercase tracking-widest font-bold ${
            selected.includes(opt)
              ? 'border-accent bg-accent text-white'
              : 'border-border opacity-60'
          }`}
        >
          {formatOptionLabel(opt)}
        </button>
      ))}
    </div>
  );
}
