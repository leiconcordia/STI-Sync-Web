# tempPass implementation and verification

The web and mobile account flows use the revised tempPass design. The same generated password is saved in Firebase Auth and the linked Firestore profiles. The required password-change notice remains active while tempPass or the compatibility change flag is present. Permanent password changes update Auth first and clear tempPass to null only after linked profile cleanup succeeds.

For a hosted deployment, the repository now includes a Vercel Node Function at `api/accounts/reset-password.js`. Follow [Vercel setup](vercel-account-reset.md) to configure its server-only credential and redeploy. The local Vite backend remains supported.

## Implemented behavior

- Reset email explicitly uses the existing EmailJS service/template/public-key configuration (`VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`). The local Node endpoint handles credentials and returns a confirmed password/recipient with delivery pending. The app calls `sendAccountPasswordResetCredentialsEmail`; EmailJS acceptance/failure is shown separately from the password reset. Other app email flows keep their existing provider behavior.

- Reset now opens a styled in-app dialog in both Account Management and signatory settings. It previews a generated temporary password, allows regeneration/copy, and requires a reason and confirmation. There are no native prompt/confirm popups in these reset entry points.
- The confirmed preview password is validated server-side and used for both Firebase Auth and tempPass. After reset, only the authenticated SAS caller receives the active password in the response; it is kept in modal memory, not local storage or audit logs. Email failure returns a completed-reset result with failed delivery so the admin can still view/copy the active password. A service failure leaves the preview explicitly unconfirmed.

- The existing signed-in, active SAS admin profile authorizes the local server reset. There is no additional custom-claim requirement and no emailVerified-only gate.
- Reset rejects inactive/disabled accounts, missing or provisional recovery emails, mismatched explicit Auth UIDs, and SAS administrator targets. The account directory excludes administrators by UID/email.
- Linked adviser, student, signatory, officer, and embedded organization adviser state is synchronized during reset. Reset passwords are sent only to the saved account email.
- Failed Auth updates send no email and retain the previously saved tempPass. Email failures report that credentials changed and allow a fresh reset. Concurrent resets are serialized.
- The web portal always authenticates through Firebase. Firestore permanent-password hashes, plaintext custom-password sessions, and web registrar-formula sessions are no longer accepted as authentication.
- Mandatory adviser and signatory notices remain in place. Live role-state subscriptions detect pending changes. Completed mobile profiles use the dedicated password-change screen; imported students retain their initial mobile onboarding path.
- Permanent-password cleanup clears linked role fields, legacy credential fields, and browser session flags. The web service supports finishing interrupted cleanup using the newly saved password; the adviser notice provides a Retry account setup action.
- Mobile profile setup no longer writes a new canonical login email while Firebase still has a different email. It asks the student to finish Firebase's email confirmation before completing that transition.

## Local checks

From `STI Sync Web`:

```powershell
npm run build
node --test src/app/modules/accounts/services/signatory-filter.test.mjs
node --test src/app/modules/accounts/services/temporary-password.test.mjs
node scripts/test-reset-modal.mjs
node scripts/test-reset-email.mjs
npm run test:accounts
firebase emulators:exec --only auth,firestore --project demo-sti-sync 'node --test functions/test/*.test.cjs && node scripts/test-password-change.mjs'
```

The tests use real local Firebase Auth and Firestore emulators. The mail adapter is replaced with a test sender; no real email is sent. The web service is loaded through Vite and tested directly for each role, including rejected old/temporary passwords, required notice markup, invalid password changes, linked tempPass cleanup, preserved password whitespace, and interrupted-cleanup recovery.

From `STI_Sync`:

```powershell
flutter test test/features/auth/registrar_credential_eligibility_test.dart test/features/auth/profile_completion_test.dart test/features/auth/registration_viewmodel_test.dart
dart analyze lib/features/auth/repositories/auth_repository.dart lib/features/auth/models/student_model.dart lib/features/auth/repositories/profile_completion_repository.dart lib/features/auth/repositories/password_state_repository.dart lib/features/auth/views/change_password_screen.dart lib/core/router/app_router.dart
```

