/**
 * On-device live captions + translation for 1:1 calls — the PURE protocol, engine-selection and
 * orchestration layer of OneHookBackend/docs/voice-video-calls.md §12.
 *
 * This module is deliberately free of DOM, WebRTC and network dependencies. Everything that touches a
 * browser API (the Web Speech `SpeechRecognition` recogniser, the built-in `Translator` and
 * `LanguageDetector`) is reached ONLY through the injected {@link CaptionEnginePorts}, so the whole
 * machine is unit-testable under Node and the concrete web engines live in `call-captions-web.ts`.
 *
 * HARD RULES this module encodes (§12.2 / §12.5, and decisions D9, D12, D13):
 *   - **On-device only, NEVER a cloud recogniser or cloud translator.** {@link selectRecognitionEngine}
 *     and {@link selectTranslationStrategy} have no "cloud" branch by construction: when the device
 *     cannot run recognition/translation locally the result is `unavailable`, never a remote fallback.
 *     The ports are documented to feature-detect the LOCAL engine only.
 *   - **Ephemeral (D9).** Captions live only in {@link CaptionUiState.lines}, in memory, for the life
 *     of the call. Nothing here persists, logs or transmits caption text anywhere except the E2EE
 *     `control` data channel to the one peer (via the injected {@link CaptionSessionConfig.send}).
 *   - **Auto-detected source language (D12).** The speaker's language is detected on final segments
 *     via the detector port; only if detection is unavailable do we fall back to the device language.
 *     The viewer's target language defaults to the device locale and is changeable in-call.
 *   - **Sender-side fallback is opt-in (D13).** We only translate our OWN captions for a peer when the
 *     local user has turned on "Help translate my captions" (`helpTranslateCaptions`).
 *
 * The on-wire shape is the §12.3 `control`-channel format. Unknown fields/types are ignored, matching
 * the attachment/call-signal envelopes — do not rename a field without changing the doc and the other
 * clients.
 */

/** The only caption-protocol version this build produces and reads. */
export const CAPTION_PROTOCOL_VERSION = 1;

/** Partials are throttled to at most 4/s (§12.3). */
export const CAPTION_PARTIAL_MIN_INTERVAL_MS = 250;

/** How many caption lines are retained in memory for the scrollable panel (ephemeral, D9). */
export const CAPTION_MAX_LINES = 200;

// ── Wire format (§12.3) ──────────────────────────────────────────────────────────────────────────

/** The caption-family message types that travel over the `control` data channel. */
export type CaptionWireType =
  | 'caption'
  | 'caption.state'
  | 'translate.request'
  | 'translate.response'
  | 'capabilities';

const CAPTION_WIRE_TYPES: readonly CaptionWireType[] = [
  'caption',
  'caption.state',
  'translate.request',
  'translate.response',
  'capabilities',
];

/** A single translation carried alongside a caption (sender-side fallback, §12.5). */
export interface CaptionTranslation {
  lang: string;
  text: string;
  /** Always `device` — a cloud engine is never used, so this is the only value we ever emit. */
  engine: string;
}

/** `caption`: one partial (replaces the line with the same `seq`) or final caption segment. */
export interface CaptionMessage {
  type: 'caption';
  v: number;
  seq: number;
  lang: string;
  final: boolean;
  text: string;
  tStartMs?: number;
  tr?: CaptionTranslation;
}

/** `caption.state`: "Captions on" indicator (`enabled`/`lang`) and the viewer's `wantLang`. */
export interface CaptionStateMessage {
  type: 'caption.state';
  v: number;
  enabled?: boolean;
  lang?: string | null;
  wantLang?: string | null;
}

/** `translate.request` (viewer → speaker): "please translate your captions to `targetLang`". */
export interface TranslateRequestMessage {
  type: 'translate.request';
  v: number;
  targetLang: string;
}

/** `translate.response` (speaker → viewer): whether the sender fallback will run. */
export interface TranslateResponseMessage {
  type: 'translate.response';
  v: number;
  ok: boolean;
  reason?: string;
}

