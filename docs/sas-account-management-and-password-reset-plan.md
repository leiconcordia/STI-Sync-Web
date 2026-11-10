# SAS Admin Account Management and Password Reset Implementation Plan

Date: 10 November 2026  
Status: Historical initial plan, superseded by `docs/temp-pass-implementation.md` and the revised plan.  
Systems: STI Sync Web (React/Firebase) and STI Sync Mobile (Flutter/Firebase).

Current implementation uses a local Node/Vite backend with actual Firebase Auth password replacement and existing EmailJS. Account Management, temporary-password preview, forced change, new-account fields, and emulator tests are implemented. No paid backend deployment is required. Live verification is blocked by the project's Firestore quota response; consult the current implementation document for setup and tested behavior.

Update: The directory excludes SAS administrators from signatories by UID or email. A callable Firebase reset function and client integration are now implemented locally. The function requires an active SAS profile plus the `sasAdmin` custom claim, an active Firebase user with a verified matching email, and two Firebase secrets: `RESEND_API_KEY` and `RESET_FROM_EMAIL`. The client remains disabled unless `VITE_ACCOUNT_RESET_ENABLED=true`. Deploying the function, configuring secrets and trusted admin claims, testing actual delivery, and completing security-rule/mandatory-change enforcement are required before enabling that flag. The existing broad Firestore fallback still grants access to many role and student documents; it must be replaced and tested with the existing application workflows before this is production-ready.

Local verification commands (from `STI Sync Web`):

```powershell
node --test src/app/modules/accounts/services/signatory-filter.test.mjs
firebase emulators:exec --only auth,firestore --project demo-sti-sync 'node --test functions/test/firestore-rules.test.cjs'
npm run build
```

The server function is in `functions/index.js`, and `functions/grant-reset-admin.cjs <firebase-uid>` can grant the required custom claim with authorized Google application-default credentials after verifying the administrator's UID. It preserves existing custom claims. This script and Firebase deployment were not run as part of implementation. Configure the two Firebase secrets using Firebase's secret-management commands; do not put the Resend private key in a Vite environment variable. The local rules changes only protect SAS admin membership and reset locks and require coordinated application regression testing before deployment.

## 1. Requested behavior and scope

Add an **Account Management** item to the SAS Admin sidebar at `/home/account-management`, with **Organization Advisers**, **Students**, and **Signatories** tabs.

| Account | Reset destination | Required behavior after login |
| --- | --- | --- |
| Organization adviser | Registered adviser email | Require a permanent password on first login and after every reset before portal access. |
| Student | Personal email supplied during mobile first-login setup | Require a permanent password after reset. First-time students must also finish the existing profile setup and supply their personal email. |
| Institutional signatory | Registered signatory email | Keep the existing management entry point, correct the reset implementation, and enforce the same password-change requirement. |

A reset generates and emails a **new temporary password**. Existing private passwords are never retrieved or emailed. Each completed reset invalidates earlier passwords; changing the temporary password invalidates it too.

Planning assumption: **SAS Admin initiates resets** from Account Management. A mobile or portal “Forgot password?” entry explains how to request SAS assistance. An automatic self-service reset is a separate extension and must verify mailbox ownership before rotating credentials; entering somebody else's Student ID must never reset their account.

Students who have never supplied a usable personal email need assisted recovery through SAS. Show “Recovery email missing” and disable email reset until identity and email ownership are established. Resetting an account must not reactivate an inactive student, restore an organization, alter a signatory role, or remove existing signatures or academic records.

## 2. Findings in the current implementation

These are findings from local source inspection. Deployed rules, production identities, and real email delivery have not been inspected.

