import type { AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { getAppHref } from '../../config/signup.config';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

/**
 * A "Get the app" call to action. A phone whose store listing is live opens the install smart link
 * in a new tab; everyone else (desktop, or a platform not published yet) goes to the homepage
 * get-app section via client-side navigation. See `getAppHref`.
 *
 * Always reported as `LANDING_OPEN_IN_APP`, whichever destination it resolves to.
 */
export function GetAppLink({ children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const href = getAppHref();
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...rest} {...trackProps(UiElement.LANDING_OPEN_IN_APP)}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} {...rest} {...trackProps(UiElement.LANDING_OPEN_IN_APP)}>
      {children}
    </Link>
  );
}
