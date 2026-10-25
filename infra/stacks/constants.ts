/**
 * Single source of truth for the OneHook frontend ownership model.
 *
 * OWNERSHIP MODEL
 * ---------------
 *   - The FRONTEND account (851725215059) owns the production S3/CloudFront stack AND the
 *     `onehook.club` hosted zone.
 *   - The BACKEND account (627367419734) owns the API zones (`api.gamma.onehook.club`,
 *     `api.onehook.club`). The frontend never writes into the backend account.
 *
 * There is only one deployed site: production `onehook.club`. Local development and the production
 * build both point their browser traffic at the Gamma backend (`api.gamma.onehook.club`) until the
 * production backend is promoted; that selection lives in `src/config/deployment.config.ts`, not
 * here. The former `gamma.onehook.club` frontend website and its cross-account DNS delegation have
 * been removed.
 */

import { APP_STORE_LINKS as STORE_LISTINGS } from '../../src/config/app-store-links.ts';

/** AWS accounts by role. */
export const ACCOUNTS = {
  /** Owns the production frontend stack and the onehook.club hosted zone. */
  frontend: '851725215059',
  /** Owns only the API zones (api.gamma.onehook.club, api.onehook.club). */
  backend: '627367419734',
} as const;

/** Public site domain. */
export const DOMAINS = {
  prod: 'onehook.club',
} as const;

/**
 * Stable public identifier for the frontend-owned `onehook.club` hosted zone. Route53 hosted-zone
 * IDs are public routing identifiers, not credentials. Importing this exact zone by ID makes every
 * frontend synth deterministic and removes all CDK lookup-role access from CodeBuild.
 */
export const PRODUCTION_HOSTED_ZONE_ID = 'Z0711151B3O279W1TQZ0';

/**
 * Subdomain that acts as the platform-aware "smart link" for installing the app.
 *
 * `app.onehook.club` serves no content: a CloudFront viewer-request function inspects the
 * User-Agent and answers with a 302 straight to the correct store, so one URL can be printed,
 * texted or put on a poster regardless of the device that opens it.
 */
export const APP_LINK_SUBDOMAIN = 'app';

/**
 * Store destinations for the smart link.
 *
 * The ios/android listings come from `src/config/app-store-links.ts`, the single place they are set
 * (the web UI reads the same file). Only the infra-specific fallback is defined here.
 */
export const APP_STORE_LINKS: {
  readonly ios: string | null;
  readonly android: string | null;
  readonly fallback: string;
} = {
  ...STORE_LISTINGS,
  /**
   * Desktops cannot install the app, and a phone whose store listing is not live yet must not be
   * sent to a store 404, so both go to the web sign-in page, where the app is usable in a browser.
   */
  fallback: 'https://onehook.club/login',
};

/**
 * Mr OneHook AI chatbot custom domains (Azure App Service, OneHookUXEnhancement/infra).
 *
 * User-facing hostnames follow the same stage convention as the backend API
 * (`api.gamma.onehook.club` / `api.onehook.club`): the stage segment sits right before the apex,
 * and prod has none. The records live in THIS account's apex `onehook.club` zone (there is no
 * `gamma.onehook.club` zone; `api.gamma` is delegated straight from the apex too):
 *
 *   CNAME  chatbot[.gamma].onehook.club        -> <azureHost>
 *   TXT    asuid.chatbot[.gamma].onehook.club  -> customDomainVerificationId
 *
 * `customDomainVerificationId` is Azure's per-subscription domain-ownership token (Terraform output
 * `custom_domain_verification_id`). It is published in public DNS by design and is not a secret.
 * Azure binds the hostname and issues a managed TLS certificate only once both records resolve.
 */
export const CHATBOT_DOMAINS = {
  customDomainVerificationId: 'C98530B2C5BF3F29247D2553A19B55BEED4FB8312F2089192CB9CA43AF40E975',
  stages: {
    gamma: {
      hostname: 'chatbot.gamma.onehook.club',
      azureHost: 'onehook-chatbot-api.azurewebsites.net',
    },
    prod: {
      hostname: 'chatbot.onehook.club',
      azureHost: 'onehook-chatbot-api-prod.azurewebsites.net',
    },
  },
} as const;
