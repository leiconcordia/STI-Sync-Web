import { StoredDocumentBrowser } from '../../documents/components/EdmsStorage';

export function ApprovedReportStorage({ orgId, kind }: { orgId?: string; kind?: 'activity_proposal' | 'financial_liquidation' | 'post_activity_report' }) {
  return <StoredDocumentBrowser orgId={orgId} location="report_archives" reportKind={kind} />;
}
