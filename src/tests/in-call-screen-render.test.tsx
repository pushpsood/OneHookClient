import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InCallScreen } from '../components/call/InCallScreen';
import type { CallSessionState, ScreenShareState } from '../lib/call-session';

/**
 * Static render of the in-call surface (no DOM / effects): the self view is present from the first
 * frame of a video call (ringing included), mirrored for a user-facing camera, shows a camera-off icon
 * when the camera is off, carries its accessibility label + swap hint and its telemetry exemption;
 * the controls are translucent and float over a full-bleed video. Voice calls keep the in-flow bar.
 */

function fakeStream(opts: { video?: boolean; facingMode?: string } = {}): MediaStream {
  const videoTracks = opts.video
    ? [{ kind: 'video', getSettings: () => (opts.facingMode ? { facingMode: opts.facingMode } : {}) }]
    : [];
  return {
    getVideoTracks: () => videoTracks,
    getAudioTracks: () => [{ kind: 'audio' }],
    getTracks: () => [...videoTracks, { kind: 'audio' }],
  } as unknown as MediaStream;
}

function render(
  overrides: Partial<{
    media: 'AUDIO' | 'VIDEO';
    state: CallSessionState;
    localStream: MediaStream | null;
    cameraOff: boolean;
    screenShareState: ScreenShareState;
    screenStream: MediaStream | null;
  }> = {}
) {
  const handlers = {
    onToggleMute: vi.fn(),
    onToggleCamera: vi.fn(),
    onStartScreenShare: vi.fn(),
    onStopScreenShare: vi.fn(),
    onAcceptScreenShare: vi.fn(),
    onDeclineScreenShare: vi.fn(),
    onEnableCaptions: vi.fn(),
    onDisableCaptions: vi.fn(),
    onSelectCaptionLanguage: vi.fn(),
    onHangup: vi.fn(),
  };
  const html = renderToStaticMarkup(
    <InCallScreen
      peerName="Asha"
      media={overrides.media ?? 'VIDEO'}
      state={overrides.state ?? 'ringing'}
      localStream={overrides.localStream === undefined ? fakeStream({ video: true, facingMode: 'user' }) : overrides.localStream}
      remoteStream={null}
      screenStream={overrides.screenStream ?? null}
      sas={null}
      muted={false}
      cameraOff={overrides.cameraOff ?? false}
      canSendScreen={false}
      screenShareState={overrides.screenShareState ?? 'none'}
      screenRequest={null}
      captions={null}
      captionsSupported={false}
      {...handlers}
    />
  );
  return { html, handlers };
}

/** The opening tag + content of the small window button. */
function pipMarkup(html: string): string {
  const pipStart = html.indexOf('data-testid="call-pip"');
  expect(pipStart).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<button', pipStart);
  return html.slice(open, html.indexOf('</button>', pipStart) + '</button>'.length);
}

function openingTag(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
}

describe('InCallScreen — self view', () => {
  it.each<CallSessionState>(['idle', 'ringing', 'connecting', 'connected'])(
    'shows my mirrored camera in the small window while %s',
    (state) => {
      const pip = pipMarkup(render({ state }).html);
      expect(pip).toContain('aria-label="Your video"');
      expect(pip).toContain('data-pip-corner="top-trailing"');
      expect(pip).toContain('data-pip-feed="self"');
      expect(pip).toMatch(/<video[^>]*class="[^"]*-scale-x-100/);
      expect(pip).toMatch(/<video[^>]*autoplay/i);
      expect(pip).toMatch(/<video[^>]*playsinline/i);
    }
  );

  it('keeps the peer placeholder (initial, name, status) in the big area before their video arrives', () => {
    const { html } = render({ state: 'ringing' });
    expect(openingTag(html, 'call-stage')).toContain('data-big-feed="peer"');
    expect(html).toContain('Asha');
    expect(html).toContain('Ringing…');
  });

  it('does not mirror a rear (environment) camera', () => {
    const pip = pipMarkup(render({ localStream: fakeStream({ video: true, facingMode: 'environment' }) }).html);
    expect(pip).toContain('<video');
    expect(pip).not.toContain('-scale-x-100');
  });

  it('shows a camera-off icon instead of video when my camera is off', () => {
    const pip = pipMarkup(render({ cameraOff: true }).html);
    expect(pip).not.toContain('<video');
    expect(pip).toContain('data-testid="pip-camera-off"');
  });

  it('is present (an empty tile) even before the camera has started', () => {
    const pip = pipMarkup(render({ localStream: null }).html);
    expect(pip).not.toContain('<video');
    expect(pip).not.toContain('pip-camera-off');
  });

  it('has the accessibility hint and the drag telemetry exemption', () => {
    const pip = pipMarkup(render().html);
    expect(pip).toContain('Double-tap to swap');
    expect(pip).toMatch(/aria-describedby="[^"]+"/);
    expect(pip).toMatch(/data-track-exempt="continuous: [^"]*call\.video_swap/);
    expect(pip).toContain('touch-none');
    // About 100x150, rounded, thin border; the snap animation respects reduced motion.
    expect(pip).toContain('width:100px;height:150px');
    expect(pip).toContain('rounded-xl');
    expect(pip).toContain('border-white/30');
    expect(pip).toContain('motion-reduce:transition-none');
  });

  it('does not offer a swap while a shared screen owns the big area', () => {
    const { html } = render({ state: 'connected', screenShareState: 'receiving', screenStream: fakeStream({ video: true }) });
    expect(openingTag(html, 'call-stage')).toContain('data-big-feed="share"');
    const pip = pipMarkup(html);
    expect(pip).toContain('data-pip-feed="self"');
    expect(pip).not.toContain('Double-tap to swap');
    expect(pip).not.toContain('aria-describedby');
  });
});

describe('InCallScreen — controls', () => {
  it('video: translucent, blurred, floating over a full-bleed stage, shown at first', () => {
    const { html } = render({ state: 'connected' });
    const controls = openingTag(html, 'call-controls');
    expect(controls).toContain('bg-black/40');
    expect(controls).toContain('backdrop-blur-md');
    expect(controls).toContain('absolute inset-x-0 bottom-0');
    expect(controls).toContain('env(safe-area-inset-bottom)');
    expect(controls).not.toContain('pointer-events-none');
    expect(controls).toContain('motion-reduce:transition-none');
    expect(openingTag(html, 'call-stage')).toContain('absolute inset-0');
    expect(html).toContain('data-controls-visible="true"');
  });

  it('keeps >= 44px touch targets (48px buttons)', () => {
    const { html } = render({ state: 'connected' });
    expect(html).toMatch(/aria-label="Mute microphone"[^>]*class="w-12 h-12/);
    expect(html).toMatch(/class="w-12 h-12[^"]*"[^>]*aria-label="Hang up"/);
  });

  it('the stage tap is exempted with the controls-toggle telemetry reason', () => {
    const stage = openingTag(render().html, 'call-stage');
    expect(stage).toMatch(/data-track-exempt="duplicate: [^"]*call\.controls_toggle/);
  });

  it('voice calls are unchanged: no small window, in-flow controls', () => {
    const { html } = render({ media: 'AUDIO', localStream: fakeStream() });
    expect(html).not.toContain('data-testid="call-pip"');
    const controls = openingTag(html, 'call-controls');
    expect(controls).toContain('shrink-0');
    expect(controls).not.toContain('absolute');
    expect(openingTag(html, 'call-stage')).toContain('flex-1');
  });
});
