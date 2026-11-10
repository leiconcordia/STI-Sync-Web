import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { PostActivityReportDocument } from '../types/par.types';
import { buildPostActivityReportPDF } from './par-pdf-renderer';

export async function exportPostActivityReportPDF(report: PostActivityReportDocument): Promise<void> {
  let proposal: any = null;
  let liquidation: any = null;
  if (report.eventId) {
    for (const collection of ['activities', 'events', 'activity_proposals']) {
      const snapshot = await getDoc(doc(db, collection, report.eventId));
      if (snapshot.exists()) { proposal = snapshot.data(); break; }
    }
  }
  const id = report.liquidationId || proposal?.liquidationReportId || proposal?.liquidationId;
  if (id) {
    const snapshot = await getDoc(doc(db, 'liquidations', id));
    if (snapshot.exists()) liquidation = snapshot.data();
  }
  const pdf = await buildPostActivityReportPDF(report, proposal, liquidation);
  pdf.save(`${report.referenceNo || 'PAR'}_Post_Activity_Report.pdf`);
}
