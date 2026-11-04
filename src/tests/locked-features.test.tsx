import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CategorySelector } from '../features/discovery/DiscoveryView';
import { SuggestionsSection } from '../features/profile/CurrentSuggestionCard';

const render = (el: import('react').ReactElement) =>
  renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe('gated features stay visible, locked', () => {
  it('a free member sees every category; the Super ones carry a lock', () => {
    const html = render(<CategorySelector value="ALL" available={['ALL']} onChange={() => {}} />);
    for (const label of [
      'For you',
      'Matches your preferences',
      'Mr. OneHook picks',
      'Similar to your likes',
    ]) {
      expect(html).toContain(label);
    }
    expect((html.match(/data-locked="true"/g) || []).length).toBe(3);
    expect((html.match(/data-testid="lock-icon"/g) || []).length).toBe(3);
  });

  it('a Super member sees no locks', () => {
    const html = render(
      <CategorySelector
        value="ALL"
        available={['ALL', 'PROFILE_MATCH', 'ONEHOOK_SUGGESTED', 'SIMILAR']}
        onChange={() => {}}
      />
    );
    expect(html).not.toContain('data-locked');
  });

  it('suggestions show locked for a free member instead of disappearing', () => {
    const html = render(<SuggestionsSection paid={false} />);
    expect(html).toContain('suggestions-locked');
    expect(html).toContain('Tell OneHook who you&#x27;re looking for');
  });
});