/** `capabilities`: the language pairs this device can translate on-device (may be empty / unknown). */
export interface CaptionCapabilitiesMessage {
  type: 'capabilities';
  v: number;
  translatePairs: TranslatePair[];
}

/** One translatable language pair advertised in `capabilities.translatePairs`. */
export interface TranslatePair {
  source: string;
  target: string;
}

export type CaptionWireMessage =
  | CaptionMessage
  | CaptionStateMessage
  | TranslateRequestMessage
  | TranslateResponseMessage
  | CaptionCapabilitiesMessage;

// ── Builders (always stamp the current protocol version) ───────────────────────────────────────────

export function buildCaption(input: Omit<CaptionMessage, 'type' | 'v'>): CaptionMessage {
  return { type: 'caption', v: CAPTION_PROTOCOL_VERSION, ...input };
}

export function buildCaptionState(input: Omit<CaptionStateMessage, 'type' | 'v'>): CaptionStateMessage {
  return { type: 'caption.state', v: CAPTION_PROTOCOL_VERSION, ...input };
}

export function buildTranslateRequest(targetLang: string): TranslateRequestMessage {
  return { type: 'translate.request', v: CAPTION_PROTOCOL_VERSION, targetLang };
}

export function buildTranslateResponse(ok: boolean, reason?: string): TranslateResponseMessage {
  const message: TranslateResponseMessage = { type: 'translate.response', v: CAPTION_PROTOCOL_VERSION, ok };
  if (reason) message.reason = reason;
  return message;
}

export function buildCapabilities(translatePairs: TranslatePair[]): CaptionCapabilitiesMessage {
  return { type: 'capabilities', v: CAPTION_PROTOCOL_VERSION, translatePairs };
}

/** True when a `control` message type belongs to the caption family (vs screen-share / other). */
export function isCaptionWireType(type: unknown): type is CaptionWireType {
  return typeof type === 'string' && (CAPTION_WIRE_TYPES as readonly string[]).includes(type);
}

/**
 * Parses + validates a caption-family `control` message. Accepts either a JSON string or an already
 * parsed object (the control channel delivers strings; tests pass objects). Returns `null` — never
 * throws — for anything that is not a valid caption message for this protocol version, so a junk or
 * future-version frame is dropped quietly. Only known fields are copied, so an unknown future field
 * is never trusted or echoed.
 */
export function parseCaptionWire(raw: unknown): CaptionWireMessage | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isCaptionWireType(record.type)) return null;
  if (record.v !== CAPTION_PROTOCOL_VERSION) return null;

  switch (record.type) {
    case 'caption': {
      if (typeof record.seq !== 'number') return null;
      if (typeof record.lang !== 'string') return null;
      if (typeof record.final !== 'boolean') return null;
      if (typeof record.text !== 'string') return null;
      const message: CaptionMessage = {
        type: 'caption',
        v: CAPTION_PROTOCOL_VERSION,
        seq: record.seq,
        lang: record.lang,
        final: record.final,
        text: record.text,
      };
      if (typeof record.tStartMs === 'number') message.tStartMs = record.tStartMs;
      const tr = record.tr;
      if (tr !== null && typeof tr === 'object') {
        const trRecord = tr as Record<string, unknown>;
        if (typeof trRecord.lang === 'string' && typeof trRecord.text === 'string') {
          message.tr = {
            lang: trRecord.lang,
            text: trRecord.text,
            engine: typeof trRecord.engine === 'string' ? trRecord.engine : 'device',
          };
        }
      }
      return message;
    }
    case 'caption.state': {
      const message: CaptionStateMessage = { type: 'caption.state', v: CAPTION_PROTOCOL_VERSION };
      if (typeof record.enabled === 'boolean') message.enabled = record.enabled;
      if (typeof record.lang === 'string' || record.lang === null) message.lang = record.lang as string | null;
      if (typeof record.wantLang === 'string' || record.wantLang === null) {
        message.wantLang = record.wantLang as string | null;
      }
      return message;
    }
    case 'translate.request': {
      if (typeof record.targetLang !== 'string' || record.targetLang.length === 0) return null;
      return { type: 'translate.request', v: CAPTION_PROTOCOL_VERSION, targetLang: record.targetLang };
    }
    case 'translate.response': {
      if (typeof record.ok !== 'boolean') return null;
      const message: TranslateResponseMessage = { type: 'translate.response', v: CAPTION_PROTOCOL_VERSION, ok: record.ok };
      if (typeof record.reason === 'string') message.reason = record.reason;
      return message;
    }
    case 'capabilities': {
      const pairs: TranslatePair[] = Array.isArray(record.translatePairs)
        ? record.translatePairs
            .filter((p): p is Record<string, unknown> => p !== null && typeof p === 'object')
            .filter((p) => typeof p.source === 'string' && typeof p.target === 'string')
            .map((p) => ({ source: p.source as string, target: p.target as string }))
        : [];
      return { type: 'capabilities', v: CAPTION_PROTOCOL_VERSION, translatePairs: pairs };
    }
    default:
      return null;
  }
}

