/**
 * src/app/modules/auth/index.ts
 *
 * Public barrel exports for the `auth` module.
 * Import everything from here — do not deep-import into sub-folders.
 */

// Types
export type { SasAdminDocument, SasAdminUpdatePayload } from './types/adviser.types';

// Service (pure Firestore logic — no React)
export {
  SAS_ADMINS_COLLECTION,
  signInAdviser,
  signOutAdviser,
  getAdviserProfile,
  createAdviserProfile,
  updateAdviserProfile,
} from './services/auth.service';

// Hooks (React — real-time subscriptions)
export { useAdviserProfile } from './hooks/useAdviserProfile';