| Finding | Evidence | Required correction |
| --- | --- | --- |
| No dedicated account management route or sidebar item; the admin layout has no authentication guard. | `src/app/routes.tsx`; `src/app/admin/components/layout/{Sidebar,Layout}.tsx` | Add the page and an active SAS Admin guard. Enforce authorization on the backend as well. |
| Signatory reset changes Firestore credentials and sends an email without changing the Firebase Auth password. An email error occurs after the record has already changed. | `resetSignatoryCredentials()` in `src/app/modules/signatories/services/signatory.service.ts` | Update the actual Auth identity through a privileged backend; track credential and delivery outcomes independently. |
| Portal login tries Firebase Auth first, then accepts Firestore passwords. An old Firebase password can therefore remain usable following the current signatory reset. | Strategies A/C/D in `src/app/auth/hooks/useOfficerAuth.ts` | Use Firebase Auth as the credential authority; remove plaintext and custom-hash login fallbacks after migration. |
| Signatory password change catches Firebase Auth update failures, then writes the new password as plaintext `customPassword` and an unsalted SHA-256 `passwordHash`. | `changeSignatoryPassword()` in `src/app/auth/services/password.service.ts` | Never report success after a failed Auth change. Remove these stored credentials and authenticate through Firebase. |
| Adviser/officer first-login password change is a dismissible reminder. Signatory modal opens from the initial local session; live reset state does not independently reopen it. | `src/app/officer/components/OfficerLayout.tsx`; `src/app/signatory/components/SignatoryLayout.tsx` | Use a route gate driven by live account security state, including resets during an existing session. |
| Mobile Student ID login treats `requiresPasswordChange` as first-time onboarding and can accept the surname/Student ID formula even after onboarding. Email fallback also checks that formula without requiring an unclaimed account. | `login()` and `_initiateFirstTimeOnboardingSession()` in `STI_Sync/lib/features/auth/repositories/auth_repository.dart` | Separate first enrollment from reset. Never allow the original formula to authenticate an onboarded/reset account or overwrite its `authUid`. |
| Mobile routes completed profiles with a reset flag back through the entire profile wizard. | `STI_Sync/lib/core/router/app_router.dart` | Add a dedicated password-change route for completed profiles. |
| Profile completion writes the personal email to Firestore even when `verifyBeforeUpdateEmail()` fails or awaits verification. Duplicate-email lookup errors also return “not taken.” | `STI_Sync/lib/features/auth/repositories/profile_completion_repository.dart` | Keep Auth and profile email consistent; represent verification as pending and fail validation on lookup errors. |
| Transactional mail runs in browser code; the Resend branch reads a `VITE_RESEND_API_KEY`. | `src/services/email.service.ts` | Send credential emails on the backend with server secrets. Check configuration and rotate any private mail key previously included in a deployed bundle. |
| Local Firestore rules end with `allow read, write: if true`, making narrower restrictions ineffective. Account credentials can reside in publicly readable role/organization records. | `firestore.rules` | Remove the permissive catch-all, remove credential fields, and implement explicit access rules before enabling resets. |
| Signatory password strength hints include uppercase and number/symbol checks, but submission only requires length and confirmation. Adviser password-change synchronization can warn on database failure and still clear local state. | `SignatoryChangePasswordModal.tsx`; `changeOfficerOrAdviserPassword()` | Share authoritative validation and complete synchronization before showing success. |

Existing signatory reset UI is present in `src/app/admin/components/settings/InstitutionalSignatoryManagement.tsx`. It should call the same corrected reset service as the new page. It cannot currently be signed off as working end to end.

### Baseline checks performed

- Web: `npm run build` passed. Vite reported mixed import and large bundle warnings; compilation is not an authentication or delivery test.
- Mobile: `flutter test test/features/auth/profile_completion_test.dart test/features/auth/registration_viewmodel_test.dart` passed **13 tests**.
- These tests cover existing registration/profile validation. They do not exercise Firebase reset synchronization, signatory login, session revocation, or delivered emails.
- No live account passwords were reset and no credential emails were sent during planning.

## 3. Implementation order and dependencies

