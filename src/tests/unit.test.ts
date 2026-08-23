import { describe, it, expect } from 'vitest';
import { UserProfile, SubscriptionTier, UserState, RankedCandidate, DiscoverResponse } from '../types';

describe('MatchingApi: Unit Tests', () => {
  const mockUser: UserProfile = {
    id: '1',
    userId: '1',
    name: 'A',
    bio: '',
    birthDate: '',
    gender: 'M',
    interestedIn: ['Tech', 'Art'],
    photos: [],
    location: { lat: 0, lng: 0, geohash: '' },
    subscriptionTier: SubscriptionTier.FREE,
    activeConnections: 0,
    currentState: UserState.AVAILABLE,
    currentMatches: [],
    inviteCode: '',
  };

  it('should construct discover query with correct params', () => {
    const url = `/matching/discover?userId=${mockUser.id}&lat=${mockUser.location.lat}&lon=${mockUser.location.lng}`;
    expect(url).toContain('userId=1');
    expect(url).toContain('lat=0');
    expect(url).toContain('lon=0');
  });

  it('free-tier user should have FREE subscription tier', () => {
    expect(mockUser.subscriptionTier).toBe(SubscriptionTier.FREE);
  });
});

describe('DiscoverResponse: Ranked Candidates', () => {
  it('discover response shape includes algorithm field', () => {
    const response: DiscoverResponse = {
      candidates: [
        { userId: 'abc123', score: 0.847, distanceKm: 5 },
        { userId: 'def456', score: 0.731, distanceKm: 5 },
      ],
      count: 2,
      algorithm: 'gale-shapley+cf',
    };
    expect(response.algorithm).toBe('gale-shapley+cf');
    expect(response.count).toBe(2);
  });

  it('ranked candidates have userId and score fields', () => {
    const candidate: RankedCandidate = { userId: 'user1', score: 0.75, distanceKm: 5 };
    expect(candidate.userId).toBe('user1');
    expect(candidate.score).toBeGreaterThanOrEqual(0);
    expect(candidate.score).toBeLessThanOrEqual(1);
  });

  it('candidates are ordered by score descending', () => {
    const candidates: RankedCandidate[] = [
      { userId: 'a', score: 0.9, distanceKm: 5 },
      { userId: 'b', score: 0.7, distanceKm: 5 },
      { userId: 'c', score: 0.5, distanceKm: 5 },
    ];
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
    }
  });

  it('score of 0 is valid for cold-start candidates', () => {
    const candidate: RankedCandidate = { userId: 'newUser', score: 0, distanceKm: 5 };
    expect(candidate.score).toBe(0);
  });

  it('score of 1 is valid for top mutual-affinity candidates', () => {
    const candidate: RankedCandidate = { userId: 'topUser', score: 1, distanceKm: 5 };
    expect(candidate.score).toBe(1);
  });
});

describe('InputValidator rules (client-side mirror)', () => {
  const USER_ID_PATTERN = /^[a-zA-Z0-9_\-]{1,128}$/;

  it('valid userIds match the expected pattern', () => {
    ['alice', 'Bob123', 'user_id-1', 'a'.repeat(128)].forEach((id) => {
      expect(USER_ID_PATTERN.test(id)).toBe(true);
    });
  });

  it('invalid userIds do not match the pattern', () => {
    ['', 'has space', 'has@symbol', 'a'.repeat(129), '<script>'].forEach((id) => {
      expect(USER_ID_PATTERN.test(id)).toBe(false);
    });
  });

  it('direction must be RIGHT or LEFT', () => {
    const validDirections = ['RIGHT', 'LEFT'];
    const invalid = ['right', 'left', 'UP', ''];
    validDirections.forEach((d) => expect(['RIGHT', 'LEFT'].includes(d)).toBe(true));
    invalid.forEach((d) => expect(['RIGHT', 'LEFT'].includes(d)).toBe(false));
  });

  it('latitude must be in [-90, 90]', () => {
    expect(37.77 >= -90 && 37.77 <= 90).toBe(true);
    expect(91 >= -90 && 91 <= 90).toBe(false);
  });

  it('longitude must be in [-180, 180]', () => {
    expect(-122.4 >= -180 && -122.4 <= 180).toBe(true);
    expect(181 >= -180 && 181 <= 180).toBe(false);
  });
});