// ── Language helpers (§12 / D12) ────────────────────────────────────────────────────────────────────

/** The base (ISO 639) language subtag, lowercased: `en-IN` → `en`, `zh-Hant-TW` → `zh`. */
export function baseLanguage(code: string | null | undefined): string {
  return (code ?? '').toLowerCase().split('-')[0];
}

/** Two BCP-47 codes are the "same language" when their base subtags match (no translation needed). */
export function isSameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = baseLanguage(a);
  const right = baseLanguage(b);
  return left.length > 0 && left === right;
}

/**
 * The speaker's spoken language (D12): auto-detected when the detector produced a result, otherwise
 * the device language. The user is NEVER asked to pick their own spoken language unless detection is
 * unavailable (in which case the caller supplies `fallback = navigator.language`).
 */
export function pickSourceLanguage(detected: string | null | undefined, fallback: string): string {
  return detected && detected.length > 0 ? detected : fallback;
}

/** The viewer's target language (D12): their in-call override if set, else the device locale. */
export function pickTargetLanguage(deviceLocale: string, override?: string | null): string {
  return override && override.length > 0 ? override : deviceLocale;
}

// ── Engine selection (on-device only — NO cloud branch exists) ──────────────────────────────────────

/** Mirrors the availability states the built-in web engines report (`available()` / `availability()`). */
export type DeviceAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/**
 * The recognition decision. Note every non-`unavailable` branch carries `processLocally: true`: this
 * type makes it impossible to represent a cloud recogniser. If the device cannot recognise locally,
 * the only outcome is `unavailable` with a reason to show on the disabled toggle (§12.2 Hard rule).
 */
export type RecognitionDecision =
  | { status: 'ready'; processLocally: true }
  | { status: 'needs-install'; processLocally: true; reason: string }
  | { status: 'installing'; processLocally: true; reason: string }
  | { status: 'unavailable'; reason: string };

/**
 * Decides whether captions can be offered for `lang`, from the on-device recogniser's availability.
 * `supported` is the feature-detection result (web: `SpeechRecognition` + the `processLocally` option
 * exist). The cloud path is never selected — an unsupported device yields `unavailable`.
 */
export function selectRecognitionEngine(input: {
  supported: boolean;
  availability: DeviceAvailability;
}): RecognitionDecision {
  if (!input.supported) {
    return { status: 'unavailable', reason: 'Not supported on this device' };
  }
  switch (input.availability) {
    case 'available':
      return { status: 'ready', processLocally: true };
    case 'downloadable':
      return { status: 'needs-install', processLocally: true, reason: 'Download the language pack' };
    case 'downloading':
      return { status: 'installing', processLocally: true, reason: 'Downloading the language pack…' };
    case 'unavailable':
    default:
      return { status: 'unavailable', reason: 'Not supported on this device' };
  }
}

/** Who (if anyone) translates a caption, per the §12.5 receiver-first model. Never a cloud service. */
export type TranslationMode = 'none' | 'receiver' | 'sender' | 'unavailable';

