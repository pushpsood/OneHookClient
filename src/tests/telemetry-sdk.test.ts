/**
 * SDK-level unit tests for the newly instrumented telemetry elements and the transport contract.
 *
 *  - `resolveUiInteraction` / `trackProps` produce the right payload (elementId, default action,
 *    required value) for a representative set of the elements added/instrumented in this pass.
 *  - The fetch transport sends the `X-OneHook-Platform` header the analytics ingest uses to enforce
 *    cross-platform parity (`element_not_on_platform`).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveUiInteraction,
  trackProps,
  TRACK_ID_ATTR,
  TRACK_ACTION_ATTR,
  TRACK_VALUE_ATTR,
  TRACK_TARGET_ATTR,
} from '../lib/analytics/uiTracking';
import { UiElement } from '../lib/analytics/generated/telemetryCatalog';
import { AnalyticsClient, createFetchTransport, type Signal } from '../lib/analytics/analyticsClient';

describe('resolveUiInteraction: representative newly-instrumented elements', () => {
  it('nav + photo-viewer buttons default to tap', () => {
    expect(resolveUiInteraction(UiElement.NAV_BACK)).toEqual({ elementId: 'nav.back', action: 'tap' });
    expect(resolveUiInteraction(UiElement.NAV_HOME_LOGO)).toEqual({ elementId: 'nav.home_logo', action: 'tap' });
    expect(resolveUiInteraction(UiElement.NAV_SEARCH_OPEN)).toEqual({ elementId: 'nav.search_open', action: 'tap' });
    expect(resolveUiInteraction(UiElement.PHOTO_VIEWER_NEXT)).toEqual({ elementId: 'photo_viewer.next', action: 'tap' });
  });

  it('dialog-confirm elements default to submit', () => {
    expect(resolveUiInteraction(UiElement.CHAT_UNMATCH_CONFIRM)?.action).toBe('submit');
    expect(resolveUiInteraction(UiElement.SETTINGS_RECOVERY_APPROVE)?.action).toBe('submit');
    expect(resolveUiInteraction(UiElement.DISCOVER_ADD_HOOK_SUBMIT)?.action).toBe('submit');
    expect(resolveUiInteraction(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE)?.action).toBe('submit');
  });

  it('valued toggles REQUIRE a value from their set and carry a targetId', () => {
    // Missing value is dropped (would be rejected server-side).
    expect(resolveUiInteraction(UiElement.CHAT_SETTINGS_NOTIFICATION_TOGGLE)).toBeNull();
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT)).toBeNull();
    expect(
      resolveUiInteraction(UiElement.CHAT_SETTINGS_NOTIFICATION_TOGGLE, { value: 'off', targetId: 'readReceipts' })
    ).toEqual({ elementId: 'chat_settings.notification_toggle', action: 'toggle', value: 'off', targetId: 'readReceipts' });
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { value: 'dark' })).toEqual({
      elementId: 'settings.theme_select',
      action: 'select',
      value: 'dark',
    });
    expect(resolveUiInteraction(UiElement.CHAT_AUDIO_PLAY, { value: 'play' })?.value).toBe('play');
    // A value outside the declared set is rejected.
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { value: 'neon' })).toBeNull();
  });

  it('landing nav/social links validate their value set', () => {
    expect(resolveUiInteraction(UiElement.LANDING_NAV_LINK, { value: 'pricing' })?.elementId).toBe('landing.nav_link');
    expect(resolveUiInteraction(UiElement.LANDING_SOCIAL_LINK, { value: 'instagram' })?.value).toBe('instagram');
    expect(resolveUiInteraction(UiElement.LANDING_HOME_LINK)).toEqual({ elementId: 'landing.home_link', action: 'tap' });
  });

  it('trackProps emits the matching data-* attributes', () => {
    const props = trackProps(UiElement.CHAT_CONVERSATION_SWITCH, { index: 2, targetId: 'match-7' });
    expect(props[TRACK_ID_ATTR]).toBe('chat.conversation_switch');
    expect(props['data-track-index']).toBe('2');
    expect(props[TRACK_TARGET_ATTR]).toBe('match-7');

    const theme = trackProps(UiElement.SETTINGS_THEME_SELECT, { value: 'light' });
    expect(theme[TRACK_ID_ATTR]).toBe('settings.theme_select');
    expect(theme[TRACK_VALUE_ATTR]).toBe('light');
    expect(theme[TRACK_ACTION_ATTR]).toBeUndefined(); // default action implied
  });
});

describe('value-optional rule (mirrors the server dropInvalid contract)', () => {
  it('segmented element: `tap` (opening the chooser) needs no value; `select` still does', () => {
    // settings.theme_select is segmented with values [light, dark, system].
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { action: 'tap' })).toEqual({
      elementId: 'settings.theme_select',
      action: 'tap',
    });
    // select (the default) still requires a value.
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { action: 'select' })).toBeNull();
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT)).toBeNull();
    // A value sent with tap must still be valid.
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { action: 'tap', value: 'dark' })).toEqual({
      elementId: 'settings.theme_select',
      action: 'tap',
      value: 'dark',
    });
    expect(resolveUiInteraction(UiElement.SETTINGS_THEME_SELECT, { action: 'tap', value: 'neon' })).toBeNull();
  });

  it('valued element: `dismiss` needs no value, but a sent value must be valid', () => {
    // settings.verify_code_submit has values [email, phone] and actions [submit, dismiss].
    expect(resolveUiInteraction(UiElement.SETTINGS_VERIFY_CODE_SUBMIT, { action: 'dismiss' })).toEqual({
      elementId: 'settings.verify_code_submit',
      action: 'dismiss',
    });
    // submit (non-dismiss, non-segmented-tap) still requires a value.
    expect(resolveUiInteraction(UiElement.SETTINGS_VERIFY_CODE_SUBMIT, { action: 'submit' })).toBeNull();
    expect(resolveUiInteraction(UiElement.SETTINGS_VERIFY_CODE_SUBMIT, { action: 'submit', value: 'email' })?.value).toBe('email');
    // A value sent with dismiss is still validated.
    expect(resolveUiInteraction(UiElement.SETTINGS_VERIFY_CODE_SUBMIT, { action: 'dismiss', value: 'phone' })).toEqual({
      elementId: 'settings.verify_code_submit',
      action: 'dismiss',
      value: 'phone',
    });
    expect(resolveUiInteraction(UiElement.SETTINGS_VERIFY_CODE_SUBMIT, { action: 'dismiss', value: 'bogus' })).toBeNull();
  });
});

describe('context (host screen) for SHARED elements', () => {
  it('keeps a valid ViewableScreen context and drops an unknown one', () => {
    // shared.prompt_preset_select is segmented with no value set — select needs no value.
    expect(resolveUiInteraction(UiElement.SHARED_PROMPT_PRESET_SELECT, { context: 'ONBOARDING' })).toEqual({
      elementId: 'shared.prompt_preset_select',
      action: 'select',
      context: 'ONBOARDING',
    });
    // An unknown screen is dropped; the core interaction survives.
    expect(resolveUiInteraction(UiElement.SHARED_PROMPT_PRESET_SELECT, { context: 'NOT_A_SCREEN' })).toEqual({
      elementId: 'shared.prompt_preset_select',
      action: 'select',
    });
    // trackProps forwards context as a data attribute.
    expect(trackProps(UiElement.SHARED_VOICE_RECORDER, { value: 'record', context: 'ONBOARDING' })['data-track-context']).toBe('ONBOARDING');
  });
});

describe('dismiss convention on openers / dialog buttons', () => {
  it('dismissible openers and dialog buttons resolve dismiss, and submit stays the confirm default', () => {
    expect(resolveUiInteraction(UiElement.CHAT_WALLPAPER_OPEN, { action: 'dismiss' })).toEqual({
      elementId: 'chat.wallpaper_open',
      action: 'dismiss',
    });
    expect(resolveUiInteraction(UiElement.CHAT_MR_ONEHOOK_SCOPE_OPEN, { action: 'dismiss' })?.action).toBe('dismiss');
    expect(resolveUiInteraction(UiElement.ONBOARDING_PHOTO_REMOVE_CONFIRM)?.action).toBe('submit');
    expect(resolveUiInteraction(UiElement.ONBOARDING_PHOTO_REMOVE_CONFIRM, { action: 'dismiss' })?.action).toBe('dismiss');
  });
});

describe('newly instrumented elements resolve to the right id + default action', () => {
  it('round-2 web additions', () => {
    expect(resolveUiInteraction(UiElement.NAV_HOOKED_GO_TO_CHAT)).toEqual({ elementId: 'nav.hooked_go_to_chat', action: 'tap' });
    expect(resolveUiInteraction(UiElement.CHAT_MR_ONEHOOK_SCOPE_OPEN)).toEqual({ elementId: 'chat.mr_onehook_scope_open', action: 'tap' });
    expect(resolveUiInteraction(UiElement.CHAT_REPORT_REASON_SELECT)).toEqual({ elementId: 'chat.report_reason_select', action: 'tap' });
    expect(resolveUiInteraction(UiElement.CHAT_SENSITIVE_REVEAL_CONFIRM)?.action).toBe('submit');
    // Granted value-set additions.
    expect(resolveUiInteraction(UiElement.LANDING_CHATBOT_WIDGET, { value: 'send' })).toEqual({
      elementId: 'landing.chatbot_widget',
      action: 'tap',
      value: 'send',
    });
    expect(resolveUiInteraction(UiElement.LANDING_NAV_LINK, { value: 'science' })?.value).toBe('science');
  });
});

describe('fetch transport sends the platform header', () => {
  it('POSTs /signals with X-OneHook-Platform: web', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const transport = createFetchTransport({
      endpoint: 'https://api.example/signals',
      getToken: async () => 'jwt-token',
      platform: 'web',
      fetchImpl: fakeFetch,
    });

    const batch: Signal[] = [{ clientEventId: 'e1', type: 'ui_interaction', timestamp: 1, attributes: { elementId: 'nav.back' } }];
    await transport.send(batch);

    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-OneHook-Platform']).toBe('web');
    expect(headers['Authorization']).toBe('Bearer jwt-token');
  });

  it('an isolated AnalyticsClient flushes ui_interaction batches through the transport', async () => {
    const sent: Signal[][] = [];
    const client = new AnalyticsClient({
      transport: { send: async (b) => void sent.push(b) },
      isConsented: () => true,
      maxBatchSize: 1,
    });
    client.track('ui_interaction', { elementId: 'nav.back', action: 'tap' });
    await client.flush();
    expect(sent.flat().some((s) => s.attributes?.elementId === 'nav.back')).toBe(true);
  });
});