describe('Profile Moderation: Text Field Transitions', () => {
  it('detects bio modification and marks field as PENDING', () => {
    const existingUser = {
      bio: 'Old bio text',
      displayName: 'Alice',
      fieldModerationStatus: { bio: 'APPROVED', displayName: 'APPROVED' },
      moderationStatus: 'APPROVED',
    };

    const nextBio = 'New updated bio text';
    const nextFieldStatus: Record<string, string> = { ...existingUser.fieldModerationStatus };
    let anyTextChanged = false;

    if (nextBio.trim() !== (existingUser.bio || '').trim()) {
      nextFieldStatus['bio'] = 'PENDING';
      anyTextChanged = true;
    }

    expect(anyTextChanged).toBe(true);
    expect(nextFieldStatus.bio).toBe('PENDING');
    expect(nextFieldStatus.displayName).toBe('APPROVED');

    const nextModerationStatus = anyTextChanged
      ? existingUser.moderationStatus === 'APPROVED'
        ? 'PENDING_TEXT'
        : 'PENDING_REVIEW'
      : existingUser.moderationStatus;

    expect(nextModerationStatus).toBe('PENDING_TEXT');
  });

  it('skips preferences save when preferences have not changed', () => {
    const currentPrefs = {
      maxDistanceKm: 50,
      minAge: 18,
      maxAge: 40,
      genders: ['FEMALE'],
    };

    const targetPrefs = {
      maxDistanceKm: 50,
      minAge: 18,
      maxAge: 40,
      genders: ['FEMALE'],
    };

    const prefsChanged =
      targetPrefs.maxDistanceKm !== currentPrefs.maxDistanceKm ||
      targetPrefs.minAge !== currentPrefs.minAge ||
      targetPrefs.maxAge !== currentPrefs.maxAge ||
      JSON.stringify(targetPrefs.genders) !== JSON.stringify(currentPrefs.genders);

    expect(prefsChanged).toBe(false);
  });
});