| Phase | Work | Completion condition |
| --- | --- | --- |
| 1. Identity and schema preparation | Inventory identity links, existing security flags, legacy credential fields, and email mismatches. Define the schema below and add an isolated backend/emulator configuration. | Each eligible account resolves to one real Firebase UID; ambiguous records are reported for repair. |
| 2. Trusted reset service | Implement authorization, credential rotation, email jobs, audit entries, idempotency, retries, expiry, and concurrency control. | Backend integration tests prove actual Auth changes and safe partial-failure recovery. |
| 3. Password enforcement and rules | Replace Firestore password login fallbacks, implement mandatory change gates, secure account fields, and enforce session restrictions. | Old/default/temp credentials cannot regain normal access; direct API/Firestore bypass tests pass. |
| 4. SAS Admin page | Add navigation, account lists, reset confirmation, delivery status, and recovery diagnostics. Reuse it from existing signatory/officer controls. | An authorized SAS Admin can complete and review a reset for all three account types. |
| 5. Mobile flow | Correct Student ID authentication, email capture/verification, and reset-only password changes. | Student ID and personal-email login work with the new credential without repeating completed onboarding. |
| 6. Migration and release | Backfill validated metadata, migrate accounts, remove legacy credentials, run the acceptance matrix, and stage rollout. | All critical checks pass with test accounts and controlled inboxes; no unresolved identity mismatches. |

The UI can be developed against mocked responses while the backend is built, but the reset action stays unavailable until phases 1–3 are ready. This plan adds a Firebase Functions backend under `STI Sync Web/functions/`; no privileged account-management backend is currently configured in the reviewed web deployment. Confirm deployment project, runtime, service permissions, and email sender configuration during implementation.

## 4. Identity and proposed data contract

The following are **proposed schema additions**, not fields already implemented. Document them in `docs/database-schema.md` when implementation begins, and update the web/mobile types together.

### Canonical identity

- Resolve students through `students.authUid`, advisers through `organization_advisers.authUid`, and signatories through their verified Firebase UID. Confirm each mapping with Firebase Admin Auth.
- Do not assume a Firestore document ID, employee ID, or Student ID is an Auth UID. Existing imported students and signatories can have different IDs or missing links.
- One person with multiple roles and the same Auth UID has one credential. Deduplicate resets by UID and synchronize every linked adviser, organization, officer, and signatory record. Distinct UIDs that merely share a name are never merged automatically.
- Onboarding must claim an eligible unclaimed student on the backend using the approved initial credential. Existing accounts must never be reassigned to a new anonymous UID because a formula password matched.

### Account security record: `account_security/{authUid}`

| Proposed field | Purpose |
| --- | --- |
| `requiresPasswordChange: boolean` | Authoritative gate, mirrored into existing role records for compatibility. |
| `passwordChangeReason: 'first_login' \| 'admin_reset' \| null` | Distinguishes setup from recovery. |
| `credentialVersion: number` | Rejects stale reset workers and concurrent password changes. |
| `activeResetId: string \| null`, `resetInProgress: boolean` | Serializes credential operations and blocks access during incomplete operations. |
| `temporaryPasswordExpiresAt: Timestamp \| null` | Limits temporary-password use in application services. |
| `passwordChangedAt: Timestamp \| null` | Records successful permanent-password changes. |
| `sessionValidAfter: Timestamp` | Rejects pre-reset authentication sessions, including already-issued ID tokens. |
| `recoveryEmail: string \| null`, `recoveryEmailVerifiedAt: Timestamp \| null` | Stores a normalized recovery destination and evidence of ownership. |
| `updatedAt: Timestamp` | Server timestamp for synchronization. |

Only backend code can write this record. The owner can read the necessary security status; SAS Admin can inspect reset eligibility. Do not put passwords or password hashes in profile documents or local storage.

### Reset operations and email jobs

- `account_password_resets/{resetId}`: target UID, linked record references, initiating admin UID, required reason, credential version, masked destination, timestamps, operation status, delivery status, provider message ID, and sanitized error code. Admin-readable; server-written. No passwords.
- Operation states: `requested`, `rotating`, `credentials_updated`, `completed`, `failed`, `repair_required`, `superseded`. Delivery states: `not_queued`, `queued`, `accepted`, `delivered`, `failed`, `bounced`, `unknown`.
- `credential_mail_jobs/{resetId}`: server-only outbox. If durable retries require retaining the generated password, keep only an encrypted payload using a managed server encryption key, with an explicit expiry and deletion after delivery/expiry. Never store readable credentials in the reset metadata, audit trail, browser, or mobile cache.
- Use the existing `audit_logs` structure with `actionType: 'Account Actions'`. Record actor, target, reason, reset ID, and outcome from backend code. Audit records must be reliable and must not include credentials or fake client IP addresses.

