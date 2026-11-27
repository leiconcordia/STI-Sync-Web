/**
 * src/app/modules/signatories/utils/signatory-substitute.utils.ts
 *
 * Pure governance, step-matching, and attribution utilities for
 * Substitute Signatories & Signatory Portal Deactivation (On-Leave Mode).
 * Intentionally free of Firebase imports for direct unit testing.
 */

export interface SignatoryPendingDocSummary {
  id: string;
  documentType: 'proposal' | 'sbr' | 'liquidation' | 'par' | string;
  title?: string;
  code?: string;
  organizationName?: string;
  isCurrentTurn?: boolean;
}

export interface SignatoryDeactivationValidationResult {
  allowed: boolean;
  reason: string | null;
  pendingCount: number;
  currentTurnCount: number;
  hasSubstitute: boolean;
}

export interface SignatoryRemoveSubstituteValidationResult {
  allowed: boolean;
  reason: string | null;
}

export function normalizeSignatoryIdentity(value?: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Check whether a signatory record currently has a valid substitute assigned.
 */
export function hasAssignedSubstitute(record: any): boolean {
  const sub = record?.substitute;
  if (!sub || typeof sub !== 'object') return false;
  return Boolean(
    String(sub.email || '').trim() ||
    String(sub.authUid || '').trim() ||
    String(sub.uid || '').trim()
  );
}

/**
 * True when the primary signatory is active, has deactivated their portal (on leave),
 * and has a valid substitute configured to take over approvals.
 */
export function isSubstituteDelegationActive(record: any): boolean {
  if (!record || record.isActive === false) return false;
  if (record.portalDeactivated !== true) return false;
  return hasAssignedSubstitute(record);
}

/**
 * Strict portal deactivation guardrail:
 * - Blocks deactivating the signatory portal if there are pending documents awaiting
 *   approval/endorsement AND no substitute signatory is assigned.
 * - Allows deactivation if a substitute is assigned (even with pending documents)
 *   OR if there are zero pending documents.
 */
export function validateSignatoryPortalDeactivation(params: {
  hasSubstitute: boolean;
  pendingDocuments: SignatoryPendingDocSummary[];
}): SignatoryDeactivationValidationResult {
  const pendingDocuments = Array.isArray(params.pendingDocuments) ? params.pendingDocuments : [];
  const pendingCount = pendingDocuments.length;
  const currentTurnCount = pendingDocuments.filter((d) => d?.isCurrentTurn !== false).length;
  const hasSubstitute = Boolean(params.hasSubstitute);

  if (pendingCount > 0 && !hasSubstitute) {
    return {
      allowed: false,
      reason:
        `You cannot deactivate your Signatory Portal while you have ${pendingCount} pending document${pendingCount === 1 ? '' : 's'} to approve and no Substitute Signatory assigned. Assign a Substitute Signatory first or process your pending documents before going on leave.`,
      pendingCount,
      currentTurnCount,
      hasSubstitute: false,
    };
  }

  return {
    allowed: true,
    reason: null,
    pendingCount,
    currentTurnCount,
    hasSubstitute,
  };
}

/**
 * Prevent removing a substitute while the primary signatory is already on leave
 * and still has pending documents awaiting approval.
 */
export function validateRemoveSignatorySubstitute(params: {
  portalDeactivated: boolean;
  pendingDocuments: SignatoryPendingDocSummary[];
}): SignatoryRemoveSubstituteValidationResult {
  const pendingCount = Array.isArray(params.pendingDocuments) ? params.pendingDocuments.length : 0;
  if (params.portalDeactivated && pendingCount > 0) {
    return {
      allowed: false,
      reason:
        `Cannot remove the Substitute Signatory while the portal is deactivated and ${pendingCount} pending document${pendingCount === 1 ? '' : 's'} require action. Reactivate the portal or assign a replacement substitute first.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Build a clear acting role label for audit trails and document signature blocks.
 */
export function buildActingSignatoryRoleTitle(
  baseRoleTitle?: string | null,
  primaryName?: string | null
): string {
  const rawRole = String(baseRoleTitle || 'Institutional Signatory').trim();
  const strippedRole = rawRole.replace(/^acting\s+/i, '').trim() || 'Institutional Signatory';
  const cleanPrimary = String(primaryName || '').trim();
  if (cleanPrimary) {
    return `Acting ${strippedRole} (for ${cleanPrimary})`;
  }
  return `Acting ${strippedRole}`;
}

/**
 * Collect all authoritative signatory UIDs and emails that the current session
 * is allowed to act on (own identity + primary signatory's identity when acting as substitute).
 */
export function getEffectiveSignatoryMatchContext(session: any): {
  uids: Set<string>;
  emails: Set<string>;
  role: string;
  roleTitles: string[];
  actingAsSubstitute: boolean;
} {
  const uids = new Set<string>();
  const emails = new Set<string>();
  const roleTitles: string[] = [];

  const addUid = (v: unknown) => {
    const s = String(v || '').trim();
    if (s) uids.add(s);
  };
  const addEmail = (v: unknown) => {
    const s = normalizeSignatoryIdentity(v);
    if (s) emails.add(s);
  };
  const addTitle = (v: unknown) => {
    const s = normalizeSignatoryIdentity(v);
    if (s && !roleTitles.includes(s)) roleTitles.push(s);
  };

  const actingAsSubstitute = Boolean(session?.actingAsSubstitute);

  addUid(session?.id);
  addUid(session?.uid);
  addUid(session?.authUid);
  addEmail(session?.email);
  addTitle(session?.roleTitle);

  if (actingAsSubstitute) {
    addUid(session?.delegatedForSignatoryId);
    addUid(session?.delegatedForSignatoryUid);
    addUid(session?.substituteUid);
    addEmail(session?.delegatedForSignatoryEmail);
    addTitle(session?.delegatedForRoleTitle);
  }

  return {
    uids,
    emails,
    role: normalizeSignatoryIdentity(session?.role),
    roleTitles,
    actingAsSubstitute,
  };
}

/**
 * Unified approval-step matcher supporting both Primary Signatories and
 * active Substitute Signatories acting on behalf of a deactivated Primary Signatory.
 */
export function matchesSignatoryOrSubstituteStep(step: any, session: any): boolean {
  if (!step || !session) return false;
  const ctx = getEffectiveSignatoryMatchContext(session);

  const stepUids = [
    step.signatoryUid,
    step.signedByUid,
    step.originalSignatoryUid,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  if (stepUids.some((u) => ctx.uids.has(u))) return true;

  const stepEmails = [
    step.signatoryEmail,
    step.signedByEmail,
    step.originalSignatoryEmail,
  ]
    .map((v) => normalizeSignatoryIdentity(v))
    .filter(Boolean);

  if (stepEmails.some((e) => ctx.emails.has(e))) return true;

  // Legacy role/title fallback only when the step has no explicit UID or email
  if (stepUids.length === 0 && stepEmails.length === 0) {
    const stepRole = normalizeSignatoryIdentity(step.role);
    if (stepRole && ctx.role && stepRole === ctx.role) return true;

    const stepTitle = normalizeSignatoryIdentity(step.roleTitle);
    if (stepTitle && ctx.roleTitles.length > 0) {
      return ctx.roleTitles.some(
        (t) => stepTitle === t || stepTitle.includes(t) || t.includes(stepTitle)
      );
    }
  }

  return false;
}

/**
 * Resolve clean signer metadata for stamping endorsement steps across AP, SBR, FL, and PAR.
 */
export function resolveSignerAttribution(session: any): {
  signerUid: string;
  signerEmail: string;
  signerName: string;
  signerRoleTitle: string;
  actedAsSubstitute: boolean;
  originalSignatoryUid?: string;
  originalSignatoryName?: string;
  originalSignatoryEmail?: string;
} {
  const actedAsSubstitute = Boolean(session?.actingAsSubstitute);
  const signerName = String(session?.name || session?.displayName || 'Signatory').trim();
  const signerEmail = normalizeSignatoryIdentity(session?.email);
  const signerUid = String(
    actedAsSubstitute
      ? (session?.substituteUid || session?.authUid || session?.uid || session?.id || '')
      : (session?.id || session?.uid || session?.authUid || '')
  ).trim();

  if (actedAsSubstitute) {
    const originalSignatoryName = String(session?.delegatedForSignatoryName || '').trim() || undefined;
    const originalSignatoryUid = String(session?.delegatedForSignatoryId || session?.id || '').trim() || undefined;
    const originalSignatoryEmail = normalizeSignatoryIdentity(session?.delegatedForSignatoryEmail) || undefined;
    const baseRoleTitle = String(session?.delegatedForRoleTitle || session?.roleTitle || 'Signatory').trim();
    return {
      signerUid,
      signerEmail,
      signerName,
      signerRoleTitle: buildActingSignatoryRoleTitle(baseRoleTitle, originalSignatoryName),
      actedAsSubstitute: true,
      originalSignatoryUid,
      originalSignatoryName,
      originalSignatoryEmail,
    };
  }

  return {
    signerUid,
    signerEmail,
    signerName,
    signerRoleTitle: String(session?.roleTitle || session?.role || 'Institutional Signatory').trim(),
    actedAsSubstitute: false,
  };
}
