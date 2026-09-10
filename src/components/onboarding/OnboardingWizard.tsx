import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Plus,
  Mic,
  Volume2,
  Sparkles,
  Image as ImageIcon,
  Check,
  Trash2,
  Play,
  Pause,
  Smile,
  LogOut,
} from 'lucide-react';
import { ProfileApi } from '../../api/profile';
import { StateApi } from '../../api/state';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { UserState } from '../../types';
import { MediaImage } from '../common/MediaImage';
import { useMediaSrc, isMediaKey } from '../../utils/media-url';
import { getCognitoAuth } from '../../lib/cognito-auth';

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Man' },
  { value: 'FEMALE', label: 'Woman' },
  { value: 'NON_BINARY', label: 'Non-binary' },
];

const INTEREST_ENUM_MAP: Record<string, string> = {
  'Travel': 'TRAVEL',
  'Fitness': 'FITNESS',
  'Art & Design': 'ART',
  'Coffee': 'COFFEE',
  'Music': 'MUSIC',
  'Tech': 'TECHNOLOGY',
  'Cinema': 'MOVIES',
  'Reading': 'READING',
  'Cooking': 'COOKING',
  'Outdoors': 'NATURE',
  'Photography': 'PHOTOGRAPHY',
  'Gaming': 'GAMING',
  'Yoga': 'YOGA',
  'Wine & Dining': 'WINE',
  'Running': 'RUNNING',
  'Podcasts': 'WELLNESS',
  'Dogs': 'ANIMALS',
  'Cats': 'ANIMALS',
};

const PROMPT_PRESETS = [
  'A boundary of mine is...',
  'Dating me looks like...',
  'Typical Sunday looks like...',
  'I won’t stop talking about...',
  'The most spontaneous thing I’ve done...',
  'My simple pleasures in life...',
  'Together, we could...',
  'The key to my heart is...',
];

const INTEREST_PRESETS = [
  'Travel', 'Fitness', 'Art & Design', 'Coffee', 'Music', 'Tech',
  'Cinema', 'Reading', 'Cooking', 'Outdoors', 'Photography', 'Gaming',
  'Yoga', 'Wine & Dining', 'Running', 'Podcasts', 'Dogs', 'Cats',
];

const RELATIONSHIP_OPTIONS = [
  { value: 'MONOGAMOUS', label: 'Serious relationship (Monogamous)' },
  { value: 'CASUAL', label: 'Casual dating' },
  { value: 'OPEN', label: 'Open relationship' },
  { value: 'POLYAMOROUS', label: 'Polyamorous' },
  { value: 'ETHICALLY_NON_MONOGAMOUS', label: 'Ethically non-monogamous' },
  { value: 'NOT_SURE_YET', label: 'Not sure yet' },
];

const WANTS_KIDS_OPTIONS = [
  { value: 'OPEN', label: 'Open to children' },
  { value: 'YES', label: 'Want children' },
  { value: 'NO', label: 'Don’t want children' },
  { value: 'NOT_SURE', label: 'Not sure' },
];

const SMOKING_OPTIONS = [
  { value: 'NEVER', label: 'Never' },
  { value: 'SOCIALLY', label: 'Socially' },
  { value: 'REGULARLY', label: 'Regularly' },
  { value: 'TRYING_TO_QUIT', label: 'Trying to quit' },
];