## Free local backend and startup

The SAS laptop runs the privileged reset endpoint inside Vite. This setup requires no Cloud Functions deployment, paid hosting, or billing upgrade. Firebase and EmailJS still apply their existing usage limits.

From `STI Sync Web`:

```powershell
npm run setup:backend
firebase login
npm run dev
```

Dependencies are already installed and the current machine's Firebase CLI login was verified to access Firebase Auth. Restart any previously running Vite process to load the new server plugin, then open the Local URL printed in the terminal. Existing EmailJS environment variables are reused. The email template should use the recipient variables and `message`, `html_content`, or `temp_password`/`temporary_password`/`password` supplied by the helper.

`server/accounts-vite-plugin.mjs` registers `POST /api/accounts/reset-password`. The endpoint verifies the Firebase ID token and active SAS profile before calling the shared reset handler. `server/admin-context.mjs` uses the existing Firebase CLI login in memory. If that login lacks access, a server-only Admin credential JSON can be selected using `FIREBASE_ADMIN_CREDENTIALS` (never a `VITE_` variable). Keep credentials outside `src/`; private-key paths are ignored in `.gitignore`. No privileged credential reaches the browser.

For local use, keep `npm run dev` running while SAS resets accounts. On Vercel, deploy the API function and configure its server-only credential; the laptop can then be off. Uploading only the static `dist` folder does not deploy the API. Mobile continues to use real Firebase Auth, so successful resets change the mobile login credential too.

Controls are enabled unless `VITE_ACCOUNT_RESET_ENABLED=false`. Normal development uses `sti-sync`. `VITE_FIREBASE_EMULATORS=true` switches to isolated `demo-sti-sync`; server tests require both Auth and Firestore emulators.

## New-account defaults

| Creation path | tempPass | requiresPasswordChange | resetInProgress |
| --- | --- | --- | --- |
| New/replacement adviser | Same initial password as Firebase Auth | true | false |
| New signatory | Same initial password as Firebase Auth | true | false |
| SAS manually creates a student with Auth | Same supplied initial password as Auth | true | false |
| Registrar import or late enrollee without Auth | null; registrar onboarding remains | true | false |
| Student self-registration with chosen password | null | false | false |
| Organization officer | Inherited from canonical student | Inherited | Inherited |
| SAS admin profile | null | false | false |

Provisioned roles save the Firebase identity. Embedded advisers share the metadata. Officers share student credentials. Secondary Firebase instances preserve the SAS session during creation. Failed profile saves roll back newly provisioned identities where possible. Adviser replacement atomically writes revocation, the new profile, and embedded assignment.

Existing records are not bulk rewritten. Missing fields remain compatible; reset and permanent-password changes synchronize new state. Never assume an old stored password matches Firebase.

## Verification and current live limitation

Local HTTP tests run the real Vite endpoint and Auth/Firestore emulators for all three roles. They verify old-password rejection, temporary login, change flags, permanent-password cleanup, officers with stale provisional emails, EmailJS failures, and request validation. Creation tests call actual student/adviser/signatory/officer services, including replacement and duplicate rejection. UI tests exercise the real dialog. EmailJS SDK requests are intercepted and inspected; no real test messages are delivered.

A read-only live check succeeded against Firebase Auth, but Firestore returned error 8 (`Quota exceeded`). Live resets cannot be verified until that quota becomes available. The backend reports this error without claiming the preview password is active. Daily Firestore quotas reset around midnight Pacific time. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

No live accounts were changed, real test emails sent, paid APIs enabled, or backend deployed during verification. Email provider acceptance does not confirm inbox delivery. The temporary field is intentionally readable as requested; permanent passwords remain exclusively in Firebase Auth.
