import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  BirthDetails,
  ChatProfileUpdateRequest,
  MatchingProfileUpdateRequest,
} from 'onehook-api-client';

const sdk = vi.hoisted(() => ({
  upsertChatProfile: vi.fn(),
  upsertMatchingProfile: vi.fn(),
}));
vi.mock('../api/sdk-client', () => ({ sdkClient: sdk }));

import {
  birthTimePlacePayload,
  birthTimePlaceUpdate,
  fromApiBirthTimePlace,
  sameTimePlace,
} from '../components/onboarding/BirthTimePlaceFields';
import { ProfileApi } from '../api/profile';
import { toUserProfile } from '../lib/profile-model';

/**
 * Birth time and birthplace belong to the MATCHING profile only (`birthTimePlace` on
 * `PUT /profile/matching`); the chat profile carries only the birth date.
 */
const SRC = new URL('../', import.meta.url).pathname;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(readFileSync(join(SRC, rel), 'utf8'));

beforeEach(() => {
  sdk.upsertChatProfile.mockReset();
  sdk.upsertMatchingProfile.mockReset();
});

describe('the birthTimePlace payload', () => {
  it('is {} when nothing is set (which clears the stored value)', () => {
    expect(birthTimePlacePayload({})).toEqual({});
  });

  it('a birth time always carries a time zone', () => {
    expect(birthTimePlacePayload({ time: '08:30', timeZone: 'Asia/Kolkata' })).toEqual({
      time: '08:30',
      timeZone: 'Asia/Kolkata',
    });
    expect(birthTimePlacePayload({ time: '08:30' }).timeZone).toBeTruthy();
  });

  it('a place carries both coordinates and its label, never one coordinate or a bare label', () => {
    expect(
      birthTimePlacePayload({ latitude: 30.91, longitude: 75.85, placeName: 'Ludhiana', timeZone: 'Asia/Kolkata' })
    ).toEqual({ latitude: 30.91, longitude: 75.85, placeName: 'Ludhiana', timeZone: 'Asia/Kolkata' });
    const half = birthTimePlacePayload({ latitude: 30.91, placeName: 'Ludhiana' });
    expect(half).not.toHaveProperty('latitude');
    expect(half).not.toHaveProperty('placeName');
  });

  it('carries no birth date', () => {
    expect(birthTimePlacePayload({ time: '08:30', timeZone: 'UTC' })).not.toHaveProperty('date');
  });

  it('reads the stored value, nulls as unset', () => {
    expect(fromApiBirthTimePlace(undefined)).toEqual({});
    expect(
      fromApiBirthTimePlace({ time: '08:30', timeZone: 'UTC', placeName: null as unknown as undefined })
    ).toMatchObject({ time: '08:30', timeZone: 'UTC', placeName: undefined });
  });

  it('detects changes, including a relabelled place', () => {
    expect(sameTimePlace({ time: '08:30' }, { time: '08:30' })).toBe(true);
    expect(sameTimePlace({ time: '08:30' }, { time: '09:30' })).toBe(false);
    expect(sameTimePlace({ placeName: 'A' }, { placeName: 'B' })).toBe(false);
  });
});

describe('the matching request carries birthTimePlace', () => {
  const stored = { time: '08:30', timeZone: 'Asia/Kolkata', latitude: 30.91, longitude: 75.85, placeName: 'Ludhiana' };

  it('omits it when unchanged (the server keeps what is stored)', () => {
    expect(birthTimePlaceUpdate(fromApiBirthTimePlace(stored), stored)).toEqual({});
    expect(birthTimePlaceUpdate({}, undefined)).toEqual({});
  });

  it('sends the whole new value when changed', () => {
    expect(birthTimePlaceUpdate({ ...stored, time: '09:15' }, stored)).toEqual({
      birthTimePlace: { ...stored, time: '09:15' },
    });
    expect(birthTimePlaceUpdate({ time: '07:00', timeZone: 'UTC' }, undefined)).toEqual({
      birthTimePlace: { time: '07:00', timeZone: 'UTC' },
    });
  });

  it('sends {} when the member clears it', () => {
    expect(birthTimePlaceUpdate({}, stored)).toEqual({ birthTimePlace: {} });
  });

  it('PUT /profile/matching passes birthTimePlace through', async () => {
    sdk.upsertMatchingProfile.mockResolvedValue({ status: 'DRAFT' });
    await ProfileApi.upsertMatching({ bio: 'b', ...birthTimePlaceUpdate({}, stored) });
    expect(sdk.upsertMatchingProfile).toHaveBeenCalledWith({ bio: 'b', birthTimePlace: {} });
  });

  it('the matching editor spreads it into the request it saves', () => {
    const view = code('features/profile/ProfileView.tsx');
    expect(view).toContain('birthTimePlaceUpdate(birthTimePlace, user.birthTimePlace)');
    expect(view).toMatch(/const profilePayload[\s\S]*?\.\.\.birthTimePlaceEdit,[\s\S]*?saveMatching\(profilePayload\)/);
    expect(view).toContain('<BirthTimePlaceFields value={birthTimePlace} onChange={setBirthTimePlace} surface="profile" />');
  });

  it('the owner reads it from the matching profile, not the chat profile', () => {
    const me = toUserProfile({
      chat: { userId: 'me', displayName: 'Asha', birthDetails: { date: '1990-05-17' } },
      matching: { userId: 'me', status: 'DRAFT', birthTimePlace: stored },
    });
    expect(me.birthTimePlace).toEqual(stored);
    expect(me.birthDetails).toEqual({ date: '1990-05-17' });
    expect(toUserProfile({ chat: { userId: 'me', birthDetails: { date: '1990-05-17' } } }).birthTimePlace).toBeUndefined();
  });
});

describe('chat requests never carry birth time or place', () => {
  it('the chat profile types have only the date (checked by tsc in npm run lint)', () => {
    // @ts-expect-error birth time is not part of the chat profile's birthDetails
    const withTime: BirthDetails = { date: '1990-05-17', time: '08:30' };
    // @ts-expect-error nor is the birthplace
    const withPlace: ChatProfileUpdateRequest = { birthDetails: { date: '1990-05-17', latitude: 1 } };
    const matching: MatchingProfileUpdateRequest = { birthTimePlace: { time: '08:30', timeZone: 'UTC' } };
    expect([withTime, withPlace, matching]).toHaveLength(3);
  });

  it('the chat profile card and onboarding send only { date }', () => {
    for (const rel of ['features/profile/ChatProfileCard.tsx', 'components/onboarding/OnboardingWizard.tsx']) {
      const src = code(rel);
      expect(src, rel).toContain('upsertChat(');
      for (const field of ['BirthTimePlace', 'birthTimePlace', 'timeZone', 'latitude', 'longitude', 'placeName']) {
        expect(src, `${rel} mentions ${field}`).not.toContain(field);
      }
      expect(src, rel).not.toMatch(/birthDetails\?*\.time\b/);
    }
    expect(code('features/profile/ChatProfileCard.tsx')).toContain('realDobReady ? { date: realDob } : undefined');
  });

  it('PUT /profile/chat sends the date alone', async () => {
    await ProfileApi.upsertChat({ displayName: 'A', birthDetails: { date: '1990-05-17' } });
    expect(sdk.upsertChatProfile).toHaveBeenCalledWith({ displayName: 'A', birthDetails: { date: '1990-05-17' } });
  });
});
