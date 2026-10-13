/**
 * src/app/modules/workflow/hooks/useApprovalPermissions.ts
 *
 * React hook wrapping resolveApprovalPermissions for reactive calculation.
 */

import { useMemo } from 'react';
import type { ApprovableDocument, ApprovalPermissions } from '../types/approval.types';
import {
  resolveApprovalPermissions,
  type UserContext,
} from '../utils/approval-permissions.utils';

export function useApprovalPermissions(
  doc: Partial<ApprovableDocument> | null | undefined,
  user: UserContext | null | undefined
): ApprovalPermissions {
  return useMemo(() => {
    return resolveApprovalPermissions(doc, user);
  }, [
    doc?.id,
    doc?.status,
    doc?.proposalStatus,
    doc?.lifecycleStatus,
    doc?.createdByUid,
    doc?.createdById,
    doc?.organizationId,
    doc?.hostingOrgId,
    doc?.currentStageIndex,
    doc?.isReturned,
    doc?.approvalChain,
    user?.uid,
    user?.role,
    user?.organizationId,
    user?.email,
  ]);
}