export interface TranslationDecision {
  mode: TranslationMode;
  /** For `receiver`: the on-device model still needs a download before it can translate. */
  needsInstall?: boolean;
  /** For `unavailable`: user-facing reason. */
  reason?: string;
}

/**
 * Decides who translates the other person's captions into the viewer's language (§12.5):
 *   - `none`     — no target, or the caption is already in the target language;
 *   - `receiver` — this (the viewing) device can translate the pair on-device (tried FIRST);
 *   - `sender`   — the receiver cannot, but the speaker opted into "Help translate my captions"
 *                  (`senderHelpEnabled`) and advertised the pair (`senderCanTranslate`);
 *   - `unavailable` — neither device can; the viewer sees the original with a note.
 *
 * There is deliberately NO cloud branch: a device that cannot translate on-device falls back only to
 * the OTHER device's on-device engine, and if that also can't, to showing the original.
 */
export function selectTranslationStrategy(input: {
  sourceLang: string;
  targetLang: string | null;
  translatorSupported: boolean;
  receiverAvailability: DeviceAvailability;
  senderHelpEnabled: boolean;
  senderCanTranslate: boolean;
}): TranslationDecision {
  if (!input.targetLang || isSameLanguage(input.sourceLang, input.targetLang)) {
    return { mode: 'none' };
  }
  // Receiver always tries first (§12.5).
  if (input.translatorSupported) {
    if (input.receiverAvailability === 'available') return { mode: 'receiver' };
    if (input.receiverAvailability === 'downloadable' || input.receiverAvailability === 'downloading') {
      return { mode: 'receiver', needsInstall: true };
    }
  }
  // Receiver cannot → sender fallback, but only if the speaker opted in AND can do the pair (D13).
  if (input.senderHelpEnabled && input.senderCanTranslate) {
    return { mode: 'sender' };
  }
  return { mode: 'unavailable', reason: 'Translation unavailable' };
}

// ── Orchestration ports (the only seam onto the browser engines) ────────────────────────────────────

export interface RecognitionHandle {
  stop(): void;
}

/**
 * On-device speech recognition of the LOCAL microphone. The concrete web implementation MUST gate on
 * `SpeechRecognition.available({ langs, processLocally: true })` and MUST construct the recogniser
 * with `processLocally = true` — never a cloud recogniser (§12.2 Hard rule).
 */
export interface RecognitionPort {
  availability(lang: string): Promise<DeviceAvailability>;
  /** Trigger the on-device language-pack download; resolves with the resulting availability. */
  install(lang: string): Promise<DeviceAvailability>;
  start(opts: {
    lang: string;
    onSegment(segment: { text: string; final: boolean }): void;
    onError(error: Error): void;
  }): Promise<RecognitionHandle>;
}

export interface TranslatorHandle {
  translate(text: string): Promise<string>;
}

/** On-device translation (built-in `Translator` API). Never a cloud translator (§12.5 Hard rule). */
export interface TranslatorPort {
  availability(source: string, target: string): Promise<DeviceAvailability>;
  create(source: string, target: string): Promise<TranslatorHandle>;
}

/** On-device language detection (built-in `LanguageDetector`). Returns the top code, or `null`. */
export interface LanguageDetectorPort {
  availability(): Promise<DeviceAvailability>;
  detect(text: string): Promise<string | null>;
}

export interface CaptionEnginePorts {
  /** `null` ⇒ captions are not supported on this device; the toggle is disabled with a reason. */
  recognition: RecognitionPort | null;
  /** `null` ⇒ no on-device RECEIVER translation here; a sender fallback may still apply. */
  translator: TranslatorPort | null;
  /** `null` ⇒ no on-device detection; source language falls back to the device language (D12). */
  detector: LanguageDetectorPort | null;
}

// ── In-memory caption state (ephemeral — D9) ────────────────────────────────────────────────────────

export type CaptionTranslationState = 'none' | 'pending' | 'done' | 'unavailable';

