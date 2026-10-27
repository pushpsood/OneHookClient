import { describe, it, expect } from 'vitest';
import { birthDetailsPayload, sameTimePlace } from '../components/onboarding/BirthTimePlaceFields';

describe('birth time and place payload', () => {
  it('sends only the date when nothing optional is set', () => {
    expect(birthDetailsPayload('1990-05-17', {})).toEqual({ date: '1990-05-17' });
  });
  it('a birth time always carries a time zone', () => {
    const p = birthDetailsPayload('1990-05-17', { time: '08:30', timeZone: 'Asia/Kolkata' });
    expect(p).toEqual({ date: '1990-05-17', time: '08:30', timeZone: 'Asia/Kolkata' });
    expect(birthDetailsPayload('1990-05-17', { time: '08:30' }).timeZone).toBeTruthy();
  });
  it('a place carries coordinates and its label, never coordinates alone without both', () => {
    const p = birthDetailsPayload('1990-05-17', {
      latitude: 30.91,
      longitude: 75.85,
      placeName: 'Ludhiana',
      timeZone: 'Asia/Kolkata',
    });
    expect(p).toMatchObject({ latitude: 30.91, longitude: 75.85, placeName: 'Ludhiana' });
    expect(birthDetailsPayload('1990-05-17', { latitude: 30.91 })).not.toHaveProperty('latitude');
  });
  it('detects changes', () => {
    expect(sameTimePlace({ time: '08:30' }, { time: '08:30' })).toBe(true);
    expect(sameTimePlace({ time: '08:30' }, { time: '09:30' })).toBe(false);
  });
});
