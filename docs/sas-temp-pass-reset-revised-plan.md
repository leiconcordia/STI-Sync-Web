# Revised implementation plan: tempPass account recovery

Status: Implemented and tested against Firebase Auth/Firestore emulators. Reset now runs through the free local Node/Vite backend and existing EmailJS; no Cloud Functions deployment is required. The live project currently reports an exhausted Firestore quota. See `docs/temp-pass-implementation.md` for current setup. This document supersedes the earlier reset design where the two conflict.

## Agreed behavior

Use `tempPass: string | null` on the account's existing Firestore profile:

| Account state | Meaning | Login and next screen |
| --- | --- | --- |
| `tempPass` is a nonempty string | First-time account or SAS password reset | Accept only the current temporary credential, authenticate the actual Firebase user, then require a permanent password. |
| `tempPass` is null or empty | Account already has a permanent password | Sign in normally through Firebase Auth. |

Use `null` as the value written when clearing the field. Read legacy empty strings as empty too. Do not use `tempPass !== null` alone: that also treats an empty string or a missing field incorrectly. During migration, an existing `requiresPasswordChange: true` still requires completion; a missing new field must not bypass that requirement.

The Firebase Auth password and a nonempty `tempPass` must contain the same temporary credential. A reset must update both. A Firestore-only password check cannot establish a Firebase Auth session, and the browser cannot change another user's Firebase password. Updating both avoids needing the forgotten permanent password when the user subsequently chooses a new password. Firebase provides an Admin API to set a user's password by UID. [Firebase Admin user management](https://firebase.google.com/docs/auth/admin/manage-users)

This deliberately retains a readable temporary credential in Firestore as requested. Permanent passwords remain exclusively in Firebase Auth. Do not display credentials in account tables, print them to logs, put them in audit metadata, or store them in browser sessions.

## Password reset versus password change

A forgotten-password reset does not require the forgotten password. Common recovery flows verify control of the email account using a reset link or code; an administrator-assisted reset uses the administrator's authorization and identity check. Ordinary password change while signed in may require recent authentication. [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Firebase account management](https://firebase.google.com/docs/auth/web/manage-users)

For STI Sync, SAS initiates a reset and the recipient uses the new temporary password. They never need to supply the forgotten password. On the mandatory change screen, either use the recent temporary-password login or ask for the temporary password again if Firebase requires reauthentication. Label it “Temporary password,” not “Old password.”

## 1. Standardize fields and identity

- Add `tempPass: string | null` to student, organization adviser, and institutional signatory profile types and their documented schemas.
- Retain `requiresPasswordChange` for existing clients. Set it to true when temporary credentials are issued, and false when the permanent password has been saved and cleanup succeeds.
- Link each profile to its real Firebase Auth UID. Student ID, employee ID, and random Firestore document ID are not interchangeable with that UID.
- For a person with several roles or organizations sharing one Auth UID, synchronize the same temporary state across linked records. Never reset unrelated accounts because their names match.
- Keep SAS administrator accounts excluded from the Signatories tab and rejected by these reset actions, using UID and normalized email matches.

## 2. First-time accounts

For adviser and signatory creation:

1. Generate a unique temporary password.
2. Create the Firebase Auth user with that password and save the real UID.
3. Save `tempPass` and `requiresPasswordChange: true` on the corresponding profile.
4. Email the registered address with the temporary credential and correct login instructions.
5. Require password replacement on first login.

For registrar-imported students, preserve the existing enrollment and first-login setup. Records with no Firebase identity need the existing initial provisioning/linking step; they cannot be treated as completed accounts merely by adding a field. During that setup, collect the personal email and choose the permanent password. Save the UID/email linkage before allowing normal Student ID login. Returning students and reset accounts must never be sent through the initial formula/anonymous-account fallback.

## 3. SAS Admin resets

Reset eligibility:

- The caller is signed in with Firebase and has an active SAS administrator profile. Check this on the server. Use existing SAS authorization rather than adding a new manual custom-claim setup solely for this simplified flow; keep SAS membership protected from client creation/escalation.
- The target is an active student, adviser, or signatory, with an unambiguous Firebase UID and a saved usable email.
- Student resets use the personal email captured during onboarding, not the provisional student domain. A student who has never supplied one needs SAS-assisted first-login setup.
- Use the saved email only. The reset dialog cannot substitute an arbitrary destination. A separate verified-email-only restriction is not required by this simplified plan; an address still needs valid syntax and must belong to the selected account record.
- Reject mismatched Auth/profile email or identity links with a specific repair message.

Reset sequence:

1. SAS selects the account and confirms the email/reset action.
2. The server serializes resets for that UID to prevent concurrent credentials from diverging.
3. Generate a new random temporary password. Update Firebase Auth to that value without asking for the old password.
4. Write the same value into `tempPass` and set `requiresPasswordChange: true` on linked profiles. Remove obsolete stored credentials.
5. Revoke previous refresh sessions and send the temporary-password email.
6. Return a clear credential/delivery result. Provider acceptance means the provider accepted the email; it does not prove inbox delivery.

If Auth changes but Firestore or email fails, report that partial result instead of claiming nothing changed. Keep the account restricted and provide a retry/recovery action. A fresh reset generates another password and invalidates the previous temporary credential. Never send a credential until it matches the completed Auth/profile transition. No private server key belongs in the browser.

## 4. Login routing

Both web and mobile follow the same decision:

```text
Resolve the person's profile and actual Firebase identity
    |
    +-- tempPass has a value, or legacy change flag is active
    |      Authenticate through Firebase with the temporary credential
    |      Require permanent-password setup before normal access
    |
    +-- tempPass is empty and no change flag is active
           Authenticate through Firebase with the permanent credential
           Continue to the account's normal authorized screen
```

In temporary mode, reject the previous permanent password; do not fall back to permanent credentials after the temporary check fails. Successful comparison with Firestore alone must never create a pretend authenticated local session.

Adviser and signatory logins open the mandatory change view. Completed students open the reset-only password screen. Incomplete students resume onboarding and email collection. Reload, direct links, role switching, and existing sessions must respect the same pending-change state. Remove old plaintext/custom-hash login fallbacks and registrar-formula replay for completed accounts.

## 5. Saving the permanent password

1. Require the current Firebase session to belong to the intended account. Reauthenticate with the temporary credential when necessary.
2. Validate password policy, confirmation, and difference from the temporary password and initial registrar default. Preserve password characters exactly.
3. Save the permanent password in Firebase Auth first.
4. After Auth succeeds, set `tempPass: null`, clear `requiresPasswordChange`, and remove legacy `temporaryPassword`, `defaultPassword`, `customPassword`, `passwordHash`, and `requiresChangePassword` values where applicable.
5. Synchronize linked role/organization records and clear cached session flags.
6. Continue after completion or require a fresh login with the new permanent password.

If Auth fails, keep `tempPass` and the mandatory-change state intact. If Auth succeeds but cleanup fails, show that the new password was saved and allow resuming cleanup with the new credential. Do not require the now-invalid temporary password to complete a retry, and do not silently mark local state complete.

## 6. Implementation changes

- Existing reset function: replace the current deletion of temporary credentials with the coordinated Auth/`tempPass` transition and explicit delivery/partial-failure handling. Reuse this server operation from both Account Management and signatory settings.
- Account directory: preserve administrator exclusion, show readiness/missing-email states, and enable reset only after the actual server/email configuration is available.
- Web login/password services: use the state table above, actual Firebase sessions, and consistent cleanup. Remove the Firestore permanent-password fallbacks.
- Adviser/signatory layouts: enforce mandatory password replacement from live account state, including resets during an existing session.
- Mobile repository/model/router: read `tempPass`, separate onboarding from reset, preserve personal email and existing profile data, and clear temporary state only after Auth succeeds.
- Creation/import flows: write the new field consistently and preserve the existing Firebase UID instead of making duplicate accounts.
- Migration: update existing temporary fields into the new representation only after confirming the real Firebase identity and credential state. Do not copy an obsolete Firestore password into `tempPass` and assume it matches Firebase; reconcile through a reset when needed. Existing permanent accounts keep their Auth passwords and get `tempPass: null`.
- Server operation: keep the local Node/Vite backend running with privileged Firebase access and existing EmailJS configuration to change another user's Firebase password.

## 7. Acceptance checks

1. SAS can reset a forgotten password without knowing it; the reset is sent only to the selected account's saved email.
2. The emailed temporary password establishes a real Firebase session. The previous permanent password and earlier reset passwords fail.
3. Wrong temporary passwords never enter a local-only session or fall back to old passwords.
4. New/per-reset users are required to change password across refreshes, direct links, and role switching.
5. Saving the permanent password succeeds in Auth, then clears `tempPass` and legacy credentials. The temporary password no longer works afterward.
6. Auth, database, and mail failures show accurate outcomes and allow recovery without losing the ability to sign in.
7. Student ID and personal-email login use the same identity. Completed students are not asked to repeat profile photos or onboarding after reset.
8. SAS admin records never appear in Signatories, and reset requests cannot target them.
9. Concurrent resets and repeated clicks leave one matching temporary credential in Auth and Firestore.

Implementation verification and activation instructions are in `docs/temp-pass-implementation.md`. No live account credentials were reset during local testing.
