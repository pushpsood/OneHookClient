import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import { ThemeProvider } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/**
 * Heavy Rekognition Face Liveness detector, isolated in its own module so it is
 * code-split into a separate chunk. This module (and the Amplify UI / liveness
 * SDK it pulls in) is ONLY fetched via a dynamic import when a signed-in user
 * actually starts a verification — never on the landing page, login, or the
 * rest of the app.
 */
export interface FaceLivenessInnerProps {
  sessionId: string;
  region: string;
  onAnalysisComplete: () => Promise<void>;
  onError: (error: { error?: { message?: string }; state?: string }) => void;
  onUserCancel: () => void;
}

export default function FaceLivenessInner({
  sessionId,
  region,
  onAnalysisComplete,
  onError,
  onUserCancel,
}: FaceLivenessInnerProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <ThemeProvider>
        <FaceLivenessDetector
          sessionId={sessionId}
          region={region}
          onAnalysisComplete={onAnalysisComplete}
          onError={onError}
          onUserCancel={onUserCancel}
        />
      </ThemeProvider>
    </div>
  );
}
