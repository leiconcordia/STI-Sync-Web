import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from '../../../../services/firebase';
import type { PostActivityReportDocument } from '../types/par.types';
import { fetchLinkedActivityProposal } from '../services/par.service';
import { resolveUserSignature } from '../../signatories';
import { getSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';
import { SAS_ADMINS_COLLECTION } from '../../auth/services/auth.service';
import { formatPersonName } from '../../../utils/name.utils';
import { buildPostActivityReportPDF } from './par-pdf-renderer';
import { getDocxToPdfEndpoint } from '../../workflow/utils/docx-template-engine';
import { tryExportPostActivityReportDocxPdf } from './par-docx-populator';

function cleanSig(val?: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('[base64-')) return '';
  return trimmed;
}

function extractSigFromDoc(d: any): string {
  if (!d) return '';
  return (
    cleanSig(d.signatureUrl) ||
    cleanSig(d.signatureDataUrl) ||
    cleanSig(d.eSignatureUrl) ||
    cleanSig(d.signature)
  );
}

const GENERIC_PREPARER_NAMES = new Set([
  'student affairs services',
  'student affairs & services',
  'student affairs services (sas)',
  'student affairs & services (sas)',
  'sas',
  'sao',
  'sas admin',
  'sao admin',
  'sas administrator',
  'sao administrator',
  'sas / sao administrator',
  'system administrator',
  'sas adviser',
  'sao adviser',
  'club adviser',
  'organization adviser',
  'institutional officer',
  'submitter',
]);

function isGenericPreparerName(name?: string | null): boolean {
  const cleaned = (name || '').trim().toLowerCase();
  return !cleaned || GENERIC_PREPARER_NAMES.has(cleaned);
}

