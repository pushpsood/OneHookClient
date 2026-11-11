import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The member notification switches in Chat settings: "Connections" for everyone (chat-only members
 * included) and "Likes" only while matching is ON. Both save through the partial PUT /chat/settings.
 */
const sdk = vi.hoisted(() => ({
  getChatSettings: vi.fn(),
  updateChatSettings: vi.fn(),
}));
vi.mock('../api/sdk-client', () => ({ sdkClient: sdk }));

import { ChatSettingsApi, type ChatSettings } from '../api/rest';
import {
  CHAT_SETTING_TELEMETRY_KEY,
  NotificationSwitches,
  notificationSwitches,
} from '../components/chat/ChatSettingsSheet';
import { resolveUiInteraction } from '../lib/analytics/uiTracking';
import { UiElement } from '../lib/analytics/generated/telemetryCatalog';

const full: ChatSettings = {
  messageNotifications: true,
  showPreviews: true,
  reactionNotifications: true,
  readReceipts: true,
  typingIndicators: true,
  lastSeenVisibility: 'EVERYONE',
  screenshotProtection: false,
  defaultDisappearingSeconds: 0,
  helpTranslateCaptions: false,
  connectionNotifications: true,
  likeNotifications: false,
};

describe('notificationSwitches', () => {
  it('chat-only members (matching OFF) get Connections only', () => {
    expect(notificationSwitches(false).map((s) => s.key)).toEqual(['connectionNotifications']);
  });

  it('with matching ON, Likes is offered too', () => {
    expect(notificationSwitches(true).map((s) => [s.key, s.label])).toEqual([
      ['connectionNotifications', 'Connections'],
      ['likeNotifications', 'Likes'],
    ]);
  });
});

describe('NotificationSwitches', () => {
  const render = (matchingOn: boolean) =>
    renderToStaticMarkup(<NotificationSwitches settings={full} matchingOn={matchingOn} onToggle={() => undefined} />);

  it('renders a Notifications heading with the Connections switch when matching is OFF', () => {
    const html = render(false);
    expect(html).toContain('>Notifications<');
    expect(html).toContain('>Connections<');
    expect(html).toContain('Hooks, requests, calls.');
    expect(html).not.toContain('>Likes<');
    expect(html).not.toContain('data-track-target="like_notifications"');
  });

  it('shows Likes while matching is ON, reflecting the saved state', () => {
    const html = render(true);
    expect(html).toContain('>Likes<');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1); // connections on, likes off
  });

  it('each switch emits chat_settings.notification_toggle with the new state and the snake_case setting key', () => {
    const html = render(true);
    // trackProps emits id, then value (the NEW state), then target (the setting key iOS and Android send).
    expect(html).toContain(
      'data-track-id="chat_settings.notification_toggle" data-track-value="off" data-track-target="connection_notifications"'
    );
    expect(html).toContain(
      'data-track-id="chat_settings.notification_toggle" data-track-value="on" data-track-target="like_notifications"'
    );
    expect(html).not.toMatch(/data-track-target="[^"]*[A-Z]/);
    for (const targetId of ['connection_notifications', 'like_notifications']) {
      expect(resolveUiInteraction(UiElement.CHAT_SETTINGS_NOTIFICATION_TOGGLE, { value: 'on', targetId })).toEqual({
        elementId: 'chat_settings.notification_toggle',
        action: 'toggle',
        value: 'on',
        targetId,
      });
    }
  });
});

describe('chat-settings toggle telemetry keys', () => {
  it('every toggle reports the same snake_case key as iOS and Android', () => {
    expect(CHAT_SETTING_TELEMETRY_KEY).toEqual({
      messageNotifications: 'message_notifications',
      showPreviews: 'show_previews',
      reactionNotifications: 'reaction_notifications',
      readReceipts: 'read_receipts',
      typingIndicators: 'typing_indicators',
      screenshotProtection: 'screenshot_protection',
      connectionNotifications: 'connection_notifications',
      likeNotifications: 'like_notifications',
    });
  });

  it('the sheet never reports a raw (camelCase) settings key', () => {
    const sheet = readFileSync(join(process.cwd(), 'src/components/chat/ChatSettingsSheet.tsx'), 'utf8');
    const targets = [...sheet.matchAll(/targetId:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(t).toMatch(/^CHAT_SETTING_TELEMETRY_KEY\[/);
  });
});

describe('ChatSettingsApi', () => {
  beforeEach(() => {
    sdk.getChatSettings.mockReset();
    sdk.updateChatSettings.mockReset();
  });

  it('get unwraps { settings } from the SDK output', async () => {
    sdk.getChatSettings.mockResolvedValue({ $metadata: {}, settings: full });
    expect(await ChatSettingsApi.get()).toEqual(full);
  });

  it('a response without the new switches reads them as on (their default)', async () => {
    const { connectionNotifications: _c, likeNotifications: _l, ...older } = full;
    sdk.getChatSettings.mockResolvedValue({ $metadata: {}, settings: older });
    const got = await ChatSettingsApi.get();
    expect(got.connectionNotifications).toBe(true);
    expect(got.likeNotifications).toBe(true);
  });

  it('update sends only the changed switch (partial patch) and returns the effective settings', async () => {
    sdk.updateChatSettings.mockResolvedValue({ $metadata: {}, settings: { ...full, connectionNotifications: false } });
    const got = await ChatSettingsApi.update({ connectionNotifications: false });
    expect(sdk.updateChatSettings).toHaveBeenCalledWith({ connectionNotifications: false });
    expect(got.connectionNotifications).toBe(false);
  });

  it('the installed SDK serialises both new switches (otherwise they would be silently dropped)', () => {
    const protocol = readFileSync(
      join(process.cwd(), 'node_modules/onehook-api-client/dist-es/protocols/Aws_restJson1.js'),
      'utf8'
    );
    const update = protocol.slice(protocol.indexOf('export const se_UpdateChatSettingsCommand'));
    const body = update.slice(0, update.indexOf('export const', 1));
    expect(body).toContain("'connectionNotifications'");
    expect(body).toContain("'likeNotifications'");
  });
});

describe('ChatSettingsSheet wiring', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/chat/ChatSettingsSheet.tsx'), 'utf8');

  it('reads the matching mode from the app state and saves through the partial update', () => {
    expect(src).toContain('isMatchingOn(s.userState)');
    expect(src).toMatch(/<NotificationSwitches[\s\S]*?matchingOn=\{matchingOn\}[\s\S]*?onToggle=\{\(change\) => void patch\(change\)\}/);
  });

  it('nothing on web sends the removed Matching notify fields', () => {
    for (const f of ['src/api/preferences.ts', 'src/api/matching.ts', 'src/api/rest.ts']) {
      const code = readFileSync(join(process.cwd(), f), 'utf8');
      expect(code).not.toMatch(/notifyMatches|notifyLikes|notifyDailyPicks/);
    }
  });
});
