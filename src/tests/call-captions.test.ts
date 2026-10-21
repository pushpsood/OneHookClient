import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  baseLanguage,
  buildCaption,
  buildCapabilities,
  buildCaptionState,
  buildTranslateRequest,
  buildTranslateResponse,
  CAPTION_PROTOCOL_VERSION,
  CaptionSession,
  type CaptionEnginePorts,
  type CaptionUiState,
  type CaptionWireMessage,
  type DeviceAvailability,
  isCaptionWireType,
  isSameLanguage,
  parseCaptionWire,
  pickSourceLanguage,
  pickTargetLanguage,
  type RecognitionHandle,
  type RecognitionPort,
  selectRecognitionEngine,
  selectTranslationStrategy,
  type TranslatorHandle,
  type TranslatorPort,
  type LanguageDetectorPort,
} from '../lib/call-captions';

/**
 * Pure-protocol + engine-selection tests for on-device captions + translation
 * (OneHookBackend/docs/voice-video-calls.md §12). These run under Node with no DOM: every browser
 * engine is an injected fake. The HARD RULE — never a cloud recogniser or cloud translator (§12.2 /
 * §12.5) — is asserted two ways: (1) the pure selectors have no cloud branch, so an unavailable
 * device yields `unavailable`, never a remote fallback; (2) a source scan proves the modules never
 * reference a cloud engine and always set `processLocally = true`.
 */

// ── Wire protocol ───────────────────────────────────────────────────────────────────────────────

describe('caption wire protocol (§12.3)', () => {
  it('builders stamp the current type and version', () => {
    expect(buildCaption({ seq: 1, lang: 'en-IN', final: true, text: 'hi' })).toEqual({
      type: 'caption',
      v: CAPTION_PROTOCOL_VERSION,
      seq: 1,
      lang: 'en-IN',
      final: true,
      text: 'hi',
    });
    expect(buildCaptionState({ enabled: true, lang: 'en' })).toMatchObject({ type: 'caption.state', v: 1, enabled: true });
    expect(buildTranslateRequest('en')).toEqual({ type: 'translate.request', v: 1, targetLang: 'en' });
    expect(buildTranslateResponse(false, 'busy')).toEqual({ type: 'translate.response', v: 1, ok: false, reason: 'busy' });
    expect(buildCapabilities([{ source: 'ta', target: 'en' }])).toMatchObject({ type: 'capabilities', v: 1 });
  });

  it('recognises the caption-family control types', () => {
    for (const t of ['caption', 'caption.state', 'translate.request', 'translate.response', 'capabilities']) {
      expect(isCaptionWireType(t)).toBe(true);
    }
    for (const t of ['screen.request', 'screen.accept', 'capabilities ', 'offer', '', null, 42]) {
      expect(isCaptionWireType(t)).toBe(false);
    }
  });

  it('parses a valid caption and copies only known fields', () => {
    const parsed = parseCaptionWire(
      JSON.stringify({
        type: 'caption',
        v: 1,
        seq: 7,
        lang: 'ta-IN',
        final: true,
        text: 'vanakkam',
        tStartMs: 1234,
        tr: { lang: 'en', text: 'hello', engine: 'device' },
        attackerField: 'ignored',
      })
    );
    expect(parsed).toEqual({
      type: 'caption',
      v: 1,
      seq: 7,
      lang: 'ta-IN',
      final: true,
      text: 'vanakkam',
      tStartMs: 1234,
      tr: { lang: 'en', text: 'hello', engine: 'device' },
    });
    expect((parsed as unknown as Record<string, unknown>).attackerField).toBeUndefined();
  });

  it('parses caption.state / translate.* / capabilities', () => {
    expect(parseCaptionWire({ type: 'caption.state', v: 1, enabled: true, wantLang: 'en' })).toEqual({
      type: 'caption.state',
      v: 1,
      enabled: true,
      wantLang: 'en',
    });
    expect(parseCaptionWire({ type: 'caption.state', v: 1, wantLang: null })).toEqual({
      type: 'caption.state',
      v: 1,
      wantLang: null,
    });
    expect(parseCaptionWire({ type: 'translate.request', v: 1, targetLang: 'en' })).toEqual({
      type: 'translate.request',
      v: 1,
      targetLang: 'en',
    });
    expect(parseCaptionWire({ type: 'translate.response', v: 1, ok: true })).toEqual({
      type: 'translate.response',
      v: 1,
      ok: true,
    });
    expect(
      parseCaptionWire({ type: 'capabilities', v: 1, translatePairs: [{ source: 'ta', target: 'en' }, { bad: 1 }] })
    ).toEqual({ type: 'capabilities', v: 1, translatePairs: [{ source: 'ta', target: 'en' }] });
  });

  it('rejects wrong version, unknown type, bad JSON and missing required fields', () => {
    expect(parseCaptionWire('{ not json')).toBeNull();
    expect(parseCaptionWire(null)).toBeNull();
    expect(parseCaptionWire({ type: 'caption', v: 2, seq: 1, lang: 'en', final: true, text: 'x' })).toBeNull();
    expect(parseCaptionWire({ type: 'screen.request', v: 1 })).toBeNull();
    expect(parseCaptionWire({ type: 'caption', v: 1, seq: 'x', lang: 'en', final: true, text: 'x' })).toBeNull();
    expect(parseCaptionWire({ type: 'caption', v: 1, seq: 1, lang: 'en', final: 'yes', text: 'x' })).toBeNull();
    expect(parseCaptionWire({ type: 'translate.request', v: 1, targetLang: '' })).toBeNull();
    expect(parseCaptionWire({ type: 'translate.response', v: 1 })).toBeNull();
  });
});