const DRINKING_OPTIONS = [
  { value: 'SOCIALLY', label: 'Socially' },
  { value: 'NEVER', label: 'Never' },
  { value: 'REGULARLY', label: 'Regularly' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const RELIGION_OPTIONS = [
  { value: '', label: 'Select Religion / Philosophy' },
  { value: 'SPIRITUAL', label: 'Spiritual' },
  { value: 'AGNOSTIC', label: 'Agnostic' },
  { value: 'ATHEIST', label: 'Atheist' },
  { value: 'HINDU', label: 'Hindu' },
  { value: 'CHRISTIAN', label: 'Christian' },
  { value: 'CATHOLIC', label: 'Catholic' },
  { value: 'BUDDHIST', label: 'Buddhist' },
  { value: 'JEWISH', label: 'Jewish' },
  { value: 'MUSLIM', label: 'Muslim' },
  { value: 'SIKH', label: 'Sikh' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const STAR_SIGNS = [
  { value: '', label: 'Select Star Sign' },
  { value: 'ARIES', label: 'Aries' },
  { value: 'TAURUS', label: 'Taurus' },
  { value: 'GEMINI', label: 'Gemini' },
  { value: 'CANCER', label: 'Cancer' },
  { value: 'LEO', label: 'Leo' },
  { value: 'VIRGO', label: 'Virgo' },
  { value: 'LIBRA', label: 'Libra' },
  { value: 'SCORPIO', label: 'Scorpio' },
  { value: 'SAGITTARIUS', label: 'Sagittarius' },
  { value: 'CAPRICORN', label: 'Capricorn' },
  { value: 'AQUARIUS', label: 'Aquarius' },
  { value: 'PISCES', label: 'Pisces' },
];

const LANGUAGE_PRESETS = [
  { value: 'ENGLISH', label: 'English' },
  { value: 'HINDI', label: 'Hindi' },
  { value: 'SPANISH', label: 'Spanish' },
  { value: 'FRENCH', label: 'French' },
  { value: 'GERMAN', label: 'German' },
  { value: 'CHINESE', label: 'Chinese' },
  { value: 'JAPANESE', label: 'Japanese' },
  { value: 'KOREAN', label: 'Korean' },
  { value: 'ARABIC', label: 'Arabic' },
  { value: 'PORTUGUESE', label: 'Portuguese' },
  { value: 'RUSSIAN', label: 'Russian' },
  { value: 'ITALIAN', label: 'Italian' },
];

type Step = 'basics' | 'photos' | 'prompts' | 'lifestyle';

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, logout } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingPhotoIndex, setUploadingPhotoIndex] = useState<number | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const [displayName, setDisplayName] = useState(currentUser?.name || currentUser?.displayName || '');
  const [age, setAge] = useState(currentUser?.age || 25);
  const [gender, setGender] = useState(currentUser?.gender || 'MALE');
  const [interestedInGenders, setInterestedInGenders] = useState<string[]>(
    currentUser?.interestedIn && currentUser.interestedIn.length > 0 ? currentUser.interestedIn : ['FEMALE']
  );
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [work, setWork] = useState(currentUser?.work || '');
  const [education, setEducation] = useState(currentUser?.education || '');
  const [hometown, setHometown] = useState(currentUser?.hometown || '');
  const [height, setHeight] = useState<string>(currentUser?.height ? String(currentUser.height) : '');

  const [photos, setPhotos] = useState<string[]>(
    currentUser?.pictures && currentUser.pictures.length > 0
      ? currentUser.pictures
      : currentUser?.photos && currentUser.photos.length > 0
      ? currentUser.photos
      : []
  );

  const [selectedPromptId, setSelectedPromptId] = useState(PROMPT_PRESETS[0]);
  const [promptAnswer, setPromptAnswer] = useState('');
  const [promptsList, setPromptsList] = useState<Array<{ promptId: string; answer: string }>>([]);
  const [audioPromptKey, setAudioPromptKey] = useState<string>(currentUser?.audioPrompt || '');
  const resolvedAudioSrc = useMediaSrc(audioPromptKey);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [relationshipType, setRelationshipType] = useState(currentUser?.relationshipType || 'MONOGAMOUS');
  const [wantsKids, setWantsKids] = useState(currentUser?.wantsKids || 'OPEN');
  const [smoking, setSmoking] = useState(currentUser?.smokingStatus || 'NEVER');
  const [drinking, setDrinking] = useState(currentUser?.drinkingStatus || 'SOCIALLY');
  const [religion, setReligion] = useState(currentUser?.religion || 'SPIRITUAL');
  const [starSign, setStarSign] = useState(currentUser?.starSign || 'LEO');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    currentUser?.interests || ['Travel', 'Fitness', 'Coffee']
  );
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    currentUser?.languages && currentUser.languages.length > 0 ? currentUser.languages : ['ENGLISH']
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const targetSlotRef = useRef<number>(0);

  const getResolvedUserId = async () => {
    let uid = currentUser?.id;
    if (!uid || uid === 'me') {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      uid =
        (session.tokens?.idToken?.payload?.sub as string) ||
        (session.tokens?.accessToken?.payload?.sub as string) ||
        '';
    }
    return uid;
  };

  const toggleInterestedIn = (value: string) => {
    setInterestedInGenders((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? (prev.length > 1 ? prev.filter((l) => l !== lang) : prev) : [...prev, lang]
    );
  };

  const handlePhotoClick = (index: number) => {
    targetSlotRef.current = index;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const slot = targetSlotRef.current;
    setUploadingPhotoIndex(slot);
    try {
      const uid = await getResolvedUserId();
      const newKeys: string[] = [];
      for (const file of files) {
        const key = await ProfileApi.uploadMedia(uid, file);
        newKeys.push(key);
      }

      setPhotos((prev) => {
        let next = [...prev];
        if (files.length === 1 && slot < next.length) {
          next[slot] = newKeys[0];
        } else {
          next = [...next, ...newKeys].slice(0, 6);
        }
        return next.filter(Boolean);
      });
      showToast(files.length > 1 ? `${files.length} photos added!` : 'Photo added successfully!', 'success');
    } catch (err: any) {
      console.error('Error adding photo:', err);
      showToast(err?.message || 'Could not upload image. Please try again.', 'error');
    } finally {
      setUploadingPhotoIndex(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAudio(true);
    try {
      const uid = await getResolvedUserId();
      const localUrl = URL.createObjectURL(file);
      setAudioPreviewUrl(localUrl);

      const key = await ProfileApi.uploadMedia(uid, file);
      setAudioPromptKey(key);
      showToast('Voice note uploaded!', 'success');
    } catch (err: any) {
      console.error('Error uploading voice note:', err);
      showToast(err?.message || 'Failed to upload voice note.', 'error');
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const addPrompt = () => {
    if (!promptAnswer.trim()) {
      showToast('Please type an answer for your prompt.', 'error');
      return;
    }
    setPromptsList((prev) => [
      ...prev.filter((p) => p.promptId !== selectedPromptId),
      { promptId: selectedPromptId, answer: promptAnswer.trim() },
    ]);
    setPromptAnswer('');
    showToast('Prompt added to your profile!', 'success');
  };

  const removePrompt = (promptId: string) => {
    setPromptsList((prev) => prev.filter((p) => p.promptId !== promptId));
  };

  const handleNextFromBasics = () => {
    if (!displayName.trim()) {
      showToast('Please enter your name.', 'error');
      return;
    }
    if (!age || age < 18) {
      showToast('You must be at least 18 years old.', 'error');
      return;
    }
    setStep('photos');
  };

  const handleNextFromPhotos = () => {
    if (photos.length < 3) {
      showToast(`Please upload at least 3 photos to continue (${photos.length}/3 added).`, 'error');
      return;
    }
    setStep('prompts');
  };

  const handleNextFromPrompts = () => {
    setStep('lifestyle');
  };

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      const uid = await getResolvedUserId();
      const finalPrompts = [...promptsList];
      if (promptAnswer.trim()) {
        finalPrompts.push({ promptId: selectedPromptId, answer: promptAnswer.trim() });
      }

      // A real upload returns either a pending/ key (fresh, not yet claimed by a profile save) or a
      // media/ key (already stored). Anything else is placeholder sample data, and the fabricated key
      // below exists only to keep that demo path shaped correctly — never fabricate over a real key, or
      // the profile would reference an object that was never uploaded.
      const cleanedPictures = photos.map((p) =>
        isMediaKey(p) ? p : `media/${uid}/${crypto.randomUUID()}`
      );
      const cleanedAudioPrompt = audioPromptKey
        ? isMediaKey(audioPromptKey)
          ? audioPromptKey
          : `media/${uid}/${crypto.randomUUID()}`
        : undefined;

      const finalInterests = selectedInterests.map(
        (i) => INTEREST_ENUM_MAP[i] || i.toUpperCase().replace(/[\s&-]+/g, '_')
      );
      const finalLanguages = selectedLanguages.map((l) => l.toUpperCase().replace(/[\s&-]+/g, '_'));

      const profilePayload: Record<string, unknown> = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        age: Number(age) || 18,
        gender: gender || 'MALE',
        interestedIn: interestedInGenders.length > 0 ? interestedInGenders : ['FEMALE'],
        pictures: cleanedPictures,
        audioPrompt: cleanedAudioPrompt,
        prompts: finalPrompts.length > 0 ? finalPrompts : undefined,
        work: work.trim() || undefined,
        education: education.trim() || undefined,
        hometown: hometown.trim() || undefined,
        height: height ? Number(height) : undefined,
        relationshipType: relationshipType || undefined,
        wantsKids: wantsKids || undefined,
        smokingStatus: smoking || undefined,
        drinkingStatus: drinking || undefined,
        religion: religion || undefined,
        starSign: starSign || undefined,
        interests: finalInterests.length > 0 ? finalInterests : undefined,
        languages: finalLanguages.length > 0 ? finalLanguages : undefined,
      };

      await ProfileApi.upsert(uid, profilePayload);
      // Completing onboarding is NOT optional: it transitions the authoritative user state
      // ONBOARDING → AVAILABLE in the State service. Until that happens the user cannot be hooked
      // at all (the hook transaction requires current_state IN (AVAILABLE, HOOKED)), so a user who
      // reached the app with this step failed would appear fully onboarded while being silently
      // unmatchable. This was previously swallowed with a console.warn and the wizard continued into
      // the app, which is exactly how a user ended up stuck in ONBOARDING with a working-looking UI.
      // Surface the failure and keep the user in the wizard so they can retry.
      await StateApi.completeOnboarding();

      setCurrentUser({
        id: uid,
        name: displayName.trim(),
        displayName: displayName.trim(),
        age: Number(age) || 18,
        gender,
        interestedIn: interestedInGenders,
        bio: bio.trim(),
        work: work.trim() || undefined,
        education: education.trim() || undefined,
        hometown: hometown.trim() || undefined,
        height: height ? Number(height) : undefined,
        relationshipType: relationshipType || undefined,
        wantsKids: wantsKids || undefined,
        smokingStatus: smoking || undefined,
        drinkingStatus: drinking || undefined,
        religion: religion || undefined,
        starSign: starSign || undefined,
        interests: finalInterests,
        languages: finalLanguages,
        prompts: finalPrompts,
        pictures: cleanedPictures,
        photos: cleanedPictures,
        audioPrompt: cleanedAudioPrompt,
        currentState: UserState.AVAILABLE,
      } as any);

      showToast('Welcome to OneHook! Your profile is complete.', 'success');
      navigate('/app', { replace: true });
    } catch (err) {
      showToast('Could not save profile. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipAndLogout = async () => {
    setLoggingOut(true);
    try {
      await getCognitoAuth().logout();
      logout();
      showToast('You can continue your profile anytime. See you soon!', 'info');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Logout error during onboarding skip:', err);
      showToast('Could not sign out. Please try again.', 'error');
    } finally {
      setLoggingOut(false);
    }
  };

  if (saving || loggingOut) return <LoadingSpinner fullScreen />;

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6 sm:p-12">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
      <input type="file" ref={audioInputRef} onChange={handleAudioChange} accept="audio/*" className="hidden" />

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full bg-white border border-border p-8 sm:p-12 space-y-10 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-4 flex-1">
              <span className="text-[11px] uppercase tracking-[0.4em] font-black text-accent">Step {step === 'basics' ? '1' : step === 'photos' ? '2' : step === 'prompts' ? '3' : '4'} of 4</span>
              <h1 className="text-4xl sm:text-5xl font-serif italic tracking-tighter uppercase">
                {step === 'basics' && 'Create Your Profile'}
                {step === 'photos' && 'Upload Your Photos'}
                {step === 'prompts' && 'Showcase Your Voice'}
                {step === 'lifestyle' && 'Your Lifestyle'}
              </h1>
            </div>
            <button
              type="button"
              onClick={handleSkipAndLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-accent transition-all disabled:opacity-40"
              title="Sign out and continue later"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-bold uppercase tracking-wider">Skip for now</span>
            </button>
          </div>
        </div>

        {/* ── STEP 1: BASICS ── */}
        {step === 'basics' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-[1.5fr_1fr] gap-6">
              <Field label="Display Name *">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="field-input"
                  placeholder="How you want to be introduced"
                />
              </Field>
              <Field label="Age *">
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="field-input"
                />
              </Field>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">
                Your Gender *
              </label>
              <div className="grid grid-cols-3 gap-3">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGender(g.value)}
                    className={`py-3.5 px-4 text-xs font-bold uppercase tracking-widest border transition-all ${
                      gender === g.value
                        ? 'bg-accent text-white border-accent shadow-md'
                        : 'border-border hover:border-accent/40 bg-white text-foreground'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">
                Interested In * (Select all that apply)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => toggleInterestedIn(g.value)}
                    className={`py-3.5 px-4 text-xs font-bold uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${
                      interestedInGenders.includes(g.value)
                        ? 'bg-accent text-white border-accent shadow-md'
                        : 'border-border hover:border-accent/40 bg-white text-foreground'
                    }`}
                  >
                    {interestedInGenders.includes(g.value) && <Check className="w-3.5 h-3.5" />}
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Bio / About You">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A glimpse into what makes you, you..."
                className="field-input min-h-24 resize-none"
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Work / Job Title">
                <input
                  value={work}
                  onChange={(e) => setWork(e.target.value)}
                  placeholder="e.g. Architect, Founder, Designer"
                  className="field-input"
                />
              </Field>
              <Field label="Education / University">
                <input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="e.g. Stanford, Pratt Institute"
                  className="field-input"
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Hometown / Current City">
                <input
                  value={hometown}
                  onChange={(e) => setHometown(e.target.value)}
                  placeholder="e.g. Mumbai, New York, London"
                  className="field-input"
                />
              </Field>
              <Field label="Height (cm)">
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 178"
                  className="field-input"
                />
              </Field>
            </div>

            <button
              onClick={handleNextFromBasics}
              className="w-full py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 transition-all shadow-md mt-6"
            >
              Continue to Photos
            </button>
          </div>
        )}

        {/* ── STEP 2: PHOTOS (MIN 3 REQUIRED) ── */}
        {step === 'photos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider uppercase text-foreground flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-accent" /> Photos ({photos.length}/6 added)
              </span>
              <span className={`text-[11px] font-black uppercase tracking-widest px-3 py-1 ${
                photos.length >= 3 ? 'bg-green-100 text-green-800' : 'bg-accent/10 text-accent'
              }`}>
                {photos.length >= 3 ? 'Requirement Met' : `Need ${3 - photos.length} more`}
              </span>
            </div>

            {/* 6 Photo Slots Grid */}
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const photoSrc = photos[index];
                const isUploading = uploadingPhotoIndex === index;

                return (
                  <div
                    key={index}
                    onClick={() => handlePhotoClick(index)}
                    className={`relative aspect-[3/4] border-2 border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden group ${
                      photoSrc
                        ? 'border-solid border-border bg-black/5'
                        : 'border-border/80 hover:border-accent bg-bg/30'
                    }`}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <LoadingSpinner />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                          Uploading...
                        </span>
                      </div>
                    ) : photoSrc ? (
                      <>
                        <MediaImage
                          src={photoSrc}
                          alt={`Slot ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-2 left-2 bg-accent text-white text-[9px] font-black px-2 py-0.5 uppercase tracking-widest shadow">
                            Main
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => removePhoto(index, e)}
                          className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-600 text-white transition-all shadow-md"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-center p-3">
                        <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground group-hover:text-accent group-hover:border-accent transition-all">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-accent">
                          {index < 3 ? `Photo ${index + 1} *` : `Photo ${index + 1}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-accent/5 border border-accent/20 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <span>
                <strong>Tip:</strong> Your main photo should clearly show your face. Add candid, hobby, or travel photos to tell your full story.
              </span>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setStep('basics')}
                className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNextFromPhotos}
                disabled={photos.length < 3}
                className="flex-1 py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
              >
                Continue ({photos.length}/3 photos added)
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: PROMPTS & VOICE NOTE ── */}
        {step === 'prompts' && (
          <div className="space-y-8">
            {/* Written Prompts Section */}
            <div className="space-y-4">
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
                <Smile className="w-4 h-4" /> Written Prompt
              </div>

              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-widest opacity-60 font-bold block">
                  Select a Prompt
                </label>
                <select
                  value={selectedPromptId}
                  onChange={(e) => setSelectedPromptId(e.target.value)}
                  className="field-input"
                >
                  {PROMPT_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <textarea
                  value={promptAnswer}
                  onChange={(e) => setPromptAnswer(e.target.value)}
                  placeholder="Your authentic, personal answer..."
                  className="field-input min-h-24 resize-none"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addPrompt}
                    className="py-2.5 px-5 bg-border/60 hover:bg-accent hover:text-white text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    Save Prompt
                  </button>
                </div>
              </div>

              {promptsList.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-[10px] uppercase tracking-widest opacity-60 font-black">
                    Saved Prompts ({promptsList.length})
                  </span>
                  {promptsList.map((p) => (
                    <div
                      key={p.promptId}
                      className="p-4 border border-border bg-bg/20 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-accent">
                          {p.promptId}
                        </div>
                        <p className="text-xs font-serif italic mt-1 text-foreground">
                          "{p.answer}"
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePrompt(p.promptId)}
                        className="text-muted-foreground hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Prompt Section */}
            <div className="space-y-4 border-t border-border pt-6">
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Voice Prompt (Audio Note)
              </div>
              <p className="text-xs opacity-60 italic">
                Upload or record a 10–30 second voice note so matches can hear your tone and vibe.
              </p>

              {audioPreviewUrl || audioPromptKey ? (
                <div className="p-4 border border-border bg-accent/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlayAudio}
                      className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-md hover:bg-accent/90"
                    >
                      {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-widest text-foreground">
                        Voice Note Ready
                      </div>
                      <div className="text-[10px] opacity-60 font-mono">
                        {isMediaKey(audioPromptKey) ? 'Uploaded to S3' : 'Voice Note Ready'}
                      </div>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={audioPreviewUrl || resolvedAudioSrc}
                    onEnded={() => setIsPlayingAudio(false)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAudioPromptKey('');
                      setAudioPreviewUrl('');
                    }}
                    className="text-muted-foreground hover:text-red-600 p-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={uploadingAudio}
                  className="w-full py-4 border-2 border-dashed border-border hover:border-accent flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-all"
                >
                  {uploadingAudio ? (
                    <>
                      <LoadingSpinner /> Uploading Audio...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" /> Upload Audio Note (.mp3, .m4a, .wav)
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setStep('photos')}
                className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNextFromPrompts}
                className="flex-1 py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 transition-all shadow-md"
              >
                Continue to Lifestyle
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: LIFESTYLE & IDENTITY ── */}
        {step === 'lifestyle' && (
          <div className="space-y-8">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Relationship Goal">
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value)}
                  className="field-input"
                >
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Family Plans / Kids">
                <select
                  value={wantsKids}
                  onChange={(e) => setWantsKids(e.target.value)}
                  className="field-input"
                >
                  {WANTS_KIDS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Drinking">
                <select
                  value={drinking}
                  onChange={(e) => setDrinking(e.target.value)}
                  className="field-input"
                >
                  {DRINKING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Smoking">
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value)}
                  className="field-input"
                >
                  {SMOKING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Religion / Philosophy">
                <select
                  value={religion}
                  onChange={(e) => setReligion(e.target.value)}
                  className="field-input"
                >
                  {RELIGION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Star Sign">
                <select
                  value={starSign}
                  onChange={(e) => setStarSign(e.target.value)}
                  className="field-input"
                >
                  {STAR_SIGNS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Languages Multi-Select Pills */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">
                Languages You Speak ({selectedLanguages.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_PRESETS.map((lang) => {
                  const active = selectedLanguages.includes(lang.value);
                  return (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => toggleLanguage(lang.value)}
                      className={`py-2 px-3.5 text-xs font-bold rounded-full border transition-all ${
                        active
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'border-border bg-white text-muted-foreground hover:border-accent/40'
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interests & Passions Pills */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">
                Interests & Passions ({selectedInterests.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_PRESETS.map((interest) => {
                  const active = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={`py-2 px-3.5 text-xs font-bold rounded-full border transition-all ${
                        active
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'border-border bg-white text-muted-foreground hover:border-accent/40'
                      }`}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setStep('prompts')}
                className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={finishOnboarding}
                className="flex-1 py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 transition-all shadow-md"
              >
                Finish & Enter OneHook
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
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">{label}</label>
      {children}
    </div>
  );
}