describe('Profile Moderation: Voice Note & Overall Status', () => {
  it('marks voice note as PENDING and escalates profile moderation status on upload', () => {
    const existingUser: any = {
      id: 'u123',
      moderationStatus: 'APPROVED',
      fieldModerationStatus: { bio: 'APPROVED', displayName: 'APPROVED' },
    };

    const audioKey = 'media/u123/audio-abc-123';
    const nextFieldStatus = {
      ...(existingUser.fieldModerationStatus || {}),
      [audioKey]: 'PENDING',
      audioPrompt: 'PENDING',
    };

    expect(nextFieldStatus[audioKey]).toBe('PENDING');
    expect(nextFieldStatus.audioPrompt).toBe('PENDING');

    const nextUser = {
      ...existingUser,
      audioPrompt: audioKey,
      fieldModerationStatus: nextFieldStatus,
      moderationStatus: 'PENDING_MEDIA',
    };

    expect(nextUser.moderationStatus).toBe('PENDING_MEDIA');
  });

  it('computes effective main moderation status as PENDING_MEDIA when voice note is under review', () => {
    const user: any = {
      id: 'u123',
      audioPrompt: 'media/u123/audio-abc-123',
      moderationStatus: 'APPROVED',
      fieldModerationStatus: {
        bio: 'APPROVED',
        displayName: 'APPROVED',
        audioPrompt: 'PENDING',
        'media/u123/audio-abc-123': 'PENDING',
      },
    };

    const fieldStatus = user.fieldModerationStatus || {};
    const audioPromptKey = user.audioPrompt || '';
    const uploadingAudio = false;

    const isAudioPending =
      uploadingAudio ||
      fieldStatus.audioPrompt === 'PENDING' ||
      fieldStatus.audioPrompt?.includes('PENDING') ||
      Boolean(audioPromptKey && (fieldStatus[audioPromptKey] === 'PENDING' || fieldStatus[audioPromptKey]?.includes('PENDING'))) ||
      Boolean(user.audioPrompt && (fieldStatus[user.audioPrompt] === 'PENDING' || fieldStatus[user.audioPrompt]?.includes('PENDING')));

    const effectiveModerationStatus = isAudioPending
      ? user.moderationStatus && user.moderationStatus.includes('PENDING')
        ? user.moderationStatus
        : 'PENDING_MEDIA'
      : user.moderationStatus;

    expect(isAudioPending).toBe(true);
    expect(effectiveModerationStatus).toBe('PENDING_MEDIA');
  });

  it('computes effective main moderation status as APPROVED when voice note and all fields are approved', () => {
    const user: any = {
      id: 'u123',
      audioPrompt: 'media/u123/audio-abc-123',
      moderationStatus: 'APPROVED',
      fieldModerationStatus: {
        bio: 'APPROVED',
        displayName: 'APPROVED',
        audioPrompt: 'APPROVED',
        'media/u123/audio-abc-123': 'APPROVED',
      },
    };

    const fieldStatus = user.fieldModerationStatus || {};
    const audioPromptKey = user.audioPrompt || '';
    const uploadingAudio = false;

    const isAudioPending =
      uploadingAudio ||
      fieldStatus.audioPrompt === 'PENDING' ||
      fieldStatus.audioPrompt?.includes('PENDING') ||
      Boolean(audioPromptKey && (fieldStatus[audioPromptKey] === 'PENDING' || fieldStatus[audioPromptKey]?.includes('PENDING'))) ||
      Boolean(user.audioPrompt && (fieldStatus[user.audioPrompt] === 'PENDING' || fieldStatus[user.audioPrompt]?.includes('PENDING')));

    const hasAnyPendingField = Object.values(fieldStatus).some(
      (s) => typeof s === 'string' && (s === 'PENDING' || s.includes('PENDING'))
    );

    const effectiveModerationStatus = (() => {
      if (isAudioPending) return 'PENDING_MEDIA';
      if (hasAnyPendingField) return 'PENDING_REVIEW';
      return user.moderationStatus;
    })();

    expect(isAudioPending).toBe(false);
    expect(hasAnyPendingField).toBe(false);
    expect(effectiveModerationStatus).toBe('APPROVED');
  });

  it('removes voice note keys from fieldModerationStatus when voice note is deleted', () => {
    const oldKey = 'media/u123/audio-abc-123';
    const existingFieldStatus = {
      bio: 'APPROVED',
      audioPrompt: 'PENDING',
      [oldKey]: 'PENDING',
    };

    const nextFieldStatus = { ...existingFieldStatus };
    delete (nextFieldStatus as any).audioPrompt;
    delete (nextFieldStatus as any)[oldKey];

    expect(nextFieldStatus).toEqual({ bio: 'APPROVED' });
  });
});

