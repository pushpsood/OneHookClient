# Onboarding Skip/Logout Feature

## Overview

Users can now exit the onboarding flow at any step without completing it. This prevents the onboarding wizard from feeling like a dead end while still maintaining the requirement that onboarding must be completed before accessing the app.

## Behavior

- **Skip for now** button appears on every onboarding step (top-right corner)
- When clicked:
  - Signs the user out completely (Cognito session + local state cleared)
  - Shows a friendly message: "You can continue your profile anytime. See you soon!"
  - Returns user to the landing page
- **On next login:**
  - User remains in `ONBOARDING` state (server-side)
  - `OnboardingGuard` redirects them back to the wizard
  - Their partial progress is preserved (profile fields, uploaded photos if any)
  - They can continue from where they left off

## Implementation

### Web (React) ✅ Implemented

**File:** `src/components/onboarding/OnboardingWizard.tsx`

**Changes:**
1. Added `LogOut` icon import from `lucide-react`
2. Imported `getCognitoAuth` from `../../lib/cognito-auth`
3. Added `loggingOut` state and `logout` from store
4. Created `handleSkipAndLogout` async function:
   ```typescript
   const handleSkipAndLogout = async () => {
     setLoggingOut(true);
     try {
       await getCognitoAuth().logout();
       logout();
       showToast('You can continue your profile anytime. See you soon!', 'info');
       navigate('/', { replace: true });
     } catch (err) {
       console.error('Logout error during onboarding skip:', err);
       showToast('Could not sign out. Please try again.', 'error');
     } finally {
       setLoggingOut(false);
     }
   };
   ```
5. Added skip button in header section (visible on all steps)
6. Updated loading condition to include `loggingOut`

**UI:**
- Button positioned in top-right of onboarding wizard header
- Shows "Skip for now" text on desktop, icon-only on mobile
- Disabled state while logout is in progress
- Uses same styling as other secondary actions (border, hover states)

### iOS (Swift) 🔨 To Implement

**Recommended location:** `iOS/OneHook/Onboarding/OnboardingViewController.swift` or equivalent

**Implementation pattern:**

```swift
import Foundation
import AWSMobileClient // or equivalent Cognito SDK

class OnboardingViewController: UIViewController {
    
    // Add skip button to navigation bar
    func setupNavigationBar() {
        let skipButton = UIBarButtonItem(
            title: "Skip for now",
            style: .plain,
            target: self,
            action: #selector(handleSkipAndLogout)
        )
        navigationItem.rightBarButtonItem = skipButton
    }
    
    @objc private func handleSkipAndLogout() {
        // Show activity indicator
        let alert = UIAlertController(
            title: nil,
            message: "Signing out...",
            preferredStyle: .alert
        )
        present(alert, animated: true)
        
        // Sign out from Cognito
        AWSMobileClient.default().signOut { [weak self] error in
            alert.dismiss(animated: true) {
                if let error = error {
                    self?.showError("Could not sign out. Please try again.")
                    return
                }
                
                // Clear local state
                UserDefaults.standard.removeObject(forKey: "userId")
                UserDefaults.standard.removeObject(forKey: "authToken")
                // Clear any other cached user data
                
                // Show message and navigate to landing
                self?.showMessage("You can continue your profile anytime. See you soon!")
                self?.navigateToLanding()
            }
        }
    }
    
    private func navigateToLanding() {
        // Navigate to root/landing screen
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first {
            let landingVC = LandingViewController() // or your landing screen
            window.rootViewController = landingVC
            window.makeKeyAndVisible()
        }
    }
    
    private func showMessage(_ message: String) {
        let alert = UIAlertController(
            title: nil,
            message: message,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    
    private func showError(_ message: String) {
        let alert = UIAlertController(
            title: "Error",
            message: message,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
```

**Key points:**
- Call `setupNavigationBar()` in `viewDidLoad()`
- Add skip button to all onboarding step view controllers
- Use the same Cognito sign-out method as your existing logout flow
- Clear all local state (tokens, user defaults, cached profiles)
- Ensure the `OnboardingGuard` (or equivalent) checks server-side `userState` on next launch

### Android (Kotlin) 🔨 To Implement

**Recommended location:** `android/app/src/main/java/com/onehook/mobile/onboarding/OnboardingActivity.kt`

**Implementation pattern:**