// ── Language helpers (D12) ────────────────────────────────────────────────────────────────────────

describe('language helpers (D12)', () => {
  it('reduces to the base subtag', () => {
    expect(baseLanguage('en-IN')).toBe('en');
    expect(baseLanguage('ZH-Hant-TW')).toBe('zh');
    expect(baseLanguage(null)).toBe('');
  });

  it('compares languages by base subtag', () => {
    expect(isSameLanguage('en-IN', 'en-US')).toBe(true);
    expect(isSameLanguage('ta', 'en')).toBe(false);
    expect(isSameLanguage('', 'en')).toBe(false);
  });

  it('auto-detects source, falling back only when detection is unavailable', () => {
    expect(pickSourceLanguage('ta-IN', 'en-US')).toBe('ta-IN');
    expect(pickSourceLanguage(null, 'en-US')).toBe('en-US');
    expect(pickSourceLanguage('', 'en-US')).toBe('en-US');
  });

  it('defaults the target to the device locale, honouring an in-call override', () => {
    expect(pickTargetLanguage('en-US')).toBe('en-US');
    expect(pickTargetLanguage('en-US', 'hi-IN')).toBe('hi-IN');
    expect(pickTargetLanguage('en-US', null)).toBe('en-US');
  });
});

// ── Recognition engine selection (§12.2) ────────────────────────────────────────────────────────────

describe('selectRecognitionEngine — on-device only (§12.2)', () => {
  it('is unavailable when the browser has no local recogniser', () => {
    const d = selectRecognitionEngine({ supported: false, availability: 'available' });
    expect(d).toEqual({ status: 'unavailable', reason: 'Not supported on this device' });
  });

  it('is ready (processLocally) when the pack is installed', () => {
    const d = selectRecognitionEngine({ supported: true, availability: 'available' });
    expect(d).toEqual({ status: 'ready', processLocally: true });
  });

  it('offers install / installing without leaving on-device', () => {
    expect(selectRecognitionEngine({ supported: true, availability: 'downloadable' })).toMatchObject({
      status: 'needs-install',
      processLocally: true,
    });
    expect(selectRecognitionEngine({ supported: true, availability: 'downloading' })).toMatchObject({
      status: 'installing',
      processLocally: true,
    });
  });

  it('NEVER selects a cloud recogniser: every non-unavailable result is processLocally:true', () => {
    const availabilities: DeviceAvailability[] = ['available', 'downloadable', 'downloading', 'unavailable'];
    for (const supported of [true, false]) {
      for (const availability of availabilities) {
        const d = selectRecognitionEngine({ supported, availability });
        if (d.status === 'unavailable') {
          expect(d).not.toHaveProperty('processLocally', false);
        } else {
          expect(d.processLocally).toBe(true);
        }
        // There is no "cloud" status in the union at all.
        expect(['ready', 'needs-install', 'installing', 'unavailable']).toContain(d.status);
      }
    }
  });
});