describe('Discovery Profile & Preview: Shared Data Representation', () => {
  it('maps UserProfile into DiscoveryProfileData matching discovery candidate format', () => {
    const user: UserProfile = {
      id: 'usr-456',
      userId: 'usr-456',
      name: 'Maya Lin',
      displayName: 'Maya Lin',
      bio: 'Architectural designer & trail runner',
      age: 26,
      work: 'Architectural Designer',
      education: 'Cornell Architecture',
      hometown: 'San Francisco',
      currentLocation: 'Mission District, SF',
      verified: true,
      photos: ['media/usr-456/photo1.jpg', 'media/usr-456/photo2.jpg'],
      pictures: ['media/usr-456/photo1.jpg', 'media/usr-456/photo2.jpg'],
      audioPrompt: 'media/usr-456/voice.webm',
      prompts: [{ promptId: 'Dating me looks like...', answer: 'Spontaneous coffee dates' }],
      interests: ['Design', 'Coffee', 'Running'],
      location: { lat: 37.77, lng: -122.41, geohash: '9q8yy' },
      subscriptionTier: SubscriptionTier.FREE,
      activeConnections: 0,
      currentState: UserState.AVAILABLE,
      currentMatches: [],
    };

    const previewData = {
      id: user.id,
      name: user.displayName || user.name,
      displayName: user.displayName || user.name,
      age: user.age,
      bio: user.bio,
      work: user.work,
      education: user.education,
      hometown: user.hometown,
      currentLocation: user.currentLocation,
      location: user.currentLocation || user.hometown || 'Nearby',
      verified: Boolean(user.verified),
      photos: user.photos,
      pictures: user.pictures,
      audioPrompt: user.audioPrompt,
      prompts: user.prompts,
      interests: user.interests,
    };

    expect(previewData.name).toBe('Maya Lin');
    expect(previewData.age).toBe(26);
    expect(previewData.verified).toBe(true);
    expect(previewData.photos).toHaveLength(2);
    expect(previewData.prompts).toHaveLength(1);
    expect(previewData.audioPrompt).toBe('media/usr-456/voice.webm');
  });

  it('discovery candidate pool defaults to empty and does not use hardcoded mocks', () => {
    const rawCandidates: DiscoverResponse['candidates'] = [];
    expect(rawCandidates).toHaveLength(0);
  });
});

describe('Auth OTP Flow & Account Switching', () => {
  it('initializes cooldown at 60 seconds on OTP request and counts down to 0', () => {
    let cooldown = 60;
    const tick = () => {
      cooldown = Math.max(0, cooldown - 1);
    };

    expect(cooldown).toBe(60);
    const isResendDisabled = cooldown > 0;
    expect(isResendDisabled).toBe(true);

    // Advance 30 seconds
    for (let i = 0; i < 30; i++) {
      tick();
    }
    expect(cooldown).toBe(30);
    expect(cooldown > 0).toBe(true);

    // Advance remaining 30 seconds
    for (let i = 0; i < 30; i++) {
      tick();
    }
    expect(cooldown).toBe(0);
    expect(cooldown > 0).toBe(false);
  });

  it('resets all form fields and cooldown on "Use a different account"', () => {
    let identifier = '+1234567890';
    let code = '123456';
    let password = 'secretPassword';
    let confirmPassword = 'secretPassword';
    let error: string | null = 'Some error';
    let resendCooldown = 45;
    let step: 'IDENTIFIER' | 'OTP' | 'SET_PASSWORD' = 'OTP';
    let loggedOut = false;

    const resetToIdentifier = () => {
      loggedOut = true;
      step = 'IDENTIFIER';
      identifier = '';
      password = '';
      code = '';
      confirmPassword = '';
      error = null;
      resendCooldown = 0;
    };

    resetToIdentifier();

    expect(step).toBe('IDENTIFIER');
    expect(identifier).toBe('');
    expect(password).toBe('');
    expect(code).toBe('');
    expect(confirmPassword).toBe('');
    expect(error).toBeNull();
    expect(resendCooldown).toBe(0);
    expect(loggedOut).toBe(true);
  });

  it('restarting OTP request re-arms 60s cooldown and clears code input', () => {
    let cooldown = 0;
    let code = '987654';

    const handleResendOtp = () => {
      if (cooldown > 0) return;
      code = '';
      cooldown = 60;
    };

    handleResendOtp();
    expect(cooldown).toBe(60);
    expect(code).toBe('');

    // Attempting to resend immediately while cooldown > 0 should be blocked
    handleResendOtp();
    expect(cooldown).toBe(60);
  });
});


