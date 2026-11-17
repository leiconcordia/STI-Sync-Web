export type RetainedFundOwnerType = 'sao' | 'organization';

export type RetainedFundLedgerEntryType =
  | 'collection_income'
  | 'liquidation_surplus_retained'
  | 'event_expense_deduction'
  | 'liquidation_deficit_deduction'
  | 'manual_adjustment';

export interface RetainedActivityFundDocument {
  id: string; // e.g. 'SAO_CAMPUS__SY_2026-2027' or 'SAO_CAMPUS' (legacy) or `ORG_${organizationId}__SY_${sy}`
  ownerType: RetainedFundOwnerType;
  schoolYear?: string;
  migratedToSchoolYear?: string;
  organizationId?: string;
  organizationName?: string;
  totalContributionsCollected: number;
  totalSurplusesRetained: number;
  totalDisbursedOrSpent: number;
  availableBalance: number;
  updatedAt?: any;
  updatedBy?: string;
}

export interface RetainedFundLedgerEntry {
  id: string;
  bucketId: string; // 'SAO_CAMPUS' or `ORG_${organizationId}`
  ownerType: RetainedFundOwnerType;
  organizationId?: string;
  organizationName?: string;
  eventId?: string;
  eventTitle?: string;
  liquidationId?: string;
  schoolYear?: string;
  semester?: string;
  type: RetainedFundLedgerEntryType;
  amount: number;
  description: string;
  performedBy?: string;
  createdAt?: any;
}
