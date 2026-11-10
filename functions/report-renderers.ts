import { exportActivityProposalPDF } from '../src/app/modules/activity-proposals/utils/proposal-pdf-exporter';
import { buildPostActivityReportPDF } from '../src/app/modules/post-activity-reports/utils/par-pdf-renderer';
import { buildOfficialStiLiquidationWorkbook } from '../src/app/modules/finance/utils/sti-liquidation-excel';
import * as XLSXModule from 'xlsx-js-style';

export async function renderArchivedDocument(kind: string, snapshot: any, imageLoader: (url?: string) => Promise<string | null>) {
  const report = snapshot.source;
  if (kind === 'financial_liquidation') {
    const XLSX = (XLSXModule as any).default || XLSXModule;
    return { bytes: Buffer.from(XLSX.write(buildOfficialStiLiquidationWorkbook(report), { type: 'buffer', bookType: 'xlsx' })), extension: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileType: 'XLSX' };
  }
  const pdf = kind === 'activity_proposal'
    ? await exportActivityProposalPDF(report, { download: false, imageLoader })
    : await buildPostActivityReportPDF(report, snapshot.proposal, snapshot.liquidation, imageLoader);
  return { bytes: Buffer.from(pdf.output('arraybuffer')), extension: 'pdf', contentType: 'application/pdf', fileType: 'PDF' };
}