export interface CaptionLine {
  seq: number;
  /** `local` = this user's own speech; `remote` = the other person's. */
  source: 'local' | 'remote';
  lang: string;
  text: string;
  final: boolean;
  tStartMs?: number;
  /** The translation into the viewer's target language, when available. */
  translatedText?: string;
  translationState: CaptionTranslationState;
}

export interface CaptionUiState {
  /** Whether this device is captioning its own mic. */
  localEnabled: boolean;
  /** Whether on-device recognition is usable here at all (drives the disabled toggle + reason). */
  localAvailable: boolean;
  localUnavailableReason?: string;
  /** A language-pack download is required before local captions can start. */
  localNeedsInstall: boolean;
  /** Whether the other person is captioning (either side captioning shows a visible indicator). */
  peerCaptioning: boolean;
  /** The viewer's chosen target language (defaults to the device locale; changeable in-call — D12). */
  targetLang: string;
  /** Live caption lines, newest last. In memory only; dropped when the call ends (D9). */
  lines: CaptionLine[];
}

// ── Orchestrator ──────────────────────────────────────────────────────────────────────────────────

export interface CaptionSessionConfig {
  ports: CaptionEnginePorts;
  /** Sends a caption-family message over the E2EE `control` channel to the one peer. */
  send(message: CaptionWireMessage): void;
  /** Receives every immutable snapshot of {@link CaptionUiState} for the UI to render. */
  onChange(state: CaptionUiState): void;
  /** Device language, used as the detection fallback AND the default target (D12). */
  deviceLanguage: string;
  /** D13: the local user's "Help translate my captions" setting (enables the sender fallback). */
  helpTranslateCaptions: boolean;
  /** Override the default target language (otherwise the device locale). */
  initialTargetLang?: string;
  maxLines?: number;
}

/**
 * Drives on-device captions + translation for ONE call, over the `control` channel. Transcribes only
 * the LOCAL mic (§12.1), auto-detects the spoken language (D12), translates the peer's captions
 * receiver-first with a sender fallback (§12.5), and keeps everything in memory only (D9).
 *
 * DOM-free: all engine access is through {@link CaptionEnginePorts}, so this is unit-tested with fakes
 * and never reaches a cloud service — the fallback for "can't translate" is the original text, never a
 * remote call.
 */
export class CaptionSession {
  private readonly cfg: CaptionSessionConfig;
  private readonly maxLines: number;

  private localEnabled = false;
  private localAvailable = false;
  private localUnavailableReason: string | undefined;
  private localNeedsInstall = false;
  private peerCaptioning = false;
  private targetLang: string;

  private readonly lines: CaptionLine[] = [];
  private readonly lineIndex = new Map<string, CaptionLine>();

  private recognition: RecognitionHandle | null = null;
  private localSeq = 0;
  private localLang: string;
  private lastPartialSentAt = 0;

  /** The viewer's target language the PEER asked us to translate our captions into (sender fallback). */
  private peerWantLang: string | null = null;
  /** True once we agreed to run the sender fallback for the peer (D13 gate already passed). */
  private senderFallbackActive = false;
  private senderTranslator: TranslatorHandle | null = null;
  private readonly receiverTranslators = new Map<string, TranslatorHandle>();
  private requestedSenderFor: string | null = null;
  private disposed = false;

  constructor(config: CaptionSessionConfig) {
    this.cfg = config;
    this.maxLines = config.maxLines ?? CAPTION_MAX_LINES;
    this.targetLang = pickTargetLanguage(config.deviceLanguage, config.initialTargetLang);
    this.localLang = config.deviceLanguage;
  }

  getState(): CaptionUiState {
    return {
      localEnabled: this.localEnabled,
      localAvailable: this.localAvailable,
      localUnavailableReason: this.localUnavailableReason,
      localNeedsInstall: this.localNeedsInstall,
      peerCaptioning: this.peerCaptioning,
      targetLang: this.targetLang,
      lines: [...this.lines],
    };
  }

