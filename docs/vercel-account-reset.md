# Account reset on Vercel

The repository now contains `api/accounts/reset-password.js`, a Node Vercel Function. The frontend calls this endpoint on the same domain. The function verifies the Firebase ID token and active SAS profile, replaces the selected user's Firebase Auth password, synchronizes temporary state, and returns the confirmed credential. The existing browser EmailJS service then sends the email. The preview modal and mandatory password-change views remain in place.

## 1. Get the server credential

Open Firebase Console, select **sti-sync**, then **Project settings > Service accounts > Firebase Admin SDK > Generate new private key**. Download the JSON file and keep it private. Use a project administrator account with permission to create this key. If the organization disables key creation, an administrator must provide an approved server credential; ordinary Firebase web configuration cannot replace it.

This credential is for the backend only. Do not commit it, paste it into chat, put it in `src/`, or prefix its variable with `VITE_`.

[Firebase Admin setup](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments)

## 2. Configure Vercel

In the existing Vercel project, open **Settings > Environment Variables**. Add these variables for **Production**. Add Preview only if you intentionally want preview deployments to access the same live Firebase project.

| Name | Value |
| --- | --- |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT` | Paste the complete contents of the downloaded JSON file, including braces. Do not enter a local Windows file path. |
| `VITE_EMAILJS_SERVICE_ID` | Your existing EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | Your existing EmailJS template ID |
| `VITE_EMAILJS_PUBLIC_KEY` | Your existing EmailJS public key |

Keep `VITE_FIREBASE_EMULATORS` absent or false on Vercel. Remove `VITE_ACCOUNT_RESET_ENABLED=false` if it was used to disable the controls. Your local `.env.local` is ignored by Git and is not automatically uploaded to Vercel.

Use the Vite framework preset, the `STI Sync Web` project folder as the root (if deploying the containing workspace), `npm run build`, and output directory `dist`. Root dependencies now include the backend Firebase SDK packages; Vercel does not need a separate install in `functions/`.

## 3. Deploy the updated source

Upload/push the updated web project using your normal Vercel deployment process. Deploy the version containing `api/`, `server/`, `functions/reset-handler.js`, `functions/package.json`, updated root dependency files, and `vercel.json`. If deploying with a Git integration, ensure those new files are committed in the deployed revision. An old deployment will not pick up local file edits.

After setting variables, redeploy. Vercel environment changes apply to new deployments, not to an already running one.

[Vercel environment variables](https://vercel.com/docs/environment-variables), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## 4. Verify

1. Open `https://YOUR-DOMAIN/api/accounts/reset-password` directly. A JSON response saying **Use POST for password resets** (HTTP 405) confirms the function is routed. An app page or 404 means the function/routing was not deployed correctly. This probe does not check Firebase credentials.
2. Sign into the web app as an active SAS admin and open Account Management.
3. Use a designated test adviser/student/signatory account with its saved real recovery email. Review the temporary-password preview and confirm the reset. This changes the test account's live password.
4. Check the displayed delivery status and the recipient's inbox/spam folder. Verify the old password fails, the temporary password works, the mandatory change appears, and the chosen permanent password clears `tempPass`.

The laptop does not need to stay on after Vercel deployment. Normal local development still works through `npm run dev` and the local CLI credentials.

## Failure messages

| Result | Meaning/action |
| --- | --- |
| Missing `FIREBASE_ADMIN_SERVICE_ACCOUNT` | Add it to the correct Vercel environment and redeploy. |
| Firebase backend access error | Check the JSON project, key validity, and service-account Auth/Firestore permissions. Use Vercel runtime logs without logging the credential or passwords. |
| Firestore quota exhausted | Wait for quota availability; moving the backend does not increase the project's database quota. |
| Reset completed, email failed | The old password is already invalid. Copy the active temporary password shown in the dialog and check EmailJS settings/quota. |
| No saved personal email or Firebase identity mismatch | Complete initial setup or repair the account linkage first. |

## Verification and limits

The Vercel Node handler is tested locally with Vercel-style parsed JSON bodies against real Firebase emulators, including all three reset roles, old-password rejection, secret validation, routing, and invalid requests. Local Vite integration and EmailJS request tests cover the shared flow. These checks do not prove a live Vercel deployment or inbox delivery.

Vercel Hobby, Firebase, and EmailJS quotas remain independent. The function has a 60-second maximum duration configured in `vercel.json`. EmailJS acceptance is distinct from inbox delivery. Closing the page after the credential changes but before the browser sends mail can leave a completed reset without email; the administrator can issue a fresh reset. The earlier live Firestore check returned quota exhaustion. No paid Firebase Cloud Functions service is required.
