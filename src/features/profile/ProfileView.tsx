import React, { lazy, Suspense, useEffect, useState, useRef, type ReactNode, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  SlidersHorizontal,
  Plus,
  Trash2,
  Image as ImageIcon,
  Volume2,
  Play,
  Pause,
  Mic,
  Briefcase,
  GraduationCap,
  MapPin,
  Sparkles,
  Check,
  Eye,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import { ProfileApi } from '../../api/profile';
import { SetPasswordCard } from '../../components/profile/SetPasswordCard';
import { AccountSettingsCard } from '../../components/profile/AccountSettingsCard';
import { DeviceManagementCard } from '../../components/profile/DeviceManagementCard';
import { usePreferences } from '../../hooks/use-api';
import { isPremium, useAppStore } from '../../store/app-store';
import { useToast } from '../../components/common/Toast';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { MediaImage } from '../../components/common/MediaImage';
import { useMediaSrc } from '../../utils/media-url';
import { ModerationBadge } from '../../components/ui/ModerationBadge';
import { AudioRecorder } from '../../components/profile/AudioRecorder';
import { ProfilePreviewModal } from '../../components/profile/ProfilePreviewModal';
import { ProfilePreviewHoverCard } from '../../components/profile/ProfilePreviewHoverCard';
import type { DiscoveryProfileData } from '../discovery/DiscoveryCard';


const LivenessVerification = lazy(() =>
  import('../../components/profile/LivenessVerification').then((module) => ({
    default: module.LivenessVerification,
  }))
);

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Man' },
  { value: 'FEMALE', label: 'Woman' },
  { value: 'NON_BINARY', label: 'Non-binary' },
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
  { value: '', label: 'Select' },
  { value: 'NEVER', label: 'Never' },
  { value: 'SOCIALLY', label: 'Socially' },
  { value: 'REGULARLY', label: 'Regularly' },
  { value: 'TRYING_TO_QUIT', label: 'Trying to quit' },
];

