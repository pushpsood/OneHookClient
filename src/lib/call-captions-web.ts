/**
 * Browser engines for on-device call captions + translation (OneHookBackend/docs/voice-video-calls.md
 * §12.2 / §12.5, Web row). This is the ONLY place that touches the browser's built-in AI APIs; it
 * implements the DOM-free {@link CaptionEnginePorts} that `call-captions.ts` orchestrates.
 *
 * HARD RULE (§12.2): captions use the Web Speech `SpeechRecognition` recogniser with
 * `processLocally = true` ONLY — audio never leaves the device, so E2EE holds. This file:
 *   - gates recognition on `SpeechRecognition.available({ langs, processLocally: true })` and offers
 *     `install()` for the language pack;
 *   - constructs every `SpeechRecognition` with `processLocally = true` (there is no code path that
 *     builds one without it, and the no-cloud guard test asserts this);
 *   - uses the built-in `Translator` API (`availability` / `create`) for RECEIVER translation, desktop
 *     Chrome/Edge only, feature-detected — mobile Chrome / Safari / Firefox get a `null` translator
 *     port and fall back to the sender path (or show the original);
 *   - uses the built-in `LanguageDetector` for auto source-language detection (D12).
 *
 * No cloud recogniser or cloud translator is ever referenced. Where an engine is missing the port is
 * `null`, which the session renders as "unavailable", never a remote fallback.
 */

import type {
  CaptionEnginePorts,
  DeviceAvailability,
  LanguageDetectorPort,
  RecognitionHandle,
  RecognitionPort,
  TranslatorHandle,
  TranslatorPort,
} from './call-captions';

// ── Minimal structural typings for the experimental built-in AI APIs (not in lib.dom) ──────────────

type AiAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionStatic {
  new (): SpeechRecognitionInstance;
  available?(opts: { langs: string[]; processLocally: boolean }): Promise<AiAvailability>;
  install?(opts: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<AiAvailability>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: unknown) => void;
  }): Promise<TranslatorInstance>;
}

interface LanguageDetectorResult {
  detectedLanguage: string;
  confidence: number;
}
interface LanguageDetectorInstance {
  detect(text: string): Promise<LanguageDetectorResult[]>;
}
interface LanguageDetectorStatic {
  availability(): Promise<AiAvailability>;
  create(): Promise<LanguageDetectorInstance>;
}

function globalRef<T>(name: string): T | undefined {
  return (globalThis as unknown as Record<string, T | undefined>)[name];
}

/** The on-device SpeechRecognition ctor if, and only if, this build exposes the `processLocally` API. */
function getLocalSpeechRecognition(): SpeechRecognitionStatic | null {
  const ctor =
    globalRef<SpeechRecognitionStatic>('SpeechRecognition') ??
    globalRef<SpeechRecognitionStatic>('webkitSpeechRecognition');
  // Only treat it as usable when the contextual on-device check exists. Without `available`, we
  // cannot prove `processLocally` is honoured, so we MUST NOT start a (cloud) recogniser (§12.2).
  if (ctor && typeof ctor.available === 'function') return ctor;
  return null;
}

function normalizeAvailability(value: unknown): DeviceAvailability {
  return value === 'available' || value === 'downloadable' || value === 'downloading'
    ? value
    : 'unavailable';
}

function createRecognitionPort(): RecognitionPort | null {
  const Ctor = getLocalSpeechRecognition();
  if (!Ctor) return null;

  return {
    async availability(lang: string): Promise<DeviceAvailability> {
      try {
        const result = await Ctor.available!({ langs: [lang], processLocally: true });
        return normalizeAvailability(result);
      } catch {
        return 'unavailable';
      }
    },
    async install(lang: string): Promise<DeviceAvailability> {
      try {
        if (typeof Ctor.install === 'function') {
          await Ctor.install({ langs: [lang], processLocally: true });
        }
        const result = await Ctor.available!({ langs: [lang], processLocally: true });
        return normalizeAvailability(result);
      } catch {
        return 'unavailable';
      }
    },
    async start(opts): Promise<RecognitionHandle> {
      const recognition = new Ctor();
      recognition.lang = opts.lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      // HARD RULE: on-device only. Never construct a recogniser without this (§12.2).
      recognition.processLocally = true;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result) continue;
          opts.onSegment({ text: result[0]?.transcript ?? '', final: Boolean(result.isFinal) });
        }
      };
      recognition.onerror = (event) => opts.onError(new Error(event.error ?? 'recognition-error'));
      recognition.start();
      return {
        stop() {
          try {
            recognition.stop();
          } catch {
            /* already stopped */
          }
        },
      };
    },
  };
}

function createTranslatorPort(): TranslatorPort | null {
  const Translator = globalRef<TranslatorStatic>('Translator');
  if (!Translator || typeof Translator.availability !== 'function') return null;

  return {
    async availability(source: string, target: string): Promise<DeviceAvailability> {
      try {
        const result = await Translator.availability({ sourceLanguage: source, targetLanguage: target });
        return normalizeAvailability(result);
      } catch {
        return 'unavailable';
      }
    },
    async create(source: string, target: string): Promise<TranslatorHandle> {
      const translator = await Translator.create({ sourceLanguage: source, targetLanguage: target });
      return { translate: (text: string) => translator.translate(text) };
    },
  };
}

function createDetectorPort(): LanguageDetectorPort | null {
  const Detector = globalRef<LanguageDetectorStatic>('LanguageDetector');
  if (!Detector || typeof Detector.availability !== 'function') return null;

  let instance: LanguageDetectorInstance | null = null;
  return {
    async availability(): Promise<DeviceAvailability> {
      try {
        return normalizeAvailability(await Detector.availability());
      } catch {
        return 'unavailable';
      }
    },
    async detect(text: string): Promise<string | null> {
      try {
        if (!instance) instance = await Detector.create();
        const results = await instance.detect(text);
        return results[0]?.detectedLanguage ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Feature-detects the browser's on-device caption engines and returns the ports. Any engine that is
 * absent (or whose on-device guarantee can't be proven) is `null`, so the session treats it as
 * unavailable rather than ever reaching a cloud service.
 */
export function createWebCaptionPorts(): CaptionEnginePorts {
  return {
    recognition: createRecognitionPort(),
    translator: createTranslatorPort(),
    detector: createDetectorPort(),
  };
}

/** Quick check for whether captions can be offered at all on this browser (drives the toggle). */
export function webCaptionsSupported(): boolean {
  return getLocalSpeechRecognition() != null;
}
