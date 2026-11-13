import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// No network in render tests: effects never run under server rendering.
vi.mock('../api/sdk-client', () => ({ sdkClient: {} }));

import { ToastProvider } from '../components/common/Toast';
import { ChatProfileCard } from '../features/profile/ChatProfileCard';
import { ProfileView } from '../features/profile/ProfileView';
import type { UserProfile } from '../types';

/** Birth time and place are asked for in the matching profile editor only, never in the chat profile. */
const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ToastProvider>{el}</ToastProvider>
    </MemoryRouter>
  );

const COPY =
  'Optional. Your birth time and place only refine traditional compatibility (for example Kundali). ' +
  'They&#x27;re never shown to anyone, and they&#x27;re erased if you turn matching off.';

const stored = { time: '08:30', timeZone: 'Asia/Kolkata', latitude: 30.91, longitude: 75.85, placeName: 'Ludhiana' };

const me = (over: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'me',
  id: 'me',
  name: 'Asha',
  displayName: 'Asha',
  photos: [],
  age: 35,
  birthDetails: { date: '1990-05-17' },
  birthDateOnFile: true,
  ...over,
});

describe('chat profile card', () => {
  it('has no birth time or place fields, even when the matching profile stores them', () => {
    const html = render(<ChatProfileCard user={me({ matchingStatus: 'DRAFT', birthTimePlace: stored })} />);
    expect(html).toContain('Your chat profile');
    for (const text of ['Birth time', 'Birthplace', 'birth-time', 'birth-place', 'birth-zone', 'Ludhiana', 'Kundali']) {
      expect(html).not.toContain(text);
    }
  });

  it('a provisional date still offers the one-time real date, and nothing else about birth', () => {
    const html = render(<ChatProfileCard user={me({ birthDetails: { date: '2000-01-01', provisional: true } })} />);
    expect(html).not.toContain('Birth time');
    expect(html).not.toContain('Birthplace');
  });
});

describe('matching profile editor', () => {
  it('has the optional "Birth time and place" section with the spec copy, prefilled from the matching profile', () => {
    const html = render(<ProfileView user={me({ matchingStatus: 'DRAFT', birthTimePlace: stored })} />);
    expect(html).toContain('Birth time and place');
    expect(html).toContain(COPY);
    expect(html).toMatch(/id="birth-time"[^>]*value="08:30"/);
    expect(html).toMatch(/id="birth-place"[^>]*value="Ludhiana"/);
    expect(html).toContain('30.91, 75.85');
    expect(html).toMatch(/<option value="Asia\/Kolkata" selected="">/);
  });

  it('its controls record profile_edit.choice_select, never the onboarding element or a value', () => {
    const html = render(<ProfileView user={me({ matchingStatus: 'DRAFT', birthTimePlace: stored })} />);
    expect(html).toMatch(/aria-label="Clear birthplace"[^>]*data-track-id="profile_edit\.choice_select"/);
    expect(html).not.toContain('onboarding.choice_select');
    expect(html).not.toMatch(/data-track-[a-z-]+="[^"]*(08:30|Ludhiana|Asia\/Kolkata)/);
  });

  it('the matching builder (no matching profile yet) shows the section empty', () => {
    const html = render(<ProfileView user={me()} openMatchingBuilder />);
    expect(html).toContain('Birth time and place');
    expect(html).toMatch(/id="birth-time"[^>]*value=""/);
  });

  it('a chat-only member who is not building a matching profile is not asked', () => {
    const html = render(<ProfileView user={me()} />);
    expect(html).not.toContain('Birth time and place');
    expect(html).not.toContain('id="birth-time"');
  });
});
