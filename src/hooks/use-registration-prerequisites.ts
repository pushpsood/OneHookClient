import { useCallback, useEffect, useState } from 'react';
import { ChatApi } from '../api/chat';
import {
  evaluateRegistrationPrerequisites,
  type MissingPrerequisite,
} from '../lib/registration-prerequisites';

interface RegistrationPrerequisites {
  loading: boolean;
  satisfied: boolean;
  missing: MissingPrerequisite[];
  /** True when the check could not be completed, as opposed to completing and finding a gap. */
  checkFailed: boolean;
  recheck: () => void;
}

/**
 * Reads the account's history-key state and reports whether the app-only sign-up guarantees are in
 * place (see `lib/registration-prerequisites`).
 *
 * `GET /chat/history` is authorised from the verified JWT alone, with no connection-state condition,
 * so it is callable while the user is still ONBOARDING — which is exactly when this needs to run.
 *
 * Fails CLOSED: if the request errors we report "not satisfied" and flag `checkFailed`, so the UI can
 * say it could not confirm and offer a retry instead of waving the user through on a network blip.
 */
export function useRegistrationPrerequisites(): RegistrationPrerequisites {
  const [loading, setLoading] = useState(true);
  const [satisfied, setSatisfied] = useState(false);
  const [missing, setMissing] = useState<MissingPrerequisite[]>([]);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const state = await ChatApi.getHistoryState();
        if (cancelled) return;
        const result = evaluateRegistrationPrerequisites(state);
        setSatisfied(result.satisfied);
        setMissing(result.missing);
        setCheckFailed(false);
      } catch {
        if (cancelled) return;
        // Unknown is treated as unsatisfied, but distinguished so the message is honest about why.
        setSatisfied(false);
        setMissing([]);
        setCheckFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const recheck = useCallback(() => setAttempt((n) => n + 1), []);

  return { loading, satisfied, missing, checkFailed, recheck };
}
