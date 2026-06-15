/**
 * src/app/modules/auth/types/adviser.types.ts
 *
 * TypeScript interfaces for the `sas_admins` Firestore collection.
 * Document ID = Firebase Auth UID of the adviser.
 *
 * See docs/database-schema.md § sas_admins for the canonical schema.
 */

import type { Timestamp } from 'firebase/firestore';

// ─── SAS Admin / SAO Adviser Document ─────────────────────────────────────────

export interface SasAdminDocument {
  // ─── Identity ───
  /** Document ID — matches Firebase Auth UID */
  uid: string;

  /** Given name */
  firstName: string;

  /** Family name */
  lastName: string;

  /** Middle name — optional */
  middleName: string | null;

  /** Display-friendly full name, e.g. "Riselle Mae B. Lucanas" */
  displayName: string;

  /** Institutional email address — must match Firebase Auth email */
  email: string;

  /** Philippine mobile number — used as secondary sign-in via phone auth */
  phoneNumber: string | null;

  // ─── Position ───
  /** Official job title, e.g. "SAO Adviser" */
  position: string;

  /** Department assignment, e.g. "Student Affairs Office" */
  department: string;

  /** Role discriminator — always 'admin' for documents in this collection */
  role: 'admin';

  // ─── Profile ───
  /** Firebase Storage URL for the adviser's avatar photo */
  avatarUrl: string | null;

  // ─── Account State ───
  /** Whether the account is currently active (can log in) */
  isActive: boolean;

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;

  /** UID of the admin who created this profile, or 'system' for seed data */
  createdBy: string;
}

// ─── Partial update type for profile mutations ─────────────────────────────────

export type SasAdminUpdatePayload = Partial<
  Pick<
    SasAdminDocument,
    | 'firstName'
    | 'lastName'
    | 'middleName'
    | 'displayName'
    | 'phoneNumber'
    | 'position'
    | 'department'
    | 'avatarUrl'
    | 'isActive'
  >
>;