  /** Probe on-device recognition availability so the UI can enable or disable the toggle (§12.2). */
  async refreshAvailability(): Promise<void> {
    const port = this.cfg.ports.recognition;
    if (!port) {
      this.localAvailable = false;
      this.localNeedsInstall = false;
      this.localUnavailableReason = 'Not supported on this device';
      this.emit();
      return;
    }
    const availability = await port.availability(this.cfg.deviceLanguage);
    const decision = selectRecognitionEngine({ supported: true, availability });
    this.applyRecognitionDecision(decision);
    this.emit();
  }

  private applyRecognitionDecision(decision: RecognitionDecision): void {
    if (decision.status === 'unavailable') {
      this.localAvailable = false;
      this.localNeedsInstall = false;
      this.localUnavailableReason = decision.reason;
      return;
    }
    // ready / needs-install / installing are all on-device (processLocally: true by the type).
    this.localAvailable = decision.status === 'ready';
    this.localNeedsInstall = decision.status !== 'ready';
    this.localUnavailableReason = decision.status === 'ready' ? undefined : decision.reason;
  }

  /** Change the viewer's target language in-call (D12); re-evaluates every remote line. */
  async setTargetLanguage(lang: string): Promise<void> {
    this.targetLang = lang;
    this.peerWantLang = null; // our own want; sent to the peer so their fallback can match us
    this.requestedSenderFor = null;
    this.senderTranslator = null;
    this.cfg.send(buildCaptionState({ wantLang: lang }));
    for (const line of this.lines) {
      if (line.source === 'remote' && line.final) await this.translateRemoteLine(line);
    }
    this.emit();
  }

  getTargetLanguage(): string {
    return this.targetLang;
  }

  /** Start captioning the local mic (§12.1). Installs the language pack first if needed. */
  async enableLocalCaptions(): Promise<void> {
    const port = this.cfg.ports.recognition;
    if (!port || this.localEnabled) return;
    let availability = await port.availability(this.cfg.deviceLanguage);
    let decision = selectRecognitionEngine({ supported: true, availability });
    if (decision.status === 'needs-install') {
      availability = await port.install(this.cfg.deviceLanguage);
      decision = selectRecognitionEngine({ supported: true, availability });
    }
    this.applyRecognitionDecision(decision);
    if (decision.status !== 'ready') {
      this.emit();
      return;
    }
    this.localLang = this.cfg.deviceLanguage;
    this.recognition = await port.start({
      lang: this.cfg.deviceLanguage,
      onSegment: (segment) => void this.onLocalSegment(segment),
      onError: () => this.disableLocalCaptions(),
    });
    this.localEnabled = true;
    this.cfg.send(buildCaptionState({ enabled: true, lang: this.localLang }));
    this.emit();
  }

  /** Stop captioning the local mic and tell the peer. */
  disableLocalCaptions(): void {
    if (!this.localEnabled && !this.recognition) return;
    this.recognition?.stop();
    this.recognition = null;
    this.localEnabled = false;
    this.cfg.send(buildCaptionState({ enabled: false }));
    this.emit();
  }

  private async onLocalSegment(segment: { text: string; final: boolean }): Promise<void> {
    if (this.disposed) return;
    const now = Date.now();
    if (!segment.final) {
      // Partials replace the current line; throttle to ≤4/s (§12.3).
      if (now - this.lastPartialSentAt < CAPTION_PARTIAL_MIN_INTERVAL_MS) return;
      this.lastPartialSentAt = now;
      const message = buildCaption({ seq: this.localSeq, lang: this.localLang, final: false, text: segment.text });
      this.upsertLine('local', message);
      this.cfg.send(message);
      this.emit();
      return;
    }

    // Final: auto-detect the spoken language (D12), then commit and send.
    this.localLang = await this.detectLanguage(segment.text);
    const message = buildCaption({ seq: this.localSeq, lang: this.localLang, final: true, text: segment.text });
    if (this.senderFallbackActive && this.peerWantLang) {
      const tr = await this.senderTranslate(segment.text, this.localLang, this.peerWantLang);
      if (tr) message.tr = tr;
    }
    this.upsertLine('local', message);
    this.cfg.send(message);
    this.localSeq += 1;
    this.lastPartialSentAt = 0;
    this.emit();
  }

