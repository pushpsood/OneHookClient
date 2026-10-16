import { useLocation } from 'react-router-dom';
import { ChatbotWidget } from './ChatbotWidget';

/**
 * The one place Mr OneHook is mounted (rendered once by App, inside the router).
 *
 * To show him on another page: add its path here. To keep him out of a page's hero (or any section),
 * spread `hideMrOneHook` onto that section (`<section {...hideMrOneHook}>`). Nothing else is
 * needed — position, shadow on dark backgrounds and show/hide timing all live in ChatbotWidget.
 */
export const MR_ONEHOOK_ROUTES: readonly string[] = ['/', '/pricing', '/science'];

export function MrOneHookDock() {
  const { pathname } = useLocation();
  if (!MR_ONEHOOK_ROUTES.includes(pathname)) return null;
  // Re-mount per page so visibility/background are measured fresh for the new layout.
  return (
    <div key={pathname}>
      <ChatbotWidget />
    </div>
  );
}