## 5. Shared reset and change-password service

### Admin reset

Implement `resetAccountPassword({ accountType, accountId, reason, requestId })`. Return only operation ID, status, masked destination, and sanitized diagnostics. The backend chooses the recipient from the verified account record; it never trusts an arbitrary email supplied by the client.

1. Verify the Firebase ID token and active `sas_admins/{uid}` membership. A student, officer, adviser, signatory, inactive admin, or anonymous session cannot invoke reset administration or alter admin membership. Validate the target account is eligible and the UID/email mapping is unambiguous.
2. Validate the email and account state before mutation. Reject missing/unverified recovery destinations, provisional `@student.sti.edu` addresses, disabled identities, and inactive/archived records. Keep blocked records visible with an actionable explanation.
3. Acquire a transaction-backed lock per UID. Deduplicate `requestId`; retries of the same request return the same operation. A second independent reset is rejected while rotation is running. Default cooldown: 60 seconds per target after a completed request, plus configurable per-admin abuse limits.
4. Generate a unique cryptographically random temporary password on the server, meeting the configured password policy. Proposed defaults: at least 16 characters and 24-hour application expiry. Eliminate shared defaults and `Math.random()` generators from credential workflows.
5. Mark the account restricted and the operation rotating before changing Auth. Use Firebase Admin Auth to set the password for the existing UID. Revoke refresh tokens and persist the session boundary. Update canonical metadata and linked compatibility flags before queueing mail. Firebase Admin supports updating another user's password by UID. [Firebase user management](https://firebase.google.com/docs/auth/admin/manage-users)
6. Queue the matching credential email, including login identifier, temporary password, expiry, correct portal/mobile instructions, mandatory change notice, and SAS contact information. Use separate reset wording instead of the welcome template. Escape all user-controlled text in HTML.
7. Show “Reset complete; email queued” or “Email accepted by provider” according to the recorded state. Show “Delivered” only after a verified delivery event. A mail failure after credential rotation is a recoverable delivery failure, not a claim that nothing changed.

Auth, Firestore, and the email provider cannot participate in one atomic transaction. Persist operation checkpoints, keep incomplete security transitions restricted, and reconcile failed operations. If Auth fails, send no credentials. If Auth succeeds but metadata synchronization fails, finish the same operation through a backend repair worker before normal access or delivery; never silently revert to an old credential.

**Retry delivery** uses the same active operation and encrypted, unexpired credential. **Reset again** starts a new credential version and invalidates previous temporary credentials. A retry worker must check the operation is still current before sending. Use provider idempotency keys tied to reset ID; Resend retains its keys for 24 hours, so application-side operation deduplication is also required. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

### Mandatory password change

Implement `completePasswordChange({ currentPassword, newPassword, expectedCredentialVersion })` for the signed-in account. Verify the current credential through Firebase password authentication and confirm the returned UID matches the caller; never compare Firestore credential fields. Rate-limit failed credential checks and redact request bodies from logs.

- Validate policy, confirmation in the client, difference from the current/temporary password, initial registrar formula, and account identifier. Enforce the password rules on the backend as well.
- Under the same per-UID operation lock, reject stale versions, expired temporary credentials, and resets that raced with the change. Update Auth, finish security metadata, then clear all linked password-change flags and legacy credential fields.
- Clear `temporaryPassword`, `defaultPassword`, `customPassword`, `passwordHash`, and the legacy `requiresChangePassword` alias where present. Update every linked organization, not only the currently selected adviser organization.
- If synchronization fails after Auth changes, retain a resumable operation and restriction state. A retry with the newly established credential must be able to finalize metadata without requiring the invalid old password.
- Revoke older sessions after success, clear application session copies, and require a fresh login with the permanent password. Do not declare success by changing local storage alone.

### Server-side access enforcement

Normal application access requires an active identity, no reset in progress, no mandatory password change, and a session newer than the stored boundary. Limited access while restricted is only for the user's own setup/security status, password completion, required email verification/profile setup, and logout.

