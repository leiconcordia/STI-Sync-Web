import { edmsRequest } from '../../documents/services/edms-api.service';
import type { LiquidationDocument } from '../../finance/types/liquidation.types';
// The backend reads authoritative approval data and generates the actual report.
// Approval triggers continue processing even if the browser closes.
export async function autoArchiveApprovedLiquidation(id: string, _data?: Partial<LiquidationDocument>, _approver?: string): Promise<string> {
  return (await edmsRequest('archive', { kind: 'financial_liquidation', sourceId: id })).id;
}
export async function autoArchiveApprovedEvent(id: string, _approver?: string, _remarks?: string): Promise<string> {
  return (await edmsRequest('archive', { kind: 'activity_proposal', sourceId: id })).id;
}
export async function autoArchiveApprovedPAR(id: string, _data?: any, _approver?: string): Promise<string> {
  return (await edmsRequest('archive', { kind: 'post_activity_report', sourceId: id })).id;
}