  private async detectLanguage(text: string): Promise<string> {
    const detector = this.cfg.ports.detector;
    if (!detector) return pickSourceLanguage(null, this.cfg.deviceLanguage);
    try {
      const availability = await detector.availability();
      if (availability !== 'available') return pickSourceLanguage(null, this.cfg.deviceLanguage);
      const detected = await detector.detect(text);
      return pickSourceLanguage(detected, this.cfg.deviceLanguage);
    } catch {
      return pickSourceLanguage(null, this.cfg.deviceLanguage);
    }
  }

  /** Route an incoming caption-family `control` message (already parsed by {@link parseCaptionWire}). */
  async handleWire(message: CaptionWireMessage): Promise<void> {
    if (this.disposed) return;
    switch (message.type) {
      case 'caption':
        await this.onRemoteCaption(message);
        break;
      case 'caption.state':
        this.onCaptionState(message);
        break;
      case 'translate.request':
        await this.onTranslateRequest(message);
        break;
      case 'translate.response':
        this.onTranslateResponse(message);
        break;
      case 'capabilities':
        // translatePairs is advisory; receiver-first still probes locally and negotiates via
        // translate.request, so nothing to do beyond ignoring unknown pairs here.
        break;
      default:
        break;
    }
  }

  private onCaptionState(message: CaptionStateMessage): void {
    if (typeof message.enabled === 'boolean') this.peerCaptioning = message.enabled;
    if (message.wantLang !== undefined) this.peerWantLang = message.wantLang;
    this.emit();
  }

  private async onRemoteCaption(message: CaptionMessage): Promise<void> {
    const line = this.upsertLine('remote', message);
    this.peerCaptioning = true;
    if (message.final) {
      await this.translateRemoteLine(line);
    } else {
      line.translationState = isSameLanguage(message.lang, this.targetLang) || !this.targetLang ? 'none' : 'pending';
    }
    this.emit();
  }

  /**
   * Translate ONE final remote line into the target language, receiver-first then sender fallback
   * (§12.5). `upsertLine` has already consumed any `tr` the sender attached, so a line that is
   * already `done` here was translated by the sender and needs nothing further.
   */
  private async translateRemoteLine(line: CaptionLine): Promise<void> {
    if (!line.final) return;
    if (line.translationState === 'done' && line.translatedText != null) return;

    const decision = selectTranslationStrategy({
      sourceLang: line.lang,
      targetLang: this.targetLang,
      translatorSupported: this.cfg.ports.translator != null,
      receiverAvailability: await this.receiverAvailability(line.lang, this.targetLang),
      // Chrome publishes no per-language list and the peer's ability is only known from a
      // translate.response, so we optimistically consider the sender path and let the response (or a
      // sender-attached `tr`) confirm it. onTranslateResponse flips pending → unavailable on a refusal.
      senderHelpEnabled: true,
      senderCanTranslate: true,
    });

    if (decision.mode === 'none') {
      line.translatedText = undefined;
      line.translationState = 'none';
      return;
    }
    if (decision.mode === 'receiver') {
      const translated = await this.receiverTranslate(line.text, line.lang, this.targetLang);
      if (translated != null) {
        line.translatedText = translated;
        line.translationState = 'done';
        return;
      }
      // The receiver model unexpectedly failed → ask the sender to help instead.
    }
    if (decision.mode === 'sender' || decision.mode === 'receiver') {
      this.requestSenderFallback(this.targetLang);
      line.translationState = 'pending';
      return;
    }
    line.translatedText = undefined;
    line.translationState = 'unavailable';
  }

  private async receiverAvailability(source: string, target: string): Promise<DeviceAvailability> {
    const port = this.cfg.ports.translator;
    if (!port) return 'unavailable';
    try {
      return await port.availability(baseLanguage(source), baseLanguage(target));
    } catch {
      return 'unavailable';
    }
  }