const DRINKING_OPTIONS = [
  { value: '', label: 'Select' },
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

const INTEREST_PRESETS = [
  'Travel', 'Fitness', 'Art & Design', 'Coffee', 'Music', 'Tech',
  'Cinema', 'Reading', 'Cooking', 'Outdoors', 'Photography', 'Gaming',
  'Yoga', 'Wine & Dining', 'Running', 'Podcasts', 'Dogs', 'Cats',
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
  const { userState, setCurrentUser } = useAppStore();
  const premium = useAppStore(isPremium);
  const tierLabel = userState?.subscriptionTier ?? '—';
  const { showToast } = useToast();
  const { prefs, save: savePreferences, saving } = usePreferences(user.id);
  const fieldStatus = user.fieldModerationStatus || {};

  // Keep the local photo grid in sync with the authoritative store
  useEffect(() => {
    const next =
      user.pictures && user.pictures.length > 0 ? user.pictures : user.photos || [];
    setPhotos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.pictures]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [isHoveringAvatar, setIsHoveringAvatar] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [photos, setPhotos] = useState<string[]>(
    user.pictures && user.pictures.length > 0
      ? user.pictures
      : user.photos && user.photos.length > 0
      ? user.photos
      : []
  );

  const [audioPromptKey, setAudioPromptKey] = useState<string>(user.audioPrompt || '');
  // Resolve the private audio-prompt object key to a presigned URL for playback.
  const resolvedAudioSrc = useMediaSrc(audioPromptKey);

  // Check if voice note or any media/text field is currently under review
  const isAudioPending =
    uploadingAudio ||
    fieldStatus.audioPrompt === 'PENDING' ||
    fieldStatus.audioPrompt?.includes('PENDING') ||
    Boolean(audioPromptKey && (fieldStatus[audioPromptKey] === 'PENDING' || fieldStatus[audioPromptKey]?.includes('PENDING'))) ||
    Boolean(user.audioPrompt && (fieldStatus[user.audioPrompt] === 'PENDING' || fieldStatus[user.audioPrompt]?.includes('PENDING')));

  const isAudioRejected =
    fieldStatus.audioPrompt === 'REJECTED' ||
    Boolean(audioPromptKey && fieldStatus[audioPromptKey] === 'REJECTED') ||
    Boolean(user.audioPrompt && fieldStatus[user.audioPrompt] === 'REJECTED');

  // Compute effective overall profile moderation status so the main badge depicts when
  // voice note (or other items) are under review or pending moderation.
  const effectiveModerationStatus = (() => {
    if (isAudioPending) {
      return user.moderationStatus && user.moderationStatus.includes('PENDING')
        ? user.moderationStatus
        : 'PENDING_MEDIA';
    }
    if (isAudioRejected && (!user.moderationStatus || user.moderationStatus === 'APPROVED')) {
      return 'REJECTED';
    }
    const hasAnyPendingField = Object.values(fieldStatus).some(
      (s) => typeof s === 'string' && (s === 'PENDING' || s.includes('PENDING'))
    );
    if (hasAnyPendingField && (!user.moderationStatus || user.moderationStatus === 'APPROVED')) {
      return 'PENDING_REVIEW';
    }
    return user.moderationStatus;
  })();
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const initialUserLoadedRef = useRef(false);
  const lastUserIdRef = useRef(user.id);

  const [promptsList, setPromptsList] = useState<Array<{ promptId: string; answer: string }>>(
    (user.prompts as any) || []
  );
  const [newPromptId, setNewPromptId] = useState(PROMPT_PRESETS[0]);
  const [newPromptAnswer, setNewPromptAnswer] = useState('');

  const [gender, setGender] = useState(user.gender || 'MALE');
  const [interestedInGenders, setInterestedInGenders] = useState<string[]>(
    user.interestedIn && user.interestedIn.length > 0
      ? user.interestedIn
      : prefs?.genders && prefs.genders.length > 0
      ? prefs.genders
      : ['FEMALE']
  );

  const [basic, setBasic] = useState({
    displayName: user.displayName || user.name || '',
    bio: user.bio || '',
    age: String(user.age || '25'),
    work: user.work || '',
    education: user.education || '',
    hometown: user.hometown || '',
    currentLocation: user.currentLocation || '',
    height: user.height ? String(user.height) : '',
  });

  const [optional, setOptional] = useState({
    maxDistanceKm: String(prefs?.maxDistanceKm || '50'),
    minAge: String(prefs?.minAge || '18'),
    maxAge: String(prefs?.maxAge || '40'),
    relationshipType: user.relationshipType || 'MONOGAMOUS',
    wantsKids: user.wantsKids || 'OPEN',
    smoking: user.smokingStatus || 'NEVER',
    drinking: user.drinkingStatus || 'SOCIALLY',
    religion: user.religion || 'SPIRITUAL',
    starSign: user.starSign || 'LEO',
  });

  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    user.interests && user.interests.length > 0
      ? user.interests.map((i) => {
          for (const [k, v] of Object.entries(INTEREST_ENUM_MAP)) {
            if (v === i) return k;
          }
          return i;
        })
      : ['Travel', 'Fitness', 'Coffee']
  );

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    user.languages && user.languages.length > 0 ? user.languages : ['ENGLISH']
  );

  useEffect(() => {
    if (!user) return;
    if (!initialUserLoadedRef.current || user.id !== lastUserIdRef.current) {
      initialUserLoadedRef.current = true;
      lastUserIdRef.current = user.id;

      setPhotos(
        user.pictures && user.pictures.length > 0
          ? user.pictures
          : user.photos && user.photos.length > 0
          ? user.photos
          : []
      );
      setAudioPromptKey(user.audioPrompt || '');
      setPromptsList((user.prompts as any) || []);
      setGender(user.gender || 'MALE');
      setInterestedInGenders(
        user.interestedIn && user.interestedIn.length > 0
          ? user.interestedIn
          : prefs?.genders && prefs.genders.length > 0
          ? prefs.genders
          : ['FEMALE']
      );

      setBasic({
        displayName: user.displayName || user.name || '',
        bio: user.bio || '',
        age: String(user.age || '25'),
        work: user.work || '',
        education: user.education || '',
        hometown: user.hometown || '',
        currentLocation: user.currentLocation || '',
        height: user.height ? String(user.height) : '',
      });

      setOptional({
        maxDistanceKm: String(prefs?.maxDistanceKm || '50'),
        minAge: String(prefs?.minAge || '18'),
        maxAge: String(prefs?.maxAge || '40'),
        relationshipType: user.relationshipType || 'MONOGAMOUS',
        wantsKids: user.wantsKids || 'OPEN',
        smoking: user.smokingStatus || 'NEVER',
        drinking: user.drinkingStatus || 'SOCIALLY',
        religion: user.religion || 'SPIRITUAL',
        starSign: user.starSign || 'LEO',
      });

      if (user.interests && user.interests.length > 0) {
        setSelectedInterests(
          user.interests.map((i) => {
            for (const [k, v] of Object.entries(INTEREST_ENUM_MAP)) {
              if (v === i) return k;
            }
            return i;
          })
        );
      }

      if (user.languages && user.languages.length > 0) {
        setSelectedLanguages(user.languages);
      }
    }
  }, [prefs, user]);

  const toggleInterestedIn = (val: string) => {
    setInterestedInGenders((prev) =>
      prev.includes(val) ? (prev.length > 1 ? prev.filter((g) => g !== val) : prev) : [...prev, val]
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

  const addPrompt = () => {
    if (!newPromptAnswer.trim()) {
      showToast('Please enter an answer for your prompt.', 'error');
      return;
    }
    setPromptsList((prev) => [
      ...prev.filter((p) => p.promptId !== newPromptId),
      { promptId: newPromptId, answer: newPromptAnswer.trim() },
    ]);
    setNewPromptAnswer('');
    showToast('Prompt added!', 'success');
  };

  const removePrompt = (promptId: string) => {
    setPromptsList((prev) => prev.filter((p) => p.promptId !== promptId));
  };

  const numberOrUndefined = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const key = await ProfileApi.uploadMedia(user.id, file);

      const updatedPhotos = [...photos, key];
      setPhotos(updatedPhotos);
      await ProfileApi.upsert(user.id, { pictures: updatedPhotos });
      if (user) {
        // New media triggers asynchronous moderation server-side. Reflect that honestly rather than
        // showing an approved (or stale) badge: mark the new key PENDING and escalate the overall
        // status. The real per-field verdict replaces this on the next profile fetch.
        const nextFieldStatus = { ...(user.fieldModerationStatus || {}), [key]: 'PENDING' };
        setCurrentUser({
          ...user,
          pictures: updatedPhotos,
          photos: updatedPhotos,
          fieldModerationStatus: nextFieldStatus,
          moderationStatus: 'PENDING_MEDIA',
        });
      }
      showToast('Photo uploaded — screening for safety…', 'success');
    } catch (err: any) {
      console.error('Photo upload error:', err);
      showToast(err?.message || 'Failed to upload photo.', 'error');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async (index: number) => {
    const updatedPhotos = photos.filter((_, i) => i !== index);
    setPhotos(updatedPhotos);
    try {
      await ProfileApi.upsert(user.id, { pictures: updatedPhotos });
      if (user) {
        setCurrentUser({ ...user, pictures: updatedPhotos, photos: updatedPhotos });
      }
      showToast('Photo removed.', 'success');
    } catch {
      showToast('Could not remove photo.', 'error');
    }
  };

  const handleAudioBlobUpload = async (file: Blob) => {
    setUploadingAudio(true);
    try {
      const localUrl = URL.createObjectURL(file);
      setAudioPreviewUrl(localUrl);

      const key = await ProfileApi.uploadMedia(user.id, file);

      setAudioPromptKey(key);
      await ProfileApi.upsert(user.id, { audioPrompt: key });
      if (user) {
        // New media triggers asynchronous moderation server-side. Reflect that honestly rather than
        // showing an approved (or stale) badge: mark the new key PENDING and escalate the overall
        // status. The real per-field verdict replaces this on the next profile fetch.
        const nextFieldStatus = {
          ...(user.fieldModerationStatus || {}),
          [key]: 'PENDING',
          audioPrompt: 'PENDING',
        };
        setCurrentUser({
          ...user,
          audioPrompt: key,
          fieldModerationStatus: nextFieldStatus,
          moderationStatus: 'PENDING_MEDIA',
        });
      }
      showToast('Voice note uploaded — screening for safety…', 'success');
    } catch (err: any) {
      console.error('Audio upload error:', err);
      showToast(err?.message || 'Failed to upload voice note.', 'error');
    } finally {
      setUploadingAudio(false);
      setShowAudioRecorder(false);
    }
  };

  const handleRemoveAudio = async () => {
    const oldKey = audioPromptKey || user.audioPrompt;
    setAudioPromptKey('');
    setAudioPreviewUrl('');
    try {
      // Send an explicit empty string (NOT undefined). The profile update is a null-coalescing
      // merge server-side: an omitted/undefined field means "keep existing", so `undefined` here
      // would silently NOT delete the voice note. A blank string is the backend's "clear" signal —
      // it drops the audioPrompt attribute and deletes the S3 object as an orphan.
      await ProfileApi.upsert(user.id, { audioPrompt: '' });
      if (user) {
        const nextFieldStatus = { ...(user.fieldModerationStatus || {}) };
        delete nextFieldStatus.audioPrompt;
        if (oldKey) delete nextFieldStatus[oldKey];
        setCurrentUser({
          ...user,
          audioPrompt: undefined,
          fieldModerationStatus: nextFieldStatus,
        });
      }
      showToast('Voice note removed.', 'success');
    } catch {
      showToast('Could not remove voice note.', 'error');
    }
  };

  
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setPlaybackProgress(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const formatSavedTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds === Infinity) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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

  const setPrimaryPhoto = (index: number) => {
    if (index === 0 || index >= photos.length) return;
    const updatedPhotos = [...photos];
    const [selected] = updatedPhotos.splice(index, 1);
    updatedPhotos.unshift(selected);
    setPhotos(updatedPhotos);
    ProfileApi.upsert(user.id, { pictures: updatedPhotos }).catch(() => {});
    if (user) {
      setCurrentUser({ ...user, pictures: updatedPhotos, photos: updatedPhotos });
    }
  };

  const cyclePrimaryPhoto = () => {
    if (photos.length <= 1) {
      fileInputRef.current?.click();
      return;
    }
    const updatedPhotos = [...photos];
    const first = updatedPhotos.shift();
    if (first) updatedPhotos.push(first);
    setPhotos(updatedPhotos);
    ProfileApi.upsert(user.id, { pictures: updatedPhotos }).catch(() => {});
    if (user) {
      setCurrentUser({ ...user, pictures: updatedPhotos, photos: updatedPhotos });
    }
  };

  const handleSaveMatchingDetails = async () => {
    setSavingProfile(true);

    const finalInterests = selectedInterests.map(
      (i) => INTEREST_ENUM_MAP[i] || i.toUpperCase().replace(/[\s&-]+/g, '_')
    );
    const finalLanguages = selectedLanguages.map((l) => l.toUpperCase().replace(/[\s&-]+/g, '_'));

    const trimmedDisplayName = basic.displayName.trim();
    const trimmedBio = basic.bio.trim();
    const trimmedWork = basic.work.trim();
    const trimmedEducation = basic.education.trim();
    const trimmedHometown = basic.hometown.trim();
    const trimmedLocation = basic.currentLocation.trim();

    const profilePayload: Record<string, unknown> = {
      displayName: trimmedDisplayName,
      bio: trimmedBio,
      age: numberOrUndefined(basic.age) || 18,
      gender: gender || 'MALE',
      interestedIn: interestedInGenders.length > 0 ? interestedInGenders : ['FEMALE'],
      pictures: photos,
      // Send the actual key, or an explicit blank string to CLEAR it. `|| undefined` would omit the
      // field and the null-coalescing merge would keep a previously-removed voice note (see
      // handleRemoveAudio) — a blank string is the backend's "delete this" signal.
      audioPrompt: audioPromptKey,
      prompts: promptsList.length > 0 ? promptsList : undefined,
      work: trimmedWork || undefined,
      education: trimmedEducation || undefined,
      hometown: trimmedHometown || undefined,
      currentLocation: trimmedLocation || undefined,
      height: numberOrUndefined(basic.height),
      relationshipType: optional.relationshipType || undefined,
      wantsKids: optional.wantsKids || undefined,
      smokingStatus: optional.smoking || undefined,
      drinkingStatus: optional.drinking || undefined,
      religion: optional.religion || undefined,
      starSign: optional.starSign || undefined,
      interests: finalInterests.length > 0 ? finalInterests : undefined,
      languages: finalLanguages.length > 0 ? finalLanguages : undefined,
    };

    // Detect moderated text changes to show optimistic 'PENDING' (Under Review) status immediately
    const nextFieldStatus: Record<string, string> = { ...(user?.fieldModerationStatus || {}) };
    let anyTextChanged = false;

    const checkFieldChanged = (key: string, newVal: string, oldVal?: string) => {
      if (newVal !== (oldVal || '').trim()) {
        nextFieldStatus[key] = 'PENDING';
        anyTextChanged = true;
      }
    };

    checkFieldChanged('displayName', trimmedDisplayName, user?.displayName || user?.name);
    checkFieldChanged('bio', trimmedBio, user?.bio);
    checkFieldChanged('work', trimmedWork, user?.work);
    checkFieldChanged('education', trimmedEducation, user?.education);
    checkFieldChanged('hometown', trimmedHometown, user?.hometown);
    checkFieldChanged('currentLocation', trimmedLocation, user?.currentLocation);

    const oldPromptsJson = JSON.stringify(user?.prompts || []);
    const newPromptsJson = JSON.stringify(promptsList || []);
    if (oldPromptsJson !== newPromptsJson) {
      promptsList.forEach((p, idx) => {
        nextFieldStatus['prompt:' + p.promptId] = 'PENDING';
        nextFieldStatus['prompt:' + idx] = 'PENDING';
      });
      anyTextChanged = true;
    }

    let anyMediaChanged = false;
    if (audioPromptKey !== (user?.audioPrompt || '')) {
      if (audioPromptKey) {
        nextFieldStatus['audioPrompt'] = 'PENDING';
        nextFieldStatus[audioPromptKey] = 'PENDING';
        anyMediaChanged = true;
      }
    }

    // --- Optimistic UI update: update the store and show success IMMEDIATELY ---
    // The user sees "Under Review" badges and the success toast right away, without
    // waiting for the network round-trip to complete.
    if (user) {
      setCurrentUser({
        ...user,
        name: trimmedDisplayName,
        displayName: trimmedDisplayName,
        bio: trimmedBio,
        age: numberOrUndefined(basic.age) || 18,
        gender,
        interestedIn: interestedInGenders,
        pictures: photos,
        photos,
        audioPrompt: audioPromptKey,
        prompts: promptsList,
        work: trimmedWork || undefined,
        education: trimmedEducation || undefined,
        hometown: trimmedHometown || undefined,
        currentLocation: trimmedLocation || undefined,
        height: numberOrUndefined(basic.height),
        relationshipType: optional.relationshipType,
        wantsKids: optional.wantsKids,
        smokingStatus: optional.smoking,
        drinkingStatus: optional.drinking,
        religion: optional.religion,
        starSign: optional.starSign,
        interests: finalInterests,
        languages: finalLanguages,
        fieldModerationStatus: nextFieldStatus,
        moderationStatus: anyMediaChanged
          ? anyTextChanged
            ? 'PENDING_REVIEW'
            : 'PENDING_MEDIA'
          : anyTextChanged
          ? user.moderationStatus === 'APPROVED' || !user.moderationStatus
            ? 'PENDING_TEXT'
            : 'PENDING_REVIEW'
          : user.moderationStatus,
      });
    }

    showToast('Profile updated successfully!', 'success');
    setSavingProfile(false);

    // --- Fire API calls in the background (non-blocking) ---
    // Profile upsert and preferences save run asynchronously. Failures are logged
    // and surfaced via a toast but do NOT block the UI or revert form state.
    const targetPrefs = {
      maxDistanceKm: numberOrUndefined(optional.maxDistanceKm),
      minAge: numberOrUndefined(optional.minAge),
      maxAge: numberOrUndefined(optional.maxAge),
      genders: interestedInGenders,
    };

    const prefsChanged =
      targetPrefs.maxDistanceKm !== prefs?.maxDistanceKm ||
      targetPrefs.minAge !== prefs?.minAge ||
      targetPrefs.maxAge !== prefs?.maxAge ||
      JSON.stringify(targetPrefs.genders) !== JSON.stringify(prefs?.genders);

    ProfileApi.upsert(user.id, profilePayload).catch((err) => {
      console.error('Profile save failed:', err);
      showToast('Profile save failed — please try again.', 'error');
    });

    if (prefsChanged) {
      savePreferences(targetPrefs).catch((prefErr) => {
        console.warn('Preferences save failed:', prefErr);
      });
    }
  };

  const primaryPhoto = photos[0];

  const previewProfileData: DiscoveryProfileData = {
    id: user.id,
    name: basic.displayName || user.name || 'Anonymous',
    displayName: basic.displayName || user.name || 'Anonymous',
    age: basic.age ? Number(basic.age) : user.age || 25,
    bio: basic.bio || user.bio || '',
    work: basic.work || user.work || '',
    education: basic.education || user.education || '',
    hometown: basic.hometown || user.hometown || '',
    currentLocation: basic.currentLocation || user.currentLocation || '',
    location: basic.currentLocation || basic.hometown || 'Nearby',
    verified: Boolean(user.verified),
    photos: photos.length > 0 ? photos : user.photos || [],
    pictures: photos.length > 0 ? photos : user.pictures || [],
    audioPrompt: audioPromptKey || user.audioPrompt,
    prompts: promptsList,
    interests: selectedInterests,
    languages: selectedLanguages,
    relationshipType: optional.relationshipType,
    wantsKids: optional.wantsKids,
    smokingStatus: optional.smoking,
    drinkingStatus: optional.drinking,
    religion: optional.religion,
    starSign: optional.starSign,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-12 pb-24"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />
      

      <div className="bg-white border border-border p-8 md:p-12 space-y-10 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
          <div
            className="relative"
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = setTimeout(() => {
                setIsHoveringAvatar(true);
              }, 250);
            }}
            onMouseLeave={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = setTimeout(() => {
                setIsHoveringAvatar(false);
              }, 300);
            }}
          >
            <div
              onClick={() => {
                setIsHoveringAvatar(false);
                setShowFullPreview(true);
              }}
              className="relative w-32 h-40 border-2 border-border hover:border-accent overflow-hidden bg-black/5 shrink-0 group cursor-pointer transition-all shadow-sm"
              title="Click to preview how your profile appears on Discovery feed"
            >
              {primaryPhoto ? (
                <MediaImage
                  src={primaryPhoto}
                  alt={basic.displayName}
                  className="w-full h-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <span className="text-[10px] uppercase tracking-widest font-black">Upload</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white p-2 text-center">
                <Eye className="w-5 h-5 mb-1 text-green-400" />
                <span className="text-[9px] font-black uppercase tracking-widest leading-tight">
                  Preview Feed
                </span>
                <span className="text-[7px] opacity-80 uppercase tracking-wider mt-0.5 font-mono">
                  Click to open
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsHoveringAvatar(false);
                setShowFullPreview(true);
              }}
              className="mt-2 text-[9px] uppercase tracking-widest font-black text-accent/70 hover:text-accent flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Eye className="w-3 h-3 text-accent" /> Feed Preview
            </button>

            {/* Floating Live Preview on Hover */}
            <ProfilePreviewHoverCard
              isVisible={isHoveringAvatar && !showFullPreview}
              profileData={previewProfileData}
              onClickFullPreview={() => {
                setIsHoveringAvatar(false);
                setShowFullPreview(true);
              }}
            />
          </div>


          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl sm:text-4xl font-serif italic tracking-tighter uppercase text-foreground">
                {basic.displayName || 'Anonymous'}, {basic.age || '—'}
              </h2>
              {user.verified && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-700 text-[10px] font-black uppercase tracking-widest border border-green-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              )}
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-accent/10 text-accent">
                {tierLabel} Tier
              </span>
              <ModerationBadge
                status={effectiveModerationStatus}
                showLabel
                className="text-[10px] font-black uppercase tracking-widest px-3 py-1"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs opacity-60">
              {basic.work && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> {basic.work}
                </span>
              )}
              {basic.education && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" /> {basic.education}
                </span>
              )}
              {basic.hometown && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> {basic.hometown}
                </span>
              )}
            </div>

            {basic.bio && (
              <p className="text-sm opacity-70 leading-relaxed font-serif max-w-xl italic border-l-2 border-border pl-4">
                "{basic.bio}"
              </p>
            )}

            
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Photos Gallery ({photos.length}/6 Photos)
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto || photos.length >= 6}
              className="py-2 px-4 bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all flex items-center gap-1.5 shadow disabled:opacity-40"
            >
              {uploadingPhoto ? <LoadingSpinner /> : <Plus className="w-3.5 h-3.5" />} Add Photo
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {photos.map((photo, index) => (
              <div
                key={index}
                className="relative aspect-[3/4] border border-border overflow-hidden bg-black/5 group"
              >
                <MediaImage
                  src={photo}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <ModerationBadge
                  status={fieldStatus[photo]}
                  className="absolute top-2 left-2 z-10 shadow"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(index)}
                  className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-all shadow z-10"
                  title="Remove Photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {index === 0 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-accent text-white text-[9px] font-black uppercase tracking-widest shadow z-10 whitespace-nowrap">
                    Profile Pic
                  </div>
                )}
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setPrimaryPhoto(index)}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/70 hover:bg-accent text-white text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all shadow z-10 whitespace-nowrap"
                  >
                    Set Profile Pic
                  </button>
                )}
              </div>
            ))}
            {photos.length < 6 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="aspect-[3/4] border-2 border-dashed border-border hover:border-accent flex flex-col items-center justify-center gap-2 cursor-pointer text-muted-foreground p-4 text-center transition-all"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Add Photo</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Written Prompts ({promptsList.length} Prompts)
            </span>
            
          </div>

          <div className="space-y-3">
            {promptsList.map((p, index) => (
              <div
                key={p.promptId}
                className="p-4 border border-border bg-[#FAFAFA] flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                      {p.promptId}
                    </span>
                    <ModerationBadge
                      status={fieldStatus['prompt:' + p.promptId] || fieldStatus['prompt:' + index]}
                      showLabel
                    />
                  </div>
                  <p className="text-xs font-serif italic text-foreground leading-relaxed">
                    "{p.answer}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePrompt(p.promptId)}
                  className="text-muted-foreground hover:text-red-600 p-1"
                  title="Remove prompt"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-4 border border-border/70 bg-bg/20 space-y-3">
            <label className="text-[10px] uppercase tracking-widest font-black opacity-60 block">
              Add a Conversation Starter / Prompt
            </label>
            <select
              value={newPromptId}
              onChange={(e) => setNewPromptId(e.target.value)}
              className="field-input text-xs font-bold"
            >
              {PROMPT_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={newPromptAnswer}
                onChange={(e) => setNewPromptAnswer(e.target.value)}
                placeholder="Write your compelling answer..."
                className="field-input flex-1"
              />
              <button
                type="button"
                onClick={addPrompt}
                className="py-2 px-5 bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-all shadow"
              >
                Save
              </button>
            </div>
          </div>

        <div className="space-y-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
              <Mic className="w-4 h-4" /> What they want you to know in their voice
            </span>
            {!audioPromptKey && !showAudioRecorder && (
              <button
                type="button"
                onClick={() => setShowAudioRecorder(true)}
                className="py-2 px-4 border border-border hover:border-accent text-[10px] font-black uppercase tracking-widest text-foreground hover:text-accent transition-all flex items-center gap-1.5"
              >
                <Mic className="w-3.5 h-3.5" /> Add Voice Note
              </button>
            )}
          </div>

          {showAudioRecorder && (
            <AudioRecorder
              onSave={handleAudioBlobUpload}
              onCancel={() => setShowAudioRecorder(false)}
            />
          )}

          {uploadingAudio && (
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground p-4 bg-bg/20 border border-border">
              <LoadingSpinner /> Uploading voice note...
            </div>
          )}

          {audioPromptKey && !uploadingAudio && (
            <div className="p-4 border border-border bg-[#FAFAFA] flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow hover:bg-accent/90 shrink-0"
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-1" />}
                </button>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Voice Note
                      <ModerationBadge
                        status={
                          uploadingAudio
                            ? 'PENDING'
                            : fieldStatus.audioPrompt ||
                              (audioPromptKey ? fieldStatus[audioPromptKey] : undefined) ||
                              (user.audioPrompt ? fieldStatus[user.audioPrompt] : undefined) ||
                              (effectiveModerationStatus === 'APPROVED' ? 'APPROVED' : undefined)
                        }
                        showLabel
                      />
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatSavedTime(playbackProgress)} / {formatSavedTime(audioDuration)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-100 ease-linear" 
                      style={{ width: `${audioDuration > 0 ? (playbackProgress / audioDuration) * 100 : 0}%` }} 
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveAudio}
                className="text-muted-foreground hover:text-red-600 p-2 shrink-0 ml-4"
                title="Remove Voice Note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <audio
                ref={audioRef}
                src={audioPreviewUrl || resolvedAudioSrc}
                onTimeUpdate={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioLoadedMetadata}
                onEnded={() => { setIsPlayingAudio(false); setPlaybackProgress(0); }}
                className="hidden"
              />
            </div>
          )}
        </div>

        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 pt-6 border-t border-border">
          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
                Your Basics & Identity
              </div>
              <p className="mt-1 text-xs opacity-50 leading-relaxed">
                Core information visible on your discovery card.
              </p>
            </div>

            <Field
              label="Display Name *"
              badge={<ModerationBadge status={fieldStatus.displayName || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
            >
              <input
                value={basic.displayName}
                onChange={(e) => setBasic((prev) => ({ ...prev, displayName: e.target.value }))}
                className="field-input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Age *">
                <input
                  value={basic.age}
                  type="number"
                  min="18"
                  max="99"
                  onChange={(e) => setBasic((prev) => ({ ...prev, age: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Height (cm)">
                <input
                  value={basic.height}
                  type="number"
                  placeholder="e.g. 178"
                  onChange={(e) => setBasic((prev) => ({ ...prev, height: e.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40 block">
                Your Gender *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGender(g.value)}
                    className={`py-2.5 px-3 text-[10px] font-black uppercase tracking-widest border transition-all ${
                      gender === g.value
                        ? 'bg-accent text-white border-accent shadow-sm'
                        : 'border-border bg-white text-foreground hover:border-accent/40'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40 block">
                Interested In *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((g) => {
                  const active = interestedInGenders.includes(g.value);
                  return (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => toggleInterestedIn(g.value)}
                      className={`py-2.5 px-3 text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 ${
                        active
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'border-border bg-white text-foreground hover:border-accent/40'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field
              label="Bio / Story"
              badge={<ModerationBadge status={fieldStatus.bio || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
            >
              <textarea
                value={basic.bio}
                onChange={(e) => setBasic((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder="A glimpse into what makes you, you..."
                className="field-input min-h-24 resize-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Work / Job"
                badge={<ModerationBadge status={fieldStatus.work || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
              >
                <input
                  value={basic.work}
                  onChange={(e) => setBasic((prev) => ({ ...prev, work: e.target.value }))}
                  placeholder="e.g. Architect, Founder"
                  className="field-input"
                />
              </Field>
              <Field
                label="Education"
                badge={<ModerationBadge status={fieldStatus.education || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
              >
                <input
                  value={basic.education}
                  onChange={(e) => setBasic((prev) => ({ ...prev, education: e.target.value }))}
                  placeholder="e.g. Pratt Institute"
                  className="field-input"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Hometown"
                badge={<ModerationBadge status={fieldStatus.hometown || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
              >
                <input
                  value={basic.hometown}
                  onChange={(e) => setBasic((prev) => ({ ...prev, hometown: e.target.value }))}
                  placeholder="e.g. Mumbai, New York"
                  className="field-input"
                />
              </Field>
              <Field
                label="Current Location"
                badge={<ModerationBadge status={fieldStatus.currentLocation || (user.moderationStatus === 'APPROVED' ? 'APPROVED' : undefined)} showLabel />}
              >
                <input
                  value={basic.currentLocation}
                  onChange={(e) => setBasic((prev) => ({ ...prev, currentLocation: e.target.value }))}
                  placeholder="e.g. Bandra West, Mumbai"
                  className="field-input"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Lifestyle & Match Settings
              </div>
              <p className="mt-1 text-xs opacity-50 leading-relaxed">
                Refine your lifestyle values and discovery parameters.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Distance (km)">
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
              <Field label="Min Age">
                <input
                  value={optional.minAge}
                  type="number"
                  min="18"
                  onChange={(e) => setOptional((prev) => ({ ...prev, minAge: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Max Age">
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
              <Field label="Relationship Goal">
                <select
                  value={optional.relationshipType}
                  onChange={(e) =>
                    setOptional((prev) => ({ ...prev, relationshipType: e.target.value }))
                  }
                  className="field-input"
                >
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Kids / Family Plans">
                <select
                  value={optional.wantsKids}
                  onChange={(e) => setOptional((prev) => ({ ...prev, wantsKids: e.target.value }))}
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

            <div className="grid grid-cols-2 gap-4">
              <Field label="Smoking">
                <select
                  value={optional.smoking}
                  onChange={(e) => setOptional((prev) => ({ ...prev, smoking: e.target.value }))}
                  className="field-input"
                >
                  {SMOKING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Drinking">
                <select
                  value={optional.drinking}
                  onChange={(e) => setOptional((prev) => ({ ...prev, drinking: e.target.value }))}
                  className="field-input"
                >
                  {DRINKING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Religion / Philosophy">
                <select
                  value={optional.religion}
                  onChange={(e) => setOptional((prev) => ({ ...prev, religion: e.target.value }))}
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
                  value={optional.starSign}
                  onChange={(e) => setOptional((prev) => ({ ...prev, starSign: e.target.value }))}
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

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40 block">
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
                      className={`py-1.5 px-3 text-[10px] font-bold rounded-full border transition-all ${
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

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40 block">
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
                      className={`py-1.5 px-3 text-[10px] font-bold rounded-full border transition-all ${
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
          </section>
        </div>

        <div className="flex gap-6 pt-4 border-t border-border">
          <button
            onClick={handleSaveMatchingDetails}
            disabled={savingProfile}
            className="flex-1 py-5 bg-accent text-white text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.01] shadow-2xl transition-all disabled:opacity-40"
          >
            {savingProfile ? 'Saving Changes…' : 'Save Changes'}
          </button>
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

        <AccountSettingsCard />
        <DeviceManagementCard />
        <SetPasswordCard />

        <Suspense fallback={null}>
          <LivenessVerification userId={user.id} verified={Boolean(user.verified)} onVerified={onVerified} />
        </Suspense>
      </div>

      <ProfilePreviewModal
        isOpen={showFullPreview}
        onClose={() => setShowFullPreview(false)}
        profileData={previewProfileData}
      />
    </motion.div>
  );
}


function Field({ label, badge, children }: { label: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">{label}</span>
        {badge}
      </div>
      {children}
    </label>
  );
}