export async function exportPostActivityReportPDF(report: PostActivityReportDocument): Promise<void> {
  let eventDoc: any = null;
  if (report.eventId) {
    for (const colName of ['events', 'activities', 'activity_proposals', 'proposals']) {
      try {
        const snapshot = await getDoc(doc(db, colName, report.eventId));
        if (snapshot.exists()) {
          eventDoc = { id: snapshot.id, ...snapshot.data() };
          break;
        }
      } catch {}
    }
  }

  let proposal: any = null;
  try {
    proposal = await fetchLinkedActivityProposal(
      eventDoc || { referenceId: report.eventReferenceId },
      report.eventId
    );
  } catch {}
  if (!proposal && eventDoc) {
    proposal = eventDoc;
  }

  let liquidation: any = null;
  const liqId = report.liquidationId || eventDoc?.liquidationReportId || eventDoc?.liquidationId || proposal?.liquidationReportId;
  if (liqId) {
    for (const colName of ['financial_liquidations', 'liquidations']) {
      try {
        const snapshot = await getDoc(doc(db, colName, liqId));
        if (snapshot.exists()) {
          liquidation = { id: snapshot.id, ...snapshot.data() };
          break;
        }
      } catch {}
    }
  }

  // Enrich Prepared By name, roleTitle, and signature (resolves createdBy* + SAS/Adviser fallbacks)
  const rAny = report as any;
  const creatorUid = rAny.submittedByUid || report.createdByUid || '';
  const creatorEmail = (rAny.submittedByEmail || report.createdByEmail || '').trim();
  const orgIdLower = (report.organizationId || '').trim().toLowerCase();
  const isSasCreator =
    report.creatorRole === 'sas_admin' ||
    Boolean(report.isSasInternal) ||
    orgIdLower === 'sas' ||
    orgIdLower === 'sao_admin' ||
    orgIdLower === 'sao' ||
    creatorUid === 'sas_admin_user' ||
    (report.preparedBy?.roleTitle || '').toLowerCase().includes('sas') ||
    (report.preparedBy?.roleTitle || '').toLowerCase().includes('student affairs') ||
    creatorEmail.toLowerCase().includes('sas') ||
    creatorEmail.toLowerCase().includes('sao');

  let preparedName =
    report.preparedBy?.name?.trim() ||
    rAny.submittedByName?.trim() ||
    report.createdByName?.trim() ||
    '';
  let preparedRoleTitle =
    report.preparedBy?.roleTitle?.trim() ||
    rAny.submittedByRole?.trim() ||
    (isSasCreator
      ? 'SAS Administrator'
      : report.creatorRole === 'officer'
      ? 'Organization Officer'
      : 'Organization Adviser');
  let preparedSig =
    cleanSig(report.preparedBy?.signatureUrl) ||
    cleanSig(report.submittedBySignatureUrl) ||
    cleanSig(rAny.signatureUrl);

  const authUid = auth.currentUser?.uid || '';
  const authEmail = (auth.currentUser?.email || '').trim();

  // 1. Check sas_admins profile (by creatorUid, current auth UID, or collection query)
  if ((isGenericPreparerName(preparedName) || !preparedSig) && isSasCreator) {
    const candidateAdminUids = Array.from(
      new Set([creatorUid, authUid].filter((u) => Boolean(u) && u !== 'sas_admin_user'))
    );
    for (const candidateUid of candidateAdminUids) {
      try {
        const adminSnap = await getDoc(doc(db, SAS_ADMINS_COLLECTION, candidateUid));
        if (adminSnap.exists()) {
          const d = adminSnap.data();
          const adminFullName = formatPersonName(d) || d.displayName || d.name || '';
          if (isGenericPreparerName(preparedName) && !isGenericPreparerName(adminFullName)) {
            preparedName = adminFullName;
          }
          if (d.signatoryRoleTitle || d.position) {
            preparedRoleTitle = d.signatoryRoleTitle || d.position;
          }
          if (!preparedSig) {
            preparedSig = cleanSig(d.signatureUrl) || cleanSig(d.signatureDataUrl);
          }
          if (preparedSig && !isGenericPreparerName(preparedName)) break;
        }
      } catch {}
    }

    if (isGenericPreparerName(preparedName) || !preparedSig) {
      try {
        const adminsSnap = await getDocs(query(collection(db, SAS_ADMINS_COLLECTION), limit(50)));
        const adminDocs = adminsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const targetEmail = (creatorEmail || authEmail).toLowerCase();
        const targetNameNorm = preparedName.trim().toLowerCase();
        const exactMatch =
          adminDocs.find(
            (d) => targetEmail && (d.email || '').trim().toLowerCase() === targetEmail && Boolean(extractSigFromDoc(d))
          ) ||
          adminDocs.find((d) => {
            const fullName = (formatPersonName(d) || d.displayName || d.name || '').trim().toLowerCase();
            return !isGenericPreparerName(preparedName) && fullName === targetNameNorm && Boolean(extractSigFromDoc(d));
          }) ||
          adminDocs.find((d) => targetEmail && (d.email || '').trim().toLowerCase() === targetEmail) ||
          adminDocs.find((d) => {
            const fullName = (formatPersonName(d) || d.displayName || d.name || '').trim().toLowerCase();
            return !isGenericPreparerName(preparedName) && fullName === targetNameNorm;
          }) ||
          adminDocs.find((d) => Boolean(extractSigFromDoc(d))) ||
          adminDocs[0];
        if (exactMatch) {
          const adminFullName = formatPersonName(exactMatch) || exactMatch.displayName || exactMatch.name || '';
          if (isGenericPreparerName(preparedName) && !isGenericPreparerName(adminFullName)) {
            preparedName = adminFullName;
          }
          if (exactMatch.signatoryRoleTitle || exactMatch.position) {
            preparedRoleTitle = exactMatch.signatoryRoleTitle || exactMatch.position;
          }
          if (!preparedSig) {
            preparedSig = extractSigFromDoc(exactMatch);
          }
        }
      } catch {}
    }
  }

  // 2. For SAS-authored reports, fall back to official SAS Signatory Maintenance config
  if ((isGenericPreparerName(preparedName) || !preparedSig) && isSasCreator) {
    try {
      const sasCfg = await getSasSignatoryConfig();
      if (isGenericPreparerName(preparedName) && !isGenericPreparerName(sasCfg.name)) {
        preparedName = sasCfg.name;
      }
      if (!preparedRoleTitle || preparedRoleTitle === 'SAS Administrator') {
        preparedRoleTitle = sasCfg.roleTitle || preparedRoleTitle;
      }
      if (!preparedSig) {
        preparedSig = cleanSig(sasCfg.signatureUrl) || cleanSig(sasCfg.signatureDataUrl);
      }
    } catch {}
  }

  // 3. For Organization PARs, fall back to linked proposal preparedBy or org adviser if generic/unsigned
  if ((isGenericPreparerName(preparedName) || !preparedSig) && !isSasCreator) {
    if (isGenericPreparerName(preparedName) && !isGenericPreparerName(report.createdByName)) {
      preparedName = report.createdByName;
    }
    if (
      isGenericPreparerName(preparedName) &&
      proposal?.preparedBy?.name &&
      !isGenericPreparerName(proposal.preparedBy.name)
    ) {
      preparedName = proposal.preparedBy.name;
    }
    if (!preparedSig) {
      preparedSig =
        cleanSig(proposal?.preparedBy?.signatureUrl) ||
        cleanSig(proposal?.submittedBySignatureUrl) ||
        cleanSig(proposal?.signatureUrl);
    }

    const targetOrgId =
      (report.organizationId && !['sas', 'sao_admin', 'sao'].includes(orgIdLower) && report.organizationId) ||
      eventDoc?.hostingOrgId ||
      proposal?.organizationId ||
      proposal?.hostingOrgId ||
      '';

    if ((isGenericPreparerName(preparedName) || !preparedSig) && targetOrgId) {
      try {
        const orgSnap = await getDoc(doc(db, 'organizations', targetOrgId));
        if (orgSnap.exists()) {
          const adv = orgSnap.data()?.adviser;
          if (adv) {
            const advName = adv.name || formatPersonName(adv) || '';
            if (isGenericPreparerName(preparedName) && !isGenericPreparerName(advName)) {
              preparedName = advName;
            }
            if (!preparedSig) {
              preparedSig = cleanSig(adv.signatureUrl) || cleanSig(adv.signatureDataUrl);
            }
            if (!preparedSig) {
              preparedSig = cleanSig(
                await resolveUserSignature({
                  uid: adv.authUid || adv.uid,
                  email: adv.email,
                  name: advName,
                  role: 'adviser',
                  profile: adv,
                })
              );
            }
          }
        }
      } catch {}
    }
  }

  // 4. General cross-collection signature resolver fallback (by UID, Email, and Name)
  if (!preparedSig) {
    try {
      preparedSig = cleanSig(
        await resolveUserSignature({
          uid: creatorUid !== 'sas_admin_user' ? creatorUid : authUid,
          email: creatorEmail || (isSasCreator ? authEmail : ''),
          name: preparedName,
          role: isSasCreator
            ? 'sas_admin'
            : report.creatorRole === 'officer'
            ? 'adviser'
            : (report.creatorRole || preparedRoleTitle),
        })
      );
      if (!preparedSig && preparedName) {
        preparedSig = cleanSig(
          await resolveUserSignature({
            uid: creatorUid !== 'sas_admin_user' ? creatorUid : authUid,
            email: creatorEmail,
            name: preparedName,
            role: 'adviser',
          })
        );
      }
    } catch {}
  }

  // 5. Final institutional_signatories + users + localStorage SAS config fallback if still unsigned
  if (!preparedSig) {
    try {
      const sigSnap = await getDocs(query(collection(db, SIGNATORIES_COLLECTION), limit(50)));
      const sigDocs = sigSnap.docs.map((d) => d.data() as any);
      const normMaker = preparedName.trim().toLowerCase();
      const sigMatch =
        sigDocs.find((d) => {
          if (!extractSigFromDoc(d)) return false;
          const dName = (d.name || formatPersonName(d) || '').trim().toLowerCase();
          return normMaker && dName === normMaker;
        }) ||
        (isSasCreator
          ? sigDocs.find((d) => {
              if (!extractSigFromDoc(d)) return false;
              const r = (d.role || '').toLowerCase();
              return r === 'sas_coordinator' || r === 'sas_head' || r === 'sao_head' || r.includes('sas');
            })
          : undefined);
      if (sigMatch) {
        preparedSig = extractSigFromDoc(sigMatch);
        if (isGenericPreparerName(preparedName) && !isGenericPreparerName(sigMatch.name)) {
          preparedName = sigMatch.name;
        }
      }
    } catch {}
  }

  if (!preparedSig && isSasCreator) {
    try {
      const cached = localStorage.getItem('sti_sync_sas_signatory');
      if (cached) {
        preparedSig = extractSigFromDoc(JSON.parse(cached));
      }
    } catch {}
  }

  // Enrich already-signed signatory steps with resolved signature images if missing
  const enrichedChain = await Promise.all(
    (report.approvalChain || []).map(async (step) => {
      const isSigned =
        step.status === 'endorsed' ||
        step.status === 'approved' ||
        Boolean(step.signedAt);
      if (!isSigned || cleanSig(step.signatureUrl)) {
        return step;
      }
      try {
        const resolved = cleanSig(
          await resolveUserSignature({
            uid: step.signatoryUid,
            email: step.signatoryEmail,
            name: step.signatoryName,
            role: step.role,
          })
        );
        return resolved ? { ...step, signatureUrl: resolved } : step;
      } catch {
        return step;
      }
    })
  );

  const enrichedReport: PostActivityReportDocument = {
    ...report,
    ...(preparedSig ? { submittedBySignatureUrl: preparedSig } : {}),
    preparedBy: {
      name: preparedName || report.createdByName || '',
      roleTitle: preparedRoleTitle,
      ...(report.preparedBy?.signedAt ? { signedAt: report.preparedBy.signedAt } : {}),
      ...(preparedSig ? { signatureUrl: preparedSig } : {}),
    },
    approvalChain: enrichedChain,
  };

  if (getDocxToPdfEndpoint()) {
    const exported = await tryExportPostActivityReportDocxPdf(
      enrichedReport,
      proposal,
      liquidation,
      `${report.referenceNo || 'PAR'}_Post_Activity_Report.pdf`
    );
    if (exported) return;
  }

  const pdf = await buildPostActivityReportPDF(enrichedReport, proposal, liquidation);
  pdf.save(`${report.referenceNo || 'PAR'}_Post_Activity_Report.pdf`);
}