  private async receiverTranslate(text: string, source: string, target: string): Promise<string | null> {
    const port = this.cfg.ports.translator;
    if (!port) return null;
    const key = `${baseLanguage(source)}>${baseLanguage(target)}`;
    try {
      let translator = this.receiverTranslators.get(key);
      if (!translator) {
        translator = await port.create(baseLanguage(source), baseLanguage(target));
        this.receiverTranslators.set(key, translator);
      }
      return await translator.translate(text);
    } catch {
      return null;
    }
  }

  private requestSenderFallback(targetLang: string): void {
    if (this.requestedSenderFor === targetLang) return;
    this.requestedSenderFor = targetLang;
    this.cfg.send(buildCaptionState({ wantLang: targetLang }));
    this.cfg.send(buildTranslateRequest(targetLang));
  }

  /** The peer asked US to translate our own captions for them (sender fallback, D13-gated). */
  private async onTranslateRequest(message: TranslateRequestMessage): Promise<void> {
    this.peerWantLang = message.targetLang;
    if (!this.cfg.helpTranslateCaptions) {
      this.cfg.send(buildTranslateResponse(false, 'help-disabled'));
      this.senderFallbackActive = false;
      return;
    }
    const port = this.cfg.ports.translator;
    if (!port) {
      this.cfg.send(buildTranslateResponse(false, 'unsupported'));
      this.senderFallbackActive = false;
      return;
    }
    const availability = await this.receiverAvailability(this.localLang, message.targetLang);
    if (availability === 'unavailable') {
      this.cfg.send(buildTranslateResponse(false, 'pair-unsupported'));
      this.senderFallbackActive = false;
      return;
    }
    this.senderFallbackActive = true;
    this.senderTranslator = null; // created lazily per final segment
    this.cfg.send(buildTranslateResponse(true));
  }

  private onTranslateResponse(message: TranslateResponseMessage): void {
    if (message.ok) return; // the sender will attach `tr` to future finals; nothing to flip here.
    // Neither device can translate the pair → mark pending remote lines unavailable (§12.5 note).
    for (const line of this.lines) {
      if (line.source === 'remote' && line.translationState === 'pending') {
        line.translationState = 'unavailable';
      }
    }
    this.emit();
  }

  private async senderTranslate(
    text: string,
    source: string,
    target: string
  ): Promise<CaptionTranslation | null> {
    const port = this.cfg.ports.translator;
    if (!port) return null;
    try {
      if (!this.senderTranslator) {
        this.senderTranslator = await port.create(baseLanguage(source), baseLanguage(target));
      }
      const translated = await this.senderTranslator.translate(text);
      return { lang: target, text: translated, engine: 'device' };
    } catch {
      return null;
    }
  }

  /** Insert or replace a caption line keyed by (source, seq). Partials replace; finals commit. */
  private upsertLine(source: 'local' | 'remote', message: CaptionMessage): CaptionLine {
    const key = `${source}:${message.seq}`;
    let line = this.lineIndex.get(key);
    if (!line) {
      line = {
        seq: message.seq,
        source,
        lang: message.lang,
        text: message.text,
        final: message.final,
        tStartMs: message.tStartMs,
        translationState: 'none',
      };
      this.lineIndex.set(key, line);
      this.lines.push(line);
      if (this.lines.length > this.maxLines) {
        const removed = this.lines.shift();
        if (removed) this.lineIndex.delete(`${removed.source}:${removed.seq}`);
      }
    } else {
      line.lang = message.lang;
      line.text = message.text;
      line.final = message.final;
    }
    // A caption that carried a sender-side translation into our target language is immediately usable.
    if (message.tr && isSameLanguage(message.tr.lang, this.targetLang)) {
      line.translatedText = message.tr.text;
      line.translationState = 'done';
    }
    return line;
  }

  private emit(): void {
    if (this.disposed) return;
    this.cfg.onChange(this.getState());
  }

  /** Stop recognition and drop all in-memory captions (D9). Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.recognition?.stop();
    this.recognition = null;
    this.lines.length = 0;
    this.lineIndex.clear();
    this.receiverTranslators.clear();
    this.senderTranslator = null;
  }
}
