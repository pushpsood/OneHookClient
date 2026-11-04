import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchHighlightCards } from '../features/discovery/MatchHighlightCards';

describe('MatchHighlightCards', () => {
  it('renders nothing when there are no reasons', () => {
    expect(renderToStaticMarkup(<MatchHighlightCards highlights={[]} />)).toBe('');
    expect(renderToStaticMarkup(<MatchHighlightCards highlights={undefined} />)).toBe('');
  });
  it('renders one swipeable card per reason, in order', () => {
    const html = renderToStaticMarkup(
      <MatchHighlightCards
        highlights={
          [
            {
              source: 'KUNDALI',
              label: 'Kundali',
              verdict: 'EXCELLENT',
              reason: 'Your Kundalis score 33 of 36 gunas',
            },
            {
              source: 'MR_ONEHOOK',
              label: 'Mr. OneHook',
              verdict: 'GOOD',
              reason: 'Matches what you asked for',
            },
          ] as any
        }
      />
    );
    expect(html).toContain('Why we matched you');
    expect(html).toContain('1 / 2');
    expect(html.indexOf('Kundali')).toBeLessThan(html.indexOf('Mr. OneHook'));
    expect(html).toContain('Excellent match');
    expect(html).toContain('Good match');
    expect((html.match(/data-source=/g) || []).length).toBe(2);
  });
});