// ── Translation strategy selection (§12.5) ──────────────────────────────────────────────────────────

describe('selectTranslationStrategy — receiver-first, sender fallback, never cloud (§12.5)', () => {
  const base = {
    sourceLang: 'ta-IN',
    targetLang: 'en-US' as string | null,
    translatorSupported: true,
    receiverAvailability: 'available' as DeviceAvailability,
    senderHelpEnabled: false,
    senderCanTranslate: false,
  };

  it('is none when there is no target or the caption is already in the target language', () => {
    expect(selectTranslationStrategy({ ...base, targetLang: null })).toEqual({ mode: 'none' });
    expect(selectTranslationStrategy({ ...base, sourceLang: 'en-IN', targetLang: 'en-US' })).toEqual({ mode: 'none' });
  });

  it('translates on the receiver when the pair is available locally', () => {
    expect(selectTranslationStrategy(base)).toEqual({ mode: 'receiver' });
  });

  it('still routes to the receiver with a needed download', () => {
    expect(selectTranslationStrategy({ ...base, receiverAvailability: 'downloadable' })).toEqual({
      mode: 'receiver',
      needsInstall: true,
    });
    expect(selectTranslationStrategy({ ...base, receiverAvailability: 'downloading' })).toEqual({
      mode: 'receiver',
      needsInstall: true,
    });
  });

  it('falls back to the sender only when the speaker opted in AND can do the pair (D13)', () => {
    expect(
      selectTranslationStrategy({
        ...base,
        receiverAvailability: 'unavailable',
        senderHelpEnabled: true,
        senderCanTranslate: true,
      })
    ).toEqual({ mode: 'sender' });
  });

  it('is unavailable (original shown) when neither device can translate — NO cloud fallback', () => {
    expect(selectTranslationStrategy({ ...base, receiverAvailability: 'unavailable' })).toMatchObject({
      mode: 'unavailable',
    });
    // Sender opted in but cannot do the pair.
    expect(
      selectTranslationStrategy({
        ...base,
        receiverAvailability: 'unavailable',
        senderHelpEnabled: true,
        senderCanTranslate: false,
      })
    ).toMatchObject({ mode: 'unavailable' });
    // Translator API entirely absent and no sender help → unavailable, never a remote call.
    expect(
      selectTranslationStrategy({ ...base, translatorSupported: false, receiverAvailability: 'unavailable' })
    ).toMatchObject({ mode: 'unavailable' });
  });

  it('only ever returns one of the four on-device modes (no cloud mode exists)', () => {
    const avail: DeviceAvailability[] = ['available', 'downloadable', 'downloading', 'unavailable'];
    for (const supported of [true, false]) {
      for (const receiverAvailability of avail) {
        for (const senderHelpEnabled of [true, false]) {
          for (const senderCanTranslate of [true, false]) {
            const d = selectTranslationStrategy({
              ...base,
              translatorSupported: supported,
              receiverAvailability,
              senderHelpEnabled,
              senderCanTranslate,
            });
            expect(['none', 'receiver', 'sender', 'unavailable']).toContain(d.mode);
          }
        }
      }
    }
  });
});

// ── CaptionSession orchestration (DOM-free, injected fake engines) ───────────────────────────────────

class FakeRecognition implements RecognitionPort {
  availabilityValue: DeviceAvailability = 'available';
  segment?: (s: { text: string; final: boolean }) => void;
  stopped = false;
  installCalls = 0;
  async availability(): Promise<DeviceAvailability> {
    return this.availabilityValue;
  }
  async install(): Promise<DeviceAvailability> {
    this.installCalls += 1;
    this.availabilityValue = 'available';
    return this.availabilityValue;
  }
  async start(opts: {
    lang: string;
    onSegment(s: { text: string; final: boolean }): void;
    onError(e: Error): void;
  }): Promise<RecognitionHandle> {
    this.segment = opts.onSegment;
    return {
      stop: () => {
        this.stopped = true;
      },
    };
  }
}

class FakeTranslator implements TranslatorPort {
  availabilityValue: DeviceAvailability = 'available';
  translateCalls: Array<{ source: string; target: string; text: string }> = [];
  async availability(): Promise<DeviceAvailability> {
    return this.availabilityValue;
  }
  async create(source: string, target: string): Promise<TranslatorHandle> {
    return {
      translate: async (text: string) => {
        this.translateCalls.push({ source, target, text });
        return `[${target}] ${text}`;
      },
    };
  }
}