Refresh-token revocation alone does not immediately invalidate every issued ID token. Backends must check revocation/session metadata; Firestore rules must enforce the corresponding account state and session boundary. Include tests for same-second reset/login boundaries. [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions)

Temporary-password expiry is application-enforced: Firebase may still accept that password at the authentication endpoint, but expired credentials must not open protected screens, access protected data, or complete a password change. A new SAS reset is then required.

Remove the permissive catch-all in `firestore.rules` and any overlapping allow rule that grants account/security writes. Explicitly restrict `sas_admins`, linked role identities, student `authUid`, security flags, reset operations, email jobs, and audit records. Adding a restrictive rule alongside a permissive matching rule does not restrict access. [Firebase rule behavior](https://firebase.google.com/docs/rules/rules-behavior)

Inventory existing collection access and migrate unauthenticated portal lookups to authenticated/server-mediated reads before tightening rules. Preserve approved public directory projections without exposing account data. Test event approvals, signatures, organization workflows, and mobile reads against the new rules; do not retain public writes to avoid fixing a broken client flow.

## 6. SAS Admin page

- Add **Account Management** under “System & Reports,” with the existing navy/blue styling and top-nav page title. Protect direct navigation and reloads with an active-admin guard. Make logout call Firebase sign-out and clear application sessions.
- Each role tab shows name, Student/Employee ID, organization/department, verified recovery email, account status, password-change status, last reset, delivery status, and actions. Search by ID/name/email; filter by active status, recovery readiness, and delivery failures.
- Use exactly **8 rows per page**, matching `docs/table-pagination-standard.md`; reset pagination when filters or tabs change. Avoid downloading the entire student registry solely to paginate a new screen.
- The reset dialog shows the selected identity and destination, requires an admin reason, and explains that earlier credentials will stop working and a password change will be required. Disable duplicate submission while processing.
- Provide loading, empty, permission-denied, offline, malformed-account, missing-email, cooldown, and provider-error states. Persist operation status so refreshing the page does not repeat the reset.
- After reset, show timestamp, masked recipient, operation ID, and delivery outcome. Provide Retry Delivery for an eligible active job and Reset Again when a new credential is necessary. Do not display/copy temporary passwords in the admin success screen.
- Keep signatory creation, role configuration, digital signatures, and workflow settings in the existing settings module. Its reset button and the new Signatories tab must delegate to the shared service. Existing officer resets must also use the shared UID-based service because student/officer credentials are shared across web and mobile.

## 7. Mobile and portal flow changes

### Student first login

1. Preserve the established registrar onboarding experience, but verify/claim the initial credential through the backend for an unclaimed record only. Prefer provisioning the real Firebase identity in the enrollment backend; remove client-side formula authentication and arbitrary anonymous UID reassignment.
2. Collect the required personal email and new permanent password in the existing setup flow. Keep pending email separate until ownership is verified and Auth linkage is confirmed. For existing provisional Auth accounts, do not overwrite the canonical login email before Firebase finishes the email change.
3. Preserve setup progress and show verification pending/retry/error states. Duplicate-email checks cover Firebase Auth as well as profile records and fail visibly if validation cannot complete.
4. Finalize onboarding and synchronize the personal email, verified recovery destination, password state, and UID. Keep a recoverable checkpoint if Auth succeeds and profile saving fails; do not claim the account is fully complete prematurely.

### Student after reset

1. Sign in with Student ID or the established personal login email and the emailed temporary password. Resolve Student ID through a protected backend instead of exposing the registry to unauthenticated queries.
2. If `isProfileComplete == true` and `requiresPasswordChange == true`, route to `/change-password`. If the profile is incomplete, resume the first-login setup, including mandatory password replacement.
3. Block dashboard/deep-link navigation while restricted. A completed student does not have to reupload a photo/ID or reenter unchanged academic/profile data.
4. After successful completion, sign in again with the new permanent password. The original registrar formula, previous permanent password, superseded temporary password, and just-used temporary password cannot regain application access.

### Adviser and signatory portals

- Replace dismissible reminders as the enforcement mechanism with a dedicated mandatory password-change view before rendering normal portal content. Keep regular voluntary password changes in account settings.
- Derive state from authenticated live security metadata. Refresh, browser back, direct URLs, other tabs, and role/workspace switching cannot bypass the gate. A reset received mid-session immediately restricts the user.
- Use Firebase Auth state for authentication; local-storage profile data is display/cache data only. Clear all matching web session keys on reset invalidation, password completion, and logout.
- Preserve signatory e-signatures, role permissions, and linked proposal/liquidation/PAR history through resets.

## 8. Validation and acceptance matrix

Use one shared password policy across backend, web, and Flutter. Initial compatibility policy: at least 8 characters, one uppercase letter, and one number or symbol; generated temporary passwords are stronger. Confirm the Firebase project policy and make all layers agree. Preserve password characters exactly; normalize identifiers/emails, not passwords. Validate required fields, exact confirmation, current-password correctness, prohibited reuse, and configured maximum length consistently.

| Area | Required tests and expected result |
| --- | --- |
| Authorization | Anonymous users and every non-admin role cannot list reset administration data, reset another account, change identity links, clear security flags, or grant themselves admin membership. Inactive admins are rejected. |
| Identity | Missing UID, duplicate/mismatched email, migrated random document IDs, adviser in several organizations, and adviser/signatory overlap resolve correctly or fail without mutation. |
| Email capture | Blank/malformed/provisional email is rejected; normalized case/spacing is handled; duplicate Auth email, verification failure/expiry, offline lookup, and Auth/Firestore mismatch are recoverable. No silent “available” result after lookup failure. |
| Adviser first login/reset | Credentials work through Firebase; normal portal access is blocked until password change; all linked organizations synchronize; old and temporary credentials stop granting access. |
| Student first login | Initial credential works only for an eligible unclaimed record. UID cannot be reassigned by replay. Personal email is captured and verified; interrupted setup resumes safely. |
| Student reset | Both Student ID and personal-email login work with reset credentials. Completed profiles see only password change; incomplete profiles resume setup. Original formula replay fails by both identifiers. |
| Signatory regression | Create, first login, permanent password, reset, second reset, and permanent password again all work through Auth. Old Auth password fails after reset. No success is returned after simulated Auth failure. Signature/history and role access remain intact. |
| Shared student/officer | A mobile reset changes the same credential used on the web. An existing officer reset cannot leave mobile credentials or security state out of sync. |
| Password policy | Wrong current password, weak password, missing confirmation, mismatch, old/default/temporary reuse, whitespace handling, long passwords, and stale credential versions behave identically on all clients and backend. |
| Bypass/session | Reload, back, deep link, local-storage edits, workspace switching, open second device/tab, stale ID token, and reset during active use cannot bypass restrictions. Same-second revocation boundaries work predictably. |
| Expiry | Expired temporary credential cannot access protected data or complete change. Clock decisions use server time. A fresh SAS reset restores recovery. |
| Reliability | Double-click, timeout retry, two admins resetting one UID, reset racing password change, Auth failure, Firestore failure after Auth update, worker crash, and audit failure all preserve a deterministic restricted/recoverable state. |
| Email delivery | Provider rejection, timeout with unknown outcome, retry, duplicate webhook, forged webhook, delayed bounce, and superseded job are handled. Provider acceptance is never mislabeled as confirmed delivery. |
| Data protection | Readable passwords/custom hashes are absent from documents, local storage, audit logs, function logs, and browser bundles. Email outbox cannot be read by client SDKs. |
| UI regression | Search/filter/pagination, blocked actions, reason validation, loading/error feedback, refresh after submission, and existing signatory/officer settings entry points work. Unrelated approved workflows pass the tightened rules. |

Automate backend/Auth/Firestore integration and rules tests using the Firebase Emulator Suite, including denied-access cases. Add focused web service/gate tests and Flutter repository/router/password-change tests; the existing 13 validation tests remain regression coverage. Configure an explicit web test command because `package.json` currently only defines `build` and `dev`.

Before release, run the web build and focused web tests, backend/emulator/rules suite, targeted Flutter tests and analysis of touched files, then controlled end-to-end checks using test accounts and controlled inboxes for every role. Email delivery and signatory sign-in require those real integration checks before being marked verified. “No bugs” is a release target supported by these checks, not a conclusion from the baseline build.

## 9. File-level implementation map

| Location | Planned changes |
| --- | --- |
| `STI Sync Web/src/app/admin/components/layout/Sidebar.tsx`, `Layout.tsx`; `src/app/routes.tsx` | Navigation, title, route, admin guard integration, real sign-out. |
| `STI Sync Web/src/app/admin/pages/AccountManagement.tsx` (new) | Thin shell rendering the account domain module. |
| `STI Sync Web/src/app/modules/accounts/` (new) | Components, hooks, service client, account/reset types, validation, barrel exports. Use local React state and subscriptions with cleanup. |
| `STI Sync Web/functions/` (new), Firebase deployment/emulator configuration | Privileged reset/password-change/identity resolution, mail adapter/outbox, reconciliation, webhook verification, rate limits, server audit writes, tests. |
| `STI Sync Web/src/app/auth/hooks/useOfficerAuth.ts`, `useOfficerProfile.ts`; `src/app/auth/services/password.service.ts` | Firebase-backed authentication, safe identifier resolution, canonical security state, removal of Firestore password fallbacks. |
| `STI Sync Web/src/app/officer/components/OfficerLayout.tsx`; `src/app/signatory/components/SignatoryLayout.tsx`, `SignatoryChangePasswordModal.tsx`; relevant account/settings pages | Mandatory gates, live reset response, consistent validation and completion behavior. |
| `STI Sync Web/src/app/modules/signatories/services/signatory.service.ts`; existing `InstitutionalSignatoryManagement.tsx` and `OfficerManagement.tsx` | Replace legacy reset implementations and credential-display success UI with shared operation status. |
| Adviser/student creation and registrar import services; `src/services/email.service.ts` | Provision verified identity links/security state, generate credentials on the backend, move credential mail off the browser, prevent new legacy credential writes. |
| `STI Sync Web/firestore.rules`; `src/app/modules/audit/` | Explicit role/security access rules and compatible backend-written account audit events. |
| `STI_Sync/lib/features/auth/repositories/{auth_repository,profile_completion_repository}.dart` | Remove formula replay/anonymous reassignment, handle email verification and shared backend contracts. |
| `STI_Sync/lib/features/auth/models/student_model.dart`; auth viewmodels/views; `lib/core/router/app_router.dart` | Security state, pending email, reset password screen, separate route gate, safe retry states. Add `cloud_functions` if using callable Firebase endpoints. |
| Web/mobile tests and documentation | Regression matrix; update `database-schema.md`, admin/officer backend context, `docs/agent.md` module tree, relevant onboarding specs and testing guides in the implementation run. |

## 10. Migration, rollout, and definition of done

1. Run a read-only migration inventory: missing Auth identities, UID/document-ID differences, duplicate identities, email mismatches, incomplete onboarding, legacy password fields, and conflicting flags. Produce counts and repair references without exporting credentials.
2. Backfill only validated links and security state. Do not mass-reset valid permanent passwords. Existing accounts authenticated only by Firestore credentials need a controlled migration reset; they cannot continue through that fallback after cutover.
3. For legacy unverified recovery emails, mark verification required and provide assisted verification. Do not silently treat a previously typed email as verified.
4. Deploy the backend and compatible clients to staging, validate the matrix, then coordinate production client updates, rules cutover, and removal of legacy credential fields. Old mobile versions with unsafe formula fallback must be retired or blocked from that path by the backend/rules.
5. Enable the admin reset action after security prerequisites pass. Monitor operation failures, repair jobs, bounces, and password-change completion without recording passwords.
6. Rollback can disable new reset initiation and preserve status/repair workers. It must not restore public rules, stored passwords, formula replay, or old credentials.

Done means the new navigation works, SAS can reset each eligible role to its verified email, mandatory password replacement survives all navigation/session paths, previous credentials cannot regain application access, partial failures recover safely, signatory flows pass integration checks, and the release validation matrix has no unresolved critical failures.
