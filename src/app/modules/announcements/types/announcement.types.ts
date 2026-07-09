import { Timestamp } from 'firebase/firestore';

export type AnnouncementPriority = 'Normal' | 'Important' | 'Urgent';
export type AnnouncementAudience = 'campus-wide' | 'all-organizations' | 'specific';

export interface AnnouncementDocument {
  id: string;                              // Auto-generated Firestore document ID

  // ─── Content ───
  title: string;                           // e.g., "Reminder: Event Proposal Deadline"
  content: string;                         // Rich-text body (stored as plain text for now)
  priority: AnnouncementPriority;

  // ─── Targeting ───
  audience: AnnouncementAudience;
  targetOrgIds: string[];                  // Populated only when audience === 'specific'
  targetOrgNames: string[];                // Denormalized names for display

  // ─── Pinning ───
  pinned: boolean;                         // Pinned announcements float to top

  // ─── Academic Context ───
  semesterId: string;                      // FK → /semesters (active semester at time of posting)
  schoolYear: string;                      // e.g., "2025-2026"

  // ─── Author ───
  authorName: string;                      // e.g., "Riselle Mae B. Lucanas"
  authorUid: string;                       // FK → /sas_admins

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  targetOrgIds: string[];
  targetOrgNames: string[];
  pinned: boolean;
  semesterId: string;
  schoolYear: string;
}