```kotlin
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.amplifyframework.auth.cognito.AWSCognitoAuthPlugin
import com.amplifyframework.core.Amplify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OnboardingActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_onboarding)
        
        // Add skip button to toolbar
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            setHomeAsUpIndicator(R.drawable.ic_close)
            title = "Complete Your Profile"
        }
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                handleSkipAndLogout()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
    
    private fun handleSkipAndLogout() {
        // Show progress dialog
        val progressDialog = ProgressDialog(this).apply {
            setMessage("Signing out...")
            setCancelable(false)
            show()
        }
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Sign out from Cognito (synchronous in coroutine)
                Amplify.Auth.signOut { result ->
                    CoroutineScope(Dispatchers.Main).launch {
                        progressDialog.dismiss()
                        
                        if (result is AWSCognitoAuthSignOutResult.CompleteSignOut) {
                            // Clear local state
                            clearLocalState()
                            
                            // Show message
                            Toast.makeText(
                                this@OnboardingActivity,
                                "You can continue your profile anytime. See you soon!",
                                Toast.LENGTH_LONG
                            ).show()
                            
                            // Navigate to landing
                            navigateToLanding()
                        } else {
                            Toast.makeText(
                                this@OnboardingActivity,
                                "Could not sign out. Please try again.",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    progressDialog.dismiss()
                    Toast.makeText(
                        this@OnboardingActivity,
                        "Could not sign out. Please try again.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
    
    private fun clearLocalState() {
        // Clear SharedPreferences
        getSharedPreferences("user_prefs", MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
        
        // Clear any cached user data in Room database, etc.
        // AppDatabase.getInstance(this).clearAllTables()
    }
    
    private fun navigateToLanding() {
        val intent = Intent(this, LandingActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }
}
```

**Key points:**
- Add skip/close button to the toolbar/action bar on all onboarding screens
- Use the same Amplify/Cognito sign-out call as your existing logout flow
- Clear SharedPreferences, Room database, or any other local cache
- Use `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK` to reset navigation stack
- Ensure your app's startup flow checks server-side `userState` and routes to onboarding if `state == ONBOARDING`

## Server-Side State

**Important:** The skip/logout feature does NOT change the user's server-side state. The user remains in `ONBOARDING` state in the State service until they complete all steps and call `StateApi.completeOnboarding()`.

**State Flow:**
1. User signs up → State service creates record with `state: ONBOARDING`
2. User starts onboarding, skips midway → State remains `ONBOARDING`
3. User signs out and back in → `OnboardingGuard` redirects to wizard (because state is still `ONBOARDING`)
4. User finishes wizard → `StateApi.completeOnboarding()` transitions state to `AVAILABLE`
5. App unlocks, user can now be matched

**Guard Logic (all platforms must implement):**
```typescript
// Web example (already exists in App.tsx)
if (!userState || userState.state === UserState.ONBOARDING) {
  return <Navigate to="/onboarding" replace />;
}

// iOS pseudocode
if userState == nil || userState.state == .onboarding {
    present(OnboardingViewController(), animated: true)
    return
}

// Android pseudocode
if (userState == null || userState.state == UserState.ONBOARDING) {
    startActivity(Intent(this, OnboardingActivity::class.java))
    finish()
    return
}
```

## Testing Checklist

### All Platforms
- [ ] Skip button appears on every onboarding step
- [ ] Clicking skip shows loading state (disabled button / progress indicator)
- [ ] After skip, user is signed out (Cognito session cleared)
- [ ] After skip, local state is cleared (tokens, cached profile, etc.)
- [ ] After skip, user sees friendly message
- [ ] After skip, user lands on the login/landing screen
- [ ] On next sign-in, user is routed back to onboarding
- [ ] Partial progress is preserved (e.g., name, age, uploaded photos if saved)
- [ ] User can complete onboarding from where they left off
- [ ] After completing onboarding, user can access the app normally
- [ ] Skip button is responsive (works on mobile screen sizes)
- [ ] Error handling works (network failure, logout error shows message)

### Edge Cases
- [ ] User clicks skip while photo is uploading → upload cancels or completes gracefully
- [ ] User clicks skip while saving profile → save cancels, no partial state corruption
- [ ] User completes onboarding, signs out normally → no regression (normal logout still works)
- [ ] Rapid clicking skip button → only one logout attempt, no duplicate navigations

## UI/UX Notes

- Button should not be too prominent (not a primary CTA)
- Text should be friendly, not punitive ("Skip for now" not "Cancel")
- Message on logout should be encouraging, not guilt-inducing
- Icon-only button acceptable on mobile (space-constrained)
- Button should be consistently positioned across all steps

## Related Files

**Web:**
- `src/components/onboarding/OnboardingWizard.tsx` (implementation)
- `src/App.tsx` (OnboardingGuard)
- `src/lib/cognito-auth.ts` (logout logic)
- `src/store/app-store.ts` (state clearing)

**iOS:**
- `ios/OneHook/Onboarding/` (onboarding view controllers)
- Authentication manager / Cognito integration
- User defaults / keychain clearing

**Android:**
- `android/app/src/main/java/com/onehook/mobile/onboarding/` (onboarding activities)
- Amplify Auth integration
- SharedPreferences / Room database clearing

## Future Enhancements

1. **Progress indicator:** Show completion percentage (e.g., "60% complete")
2. **Save draft:** Auto-save partial progress to backend so it syncs across devices
3. **Resume prompt:** On next login, show "You're 60% done! Continue your profile?" CTA
4. **Email reminder:** Send gentle nudge after 24h if onboarding incomplete
5. **Analytics:** Track skip rate by step to identify friction points