const detectorFor = (lang: string | null): LanguageDetectorPort => ({
  availability: async () => (lang ? 'available' : 'unavailable'),
  detect: async () => lang,
});

/** Flush all pending microtasks (recognition → detect → translate are chained awaits). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeSession(opts: {
  ports: CaptionEnginePorts;
  helpTranslateCaptions?: boolean;
  deviceLanguage?: string;
  initialTargetLang?: string;
}) {
  const sent: CaptionWireMessage[] = [];
  let state: CaptionUiState | null = null;
  const session = new CaptionSession({
    ports: opts.ports,
    send: (m) => sent.push(m),
    onChange: (s) => {
      state = s;
    },
    deviceLanguage: opts.deviceLanguage ?? 'en-US',
    helpTranslateCaptions: opts.helpTranslateCaptions ?? false,
    initialTargetLang: opts.initialTargetLang,
  });
  return { session, sent, getState: () => state };
}

describe('CaptionSession — local captioning (§12.1)', () => {
  it('starts on-device recognition and sends caption.state + caption segments', async () => {
    const recognition = new FakeRecognition();
    const detector = detectorFor('en-US');
    const { session, sent } = makeSession({ ports: { recognition, translator: null, detector } });

    await session.enableLocalCaptions();
    expect(sent.find((m) => m.type === 'caption.state' && m.enabled === true)).toBeDefined();

    recognition.segment!({ text: 'hello there', final: true });
    await flush();

    const caption = sent.find((m) => m.type === 'caption' && m.final) as Extract<CaptionWireMessage, { type: 'caption' }>;
    expect(caption).toBeDefined();
    expect(caption.text).toBe('hello there');
    expect(caption.lang).toBe('en-US');
  });

  it('installs the language pack when the pack is downloadable, then starts', async () => {
    const recognition = new FakeRecognition();
    recognition.availabilityValue = 'downloadable';
    const { session } = makeSession({ ports: { recognition, translator: null, detector: null } });
    await session.enableLocalCaptions();
    expect(recognition.installCalls).toBe(1);
    expect(session.getState().localEnabled).toBe(true);
  });

  it('cannot enable when there is no on-device recogniser (disabled with a reason)', async () => {
    const { session } = makeSession({ ports: { recognition: null, translator: null, detector: null } });
    await session.refreshAvailability();
    const state = session.getState();
    expect(state.localAvailable).toBe(false);
    expect(state.localUnavailableReason).toBe('Not supported on this device');
    await session.enableLocalCaptions();
    expect(session.getState().localEnabled).toBe(false);
  });
});

describe('CaptionSession — receiver translation (§12.5)', () => {
  it('translates the peer caption on-device into the viewer target language', async () => {
    const translator = new FakeTranslator();
    const { session, getState } = makeSession({
      ports: { recognition: null, translator, detector: null },
      initialTargetLang: 'en-US',
    });

    await session.handleWire(buildCaption({ seq: 1, lang: 'ta-IN', final: true, text: 'vanakkam' }));

    const line = getState()!.lines.find((l) => l.source === 'remote');
    expect(line?.translationState).toBe('done');
    expect(line?.translatedText).toBe('[en] vanakkam');
    expect(translator.translateCalls).toEqual([{ source: 'ta', target: 'en', text: 'vanakkam' }]);
  });

  it('shows the original (never a cloud call) and asks the sender when the receiver cannot translate', async () => {
    const translator = new FakeTranslator();
    translator.availabilityValue = 'unavailable';
    const { session, sent, getState } = makeSession({
      ports: { recognition: null, translator, detector: null },
      initialTargetLang: 'en-US',
    });

    await session.handleWire(buildCaption({ seq: 1, lang: 'ta-IN', final: true, text: 'vanakkam' }));
    // No on-device receiver translation happened.
    expect(translator.translateCalls).toEqual([]);
    const line = getState()!.lines.find((l) => l.source === 'remote');
    expect(line?.translationState).toBe('pending');
    // It asked the sender to help (§12.5) rather than reaching any cloud service.
    expect(sent.find((m) => m.type === 'translate.request')).toMatchObject({ targetLang: 'en-US' });

    // The sender refuses → the viewer sees the original with "unavailable".
    await session.handleWire(buildTranslateResponse(false, 'help-disabled'));
    expect(getState()!.lines.find((l) => l.source === 'remote')?.translationState).toBe('unavailable');
  });

  it('uses the sender-attached translation (tr) without a local translator', async () => {
    const { session, getState } = makeSession({
      ports: { recognition: null, translator: null, detector: null },
      initialTargetLang: 'en-US',
    });
    await session.handleWire(
      buildCaption({ seq: 1, lang: 'ta-IN', final: true, text: 'vanakkam', tr: { lang: 'en', text: 'hello', engine: 'device' } })
    );
    const line = getState()!.lines.find((l) => l.source === 'remote');
    expect(line?.translationState).toBe('done');
    expect(line?.translatedText).toBe('hello');
  });
});

describe('CaptionSession — sender fallback (D13)', () => {
  it('declines the sender fallback when "Help translate my captions" is off', async () => {
    const translator = new FakeTranslator();
    const { session, sent } = makeSession({
      ports: { recognition: null, translator, detector: null },
      helpTranslateCaptions: false,
    });
    await session.handleWire(buildTranslateRequest('en'));
    expect(sent.find((m) => m.type === 'translate.response')).toMatchObject({ ok: false, reason: 'help-disabled' });
  });

  it('accepts and attaches tr to its own final captions when help is on and the pair is supported', async () => {
    const recognition = new FakeRecognition();
    const translator = new FakeTranslator();
    const { session, sent } = makeSession({
      ports: { recognition, translator, detector: detectorFor('ta-IN') },
      helpTranslateCaptions: true,
      deviceLanguage: 'ta-IN',
    });

    await session.enableLocalCaptions();
    await session.handleWire(buildTranslateRequest('en'));
    expect(sent.find((m) => m.type === 'translate.response')).toMatchObject({ ok: true });

    recognition.segment!({ text: 'vanakkam', final: true });
    await flush();

    const caption = sent
      .filter((m): m is Extract<CaptionWireMessage, { type: 'caption' }> => m.type === 'caption' && m.final)
      .pop();
    expect(caption?.tr).toMatchObject({ lang: 'en', engine: 'device' });
    expect(caption?.tr?.text).toBe('[en] vanakkam');
  });
});

describe('CaptionSession — ephemeral (D9)', () => {
  it('drops all caption lines on dispose and stops recognition', async () => {
    const recognition = new FakeRecognition();
    const { session, getState } = makeSession({ ports: { recognition, translator: null, detector: null } });
    await session.enableLocalCaptions();
    await session.handleWire(buildCaption({ seq: 1, lang: 'en', final: true, text: 'hi' }));
    expect(getState()!.lines.length).toBeGreaterThan(0);

    session.dispose();
    expect(recognition.stopped).toBe(true);
    // A disposed session emits no further state and holds no caption text.
    const before = getState();
    await session.handleWire(buildCaption({ seq: 2, lang: 'en', final: true, text: 'again' }));
    expect(getState()).toBe(before);
  });
});

// ── No-cloud source guard (§12.2 / §12.5 HARD RULE) ─────────────────────────────────────────────────

describe('no cloud recogniser / translator anywhere in the caption code', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const captionsSrc = read('../lib/call-captions.ts');
  const webSrc = read('../lib/call-captions-web.ts');

  it('never references a cloud speech/translation service', () => {
    const forbidden = [
      /Amazon\s*Transcribe/i,
      /Amazon\s*Translate/i,
      /Google\s*Cloud\s*Translation/i,
      /translation\.googleapis/i,
      /speech\.googleapis/i,
      /cognitiveservices/i, // Azure Speech
      /transcribe\.[a-z0-9-]+\.amazonaws/i,
    ];
    for (const src of [captionsSrc, webSrc]) {
      for (const pattern of forbidden) {
        expect(pattern.test(src)).toBe(false);
      }
    }
  });

  it('the web recogniser is only ever constructed with processLocally = true', () => {
    // The adapter sets processLocally true and never false.
    expect(/processLocally\s*=\s*true/.test(webSrc)).toBe(true);
    expect(/processLocally\s*[:=]\s*false/.test(webSrc)).toBe(false);
    // The on-device availability check is gated on processLocally: true.
    expect(/processLocally:\s*true/.test(webSrc)).toBe(true);
  });
});
