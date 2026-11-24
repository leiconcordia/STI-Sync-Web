/**
 * src/app/modules/notifications/types/notification.types.ts
 *
 * Real-time notification and alert data definitions for STI Sync.
 * Supports cross-role notifications for SAS Admin, Student Organization Officers,
 * and Designated Signatories.
 */

export type NotificationRole = 'admin' | 'officer' | 'signatory' | 'student' | 'all';

export type NotificationType =
  | 'document_submission'           // Org submitted AP, FL, PAR, or incoming compliance doc
  | 'document_approved'             // SAS or Signatory approved/endorsed document
  | 'document_returned'             // SAS or Signatory returned document for revision
  | 'document_rejected'             // Proposal or liquidation declined
  | 'liquidation_reminder'          // Admin reminded org of upcoming/overdue LF-01
  | 'signatory_required'            // Awaiting designated signatory signature
  | 'compliance_notice'             // Accreditation or institutional announcement
  | 'password_reset_request'        // Portal user requested SAS Admin password reset
  | 'role_assigned'                 // Adviser assigned to org or Officer granted Web Portal access
  | 'officer_appointment'           // Student appointed as officer (requires Mobile confirmation)
  | 'officer_appointment_accepted'  // Student accepted officer appointment -> notify Adviser
  | 'officer_appointment_declined'; // Student declined officer appointment -> notify Adviser

export type NotificationCategory =
  | 'activity_proposal'
  | 'financial_liquidation'
  | 'post_activity_report'
  | 'incoming_document'
  | 'system';

export type LiquidationUrgencyTier = 'on_track' | 'due_soon' | 'critical' | 'overdue';

export interface InAppNotification {
  id: string;
  recipientRole: NotificationRole;
  recipientId?: string;          // Specific user UID (adviser, officer, signatory, student)
  recipientTokens?: string[];    // Normalized lowercase tokens for quota-friendly arrayContainsAny queries
  targetOrgId?: string;          // Student Organization ID (e.g. 'assa', 'jpcs')
  targetOrgName?: string;

  type: NotificationType;
  category: NotificationCategory;
  title: string;                 // e.g., "New Proposal Submitted" or "Urgent Liquidation Reminder"
  message: string;               // e.g., "ASSA submitted AP-2026-SAS-027: TechFest 2026"

  // Deep-linking metadata
  resourceId: string;            // eventId, liquidationId, parId, officerDocId, or documentId
  resourceType: 'event' | 'liquidation' | 'par' | 'document' | 'officer_appointment' | 'system';
  actionRoute: string;           // e.g., "/home/event-approvals?tab=pending&id=xxx"
  metadata?: Record<string, any>;

  // Status flags
  isRead: boolean;
  readAt?: any;
  isUrgent?: boolean;
  urgencyTier?: LiquidationUrgencyTier;

  // Sender and audit metadata
  senderId?: string;
  senderName?: string;
  senderRoleTitle?: string;
  createdAt: any;                // Firestore Timestamp or millis
}

export interface CreateNotificationInput {
  recipientRole: NotificationRole;
  recipientId?: string;
  recipientTokens?: string[];
  targetOrgId?: string;
  targetOrgName?: string;

  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;

  resourceId: string;
  resourceType: 'event' | 'liquidation' | 'par' | 'document' | 'officer_appointment' | 'system';
  actionRoute: string;
  metadata?: Record<string, any>;

  isUrgent?: boolean;
  urgencyTier?: LiquidationUrgencyTier;

  senderId?: string;
  senderName?: string;
  senderRoleTitle?: string;
}

export interface NotificationFilter {
  role: NotificationRole;
  orgId?: string;
  userId?: string;
  unreadOnly?: boolean;
  limitCount?: number;
}

