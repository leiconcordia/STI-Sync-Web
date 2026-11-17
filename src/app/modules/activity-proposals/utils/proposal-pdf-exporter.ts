/**
 * src/app/modules/activity-proposals/utils/proposal-pdf-exporter.ts
 *
 * Official publication-quality US Letter PDF generation engine for STI College Ormoc
 * Activity Proposals (Official Form AP-01).
 *
 * Adheres strictly and verbatim to official STI institutional template:
 * - docs/AP_FORMAT_EMPTY.docx / public/templates/ap_template.docx
 *
 * When VITE_DOCX_TO_PDF_URL is configured and download !== false, populates
 * `/templates/ap_template.docx` directly and converts it via the backend endpoint.
 * Otherwise (and for server-side Cloud Function archival rendering), renders a
 * 1:1 visual replica of `AP_FORMAT_EMPTY.docx` using jsPDF:
 * - US Letter (215.9mm x 279.4mm), 25.4mm (1 inch) left/right margins
 * - STI College Ormoc logo on left + right-aligned underlined "Date:" + 14pt bold "Activity Proposal"
 * - Borderless 2-column layout: right-aligned bold sans-serif Col 0 labels (Item) + Times serif Col 1 entries (Entry)
 * - Exact 3-column Task List table and 6-column Financial Projections matrix with Revenue:/Expenses: merged headers,
 *   diagonal-stripe shaded Total Amount item cells (#E6E6E6), and merged Balance row
 * - "Proposed by:", "Endorsed by:", and "Approved by:" signatory blocks with resolved aspect-preserved signatures
 * - Verbatim 15-day administrative policy footnote with bold "initial task"
 */

import { jsPDF } from 'jspdf';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';
import type { ActivityProposal, ProposalApprovalStep, ProposalTargetAudience } from '../types/proposal.types';
import { STI_LOGO_BASE64 } from './sti-logo-asset';
import { formatDateLong } from './proposal-calculations';

export interface ExportProposalPdfOptions {
  watermarkStatus?: boolean;
  download?: boolean;
  imageLoader?: (url?: string) => Promise<string | null>;
}

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
  format: 'PNG' | 'JPEG';
}

function cleanSig(val?: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('[base64-')) return '';
  return trimmed;
}

const GENERIC_PROPOSER_NAMES = new Set([
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
  'activity proponent',
]);

function isGenericName(name?: string | null): boolean {
  const cleaned = (name || '').trim().toLowerCase();
  return !cleaned || GENERIC_PROPOSER_NAMES.has(cleaned);
}

/**
 * Format currency without the unsupported unicode peso glyph for jsPDF fonts
 */
function formatPdfAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format 24h time 'HH:mm' to 12h time 'h:mm AM/PM'
 */
function formatTime12(timeStr?: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const m = mStr ? mStr.padStart(2, '0') : '00';
  return `${h12}:${m} ${ampm}`;
}

/**
 * Cleanly format any unknown list input into string lines
 */
function toLines(input: unknown): string[] {
  if (!input) return [];
  const rawList: string[] = Array.isArray(input)
    ? input.map((item) => (typeof item === 'string' ? item : String(item)))
    : typeof input === 'string'
    ? [input]
    : [String(input)];

  return rawList
    .flatMap((item) => item.split(/\n|\s+\/\/\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Convert Target Audience object to human readable string
 */
function formatTargetMarket(aud?: ProposalTargetAudience): string {
  if (!aud) return 'All enrolled students of STI College Ormoc';
  if (aud.allStudents || aud.scope === 'all') {
    return aud.includeFaculty ? 'All STI Students, Faculty & Staff' : 'Open to all enrolled students of STI College Ormoc';
  }
  const parts: string[] = [];
  if (aud.courseCodes && aud.courseCodes.length > 0) {
    parts.push(aud.courseCodes.join(', '));
  } else if (aud.departments && aud.departments.length > 0) {
    parts.push(aud.departments.join(', '));
  }
  if (aud.yearLevels && aud.yearLevels.length > 0) {
    parts.push(aud.yearLevels.join(', '));
  }
  if (aud.academicLevels && aud.academicLevels.length > 0) {
    parts.push(aud.academicLevels.join(', '));
  }
  if (aud.customTargetMarkets && aud.customTargetMarkets.length > 0) {
    parts.push(aud.customTargetMarkets.map((c) => `${c.name} (${c.count})`).join(', '));
  }
  return parts.length > 0 ? parts.join(' - ') : 'STI College Ormoc Students';
}

/**
 * Convert sessions or date fields to readable string
 */
function formatDateAndTime(proposal: Partial<ActivityProposal>): string {
  if (proposal.sessions && proposal.sessions.length > 0) {
    return proposal.sessions
      .map((s) => {
        const d = s.date ? formatDateLong(s.date) : '';
        const t = s.startTime && s.endTime ? ` (${formatTime12(s.startTime)} – ${formatTime12(s.endTime)})` : '';
        const titlePrefix = s.title ? `${s.title}: ` : '';
        return `${titlePrefix}${d}${t}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }
  const d = proposal.date ? formatDateLong(proposal.date) : '';
  const t = proposal.startTime && proposal.endTime ? ` (${formatTime12(proposal.startTime)} – ${formatTime12(proposal.endTime)})` : '';
  return `${d}${t}`.trim() || 'To be announced';
}

/**
 * Fetch and convert an image URL or dataURL into a base64 string for jsPDF
 */
async function defaultLoadImageAsDataUrl(url?: string): Promise<string | null> {
  const trimmed = cleanSig(url);
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;

  try {
    const res = await fetch(trimmed, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    }
  } catch {}

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = trimmed;
  });
}

async function resolveImageWithMetadata(
  url: string | undefined,
  loader: (url?: string) => Promise<string | null>
): Promise<LoadedImage | null> {
  const rawDataUrl = await loader(url);
  if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) return null;

  const isNativePng = rawDataUrl.startsWith('data:image/png');
  const isNativeJpeg =
    rawDataUrl.startsWith('data:image/jpeg') || rawDataUrl.startsWith('data:image/jpg');

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return {
      dataUrl: rawDataUrl,
      width: 300,
      height: 100,
      format: isNativeJpeg ? 'JPEG' : 'PNG',
    };
  }

  const loaded = await new Promise<{ dataUrl: string; w: number; h: number; format: 'PNG' | 'JPEG' }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 300;
      const h = img.naturalHeight || img.height || 100;
      if (!isNativePng && !isNativeJpeg) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ dataUrl: canvas.toDataURL('image/png'), w, h, format: 'PNG' });
            return;
          }
        } catch {}
      }
      resolve({
        dataUrl: rawDataUrl,
        w,
        h,
        format: isNativeJpeg ? 'JPEG' : 'PNG',
      });
    };
    img.onerror = () =>
      resolve({
        dataUrl: rawDataUrl,
        w: 300,
        h: 100,
        format: isNativeJpeg ? 'JPEG' : 'PNG',
      });
    img.src = rawDataUrl;
  });

  return {
    dataUrl: loaded.dataUrl,
    width: loaded.w,
    height: loaded.h,
    format: loaded.format,
  };
}

function fitDimensions(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: maxW, h: maxH };
  const ratio = Math.min(maxW / naturalW, maxH / naturalH);
  return {
    w: Math.max(1, naturalW * ratio),
    h: Math.max(1, naturalH * ratio),
  };
}

/**
 * Enrich maker & signatory digital signatures in browser environments so missing
 * or stale signature URLs are resolved from Firestore/Cloudinary profiles.
 * Dynamic imports keep Cloud Function server builds decoupled from browser Firebase.
 */
async function enrichProposalSignatures(
  proposal: Partial<ActivityProposal>
): Promise<Partial<ActivityProposal>> {
  try {
    const [
      { collection, doc, getDoc, getDocs, limit, query },
      { auth, db },
      { resolveUserSignature },
      { getSasSignatoryConfig },
      { SIGNATORIES_COLLECTION },
      { SAS_ADMINS_COLLECTION },
      { formatPersonName },
    ] = await Promise.all([
      import('firebase/firestore'),
      import('../../../../services/firebase'),
      import('../../signatories'),
      import('../../signatories/services/sas-signatory.service'),
      import('../../signatories/services/signatory.service'),
      import('../../auth/services/auth.service'),
      import('../../../utils/name.utils'),
    ]);

    const pAny = proposal as any;
    const creatorUid = pAny.submittedByUid || proposal.createdByUid || pAny.createdBy || '';
    const creatorEmail = (pAny.submittedByEmail || proposal.createdByEmail || '').trim();
    const orgIdLower = (proposal.organizationId || pAny.hostingOrgId || '').trim().toLowerCase();
    const isSasCreator =
      proposal.creatorRole === 'sas_admin' ||
      Boolean(pAny.isSasInternal) ||
      pAny.isOfficerProposal === false ||
      orgIdLower === 'sas' ||
      orgIdLower === 'sao_admin' ||
      orgIdLower === 'sao' ||
      creatorUid === 'sas_admin_user' ||
      creatorUid === 'sao_admin' ||
      (proposal.preparedBy?.roleTitle || '').toLowerCase().includes('sas') ||
      (proposal.preparedBy?.roleTitle || '').toLowerCase().includes('student affairs') ||
      creatorEmail.toLowerCase().includes('sas') ||
      creatorEmail.toLowerCase().includes('sao');

    let makerName =
      proposal.preparedBy?.name?.trim() ||
      pAny.submittedByName?.trim() ||
      proposal.createdByName?.trim() ||
      proposal.proponents?.[0]?.split('–')?.[0]?.trim() ||
      '';
    let makerRoleTitle =
      proposal.preparedBy?.roleTitle?.trim() ||
      pAny.submittedByRole?.trim() ||
      (isSasCreator
        ? 'SAS Administrator'
        : proposal.creatorRole === 'officer'
        ? 'Organization Officer'
        : 'Organization Adviser');
    let makerSig =
      cleanSig(proposal.preparedBy?.signatureUrl) ||
      cleanSig(proposal.submittedBySignatureUrl) ||
      cleanSig(pAny.signatureUrl);

    const authUid = auth.currentUser?.uid || '';
    const authEmail = (auth.currentUser?.email || '').trim();

    if ((isGenericName(makerName) || !makerSig) && isSasCreator) {
      const candidateAdminUids = Array.from(
        new Set([creatorUid, authUid].filter((u) => Boolean(u) && u !== 'sas_admin_user'))
      );
      for (const candidateUid of candidateAdminUids) {
        try {
          const adminSnap = await getDoc(doc(db, SAS_ADMINS_COLLECTION, candidateUid));
          if (adminSnap.exists()) {
            const d = adminSnap.data();
            const fullName = formatPersonName(d) || d.displayName || d.name || '';
            if (isGenericName(makerName) && !isGenericName(fullName)) makerName = fullName;
            if (d.signatoryRoleTitle || d.position) makerRoleTitle = d.signatoryRoleTitle || d.position;
            if (!makerSig) makerSig = cleanSig(d.signatureUrl) || cleanSig(d.signatureDataUrl);
            if (makerSig && !isGenericName(makerName)) break;
          }
        } catch {}
      }

      if (isGenericName(makerName) || !makerSig) {
        try {
          const adminsSnap = await getDocs(query(collection(db, SAS_ADMINS_COLLECTION), limit(10)));
          const adminDocs = adminsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          const targetEmail = (creatorEmail || authEmail).toLowerCase();
          const match =
            adminDocs.find((d) => targetEmail && (d.email || '').trim().toLowerCase() === targetEmail) ||
            adminDocs.find((d) => {
              const full = (formatPersonName(d) || d.displayName || d.name || '').trim().toLowerCase();
              return !isGenericName(makerName) && full === makerName.trim().toLowerCase();
            }) ||
            adminDocs.find((d) => Boolean(cleanSig(d.signatureUrl) || cleanSig(d.signatureDataUrl))) ||
            adminDocs[0];
          if (match) {
            const fullName = formatPersonName(match) || match.displayName || match.name || '';
            if (isGenericName(makerName) && !isGenericName(fullName)) makerName = fullName;
            if (match.signatoryRoleTitle || match.position) makerRoleTitle = match.signatoryRoleTitle || match.position;
            if (!makerSig) makerSig = cleanSig(match.signatureUrl) || cleanSig(match.signatureDataUrl);
          }
        } catch {}
      }
    }

    if ((isGenericName(makerName) || !makerSig) && isSasCreator) {
      try {
        const sasCfg = await getSasSignatoryConfig();
        if (isGenericName(makerName) && !isGenericName(sasCfg.name)) makerName = sasCfg.name;
        if (!makerRoleTitle || makerRoleTitle === 'SAS Administrator') {
          makerRoleTitle = sasCfg.roleTitle || makerRoleTitle;
        }
        if (!makerSig) makerSig = cleanSig(sasCfg.signatureUrl) || cleanSig(sasCfg.signatureDataUrl);
      } catch {}
    }

    if ((isGenericName(makerName) || !makerSig) && !isSasCreator) {
      const targetOrgId =
        (proposal.organizationId && !['sas', 'sao_admin', 'sao'].includes(orgIdLower) && proposal.organizationId) ||
        pAny.hostingOrgId ||
        '';
      if (targetOrgId) {
        try {
          const orgSnap = await getDoc(doc(db, 'organizations', targetOrgId));
          if (orgSnap.exists()) {
            const adv = orgSnap.data()?.adviser;
            if (adv) {
              const advName = adv.name || formatPersonName(adv) || '';
              if (isGenericName(makerName) && !isGenericName(advName)) makerName = advName;
              if (!makerSig) makerSig = cleanSig(adv.signatureUrl) || cleanSig(adv.signatureDataUrl);
              if (!makerSig) {
                makerSig = cleanSig(
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

    if (!makerSig) {
      try {
        makerSig = cleanSig(
          await resolveUserSignature({
            uid: creatorUid !== 'sas_admin_user' ? creatorUid : authUid,
            email: creatorEmail || (isSasCreator ? authEmail : ''),
            name: makerName,
            role: isSasCreator
              ? 'sas_admin'
              : proposal.creatorRole === 'officer'
              ? 'adviser'
              : proposal.creatorRole || makerRoleTitle,
          })
        );
      } catch {}
    }

    if (!makerSig && isSasCreator) {
      try {
        const sigSnap = await getDocs(query(collection(db, SIGNATORIES_COLLECTION), limit(25)));
        const sasMatch = sigSnap.docs
          .map((d) => d.data() as any)
          .find((d) => {
            const hasSig = Boolean(cleanSig(d.signatureUrl) || cleanSig(d.signatureDataUrl));
            if (!hasSig) return false;
            const r = (d.role || '').toLowerCase();
            return r === 'sas_coordinator' || r === 'sas_head' || r === 'sao_head' || r.includes('sas');
          });
        if (sasMatch) {
          makerSig = cleanSig(sasMatch.signatureUrl) || cleanSig(sasMatch.signatureDataUrl);
          if (isGenericName(makerName) && !isGenericName(sasMatch.name)) makerName = sasMatch.name;
        }
      } catch {}
    }

    const enrichedChain = await Promise.all(
      (proposal.approvalChain || []).map(async (step) => {
        const isSigned =
          step.status === 'endorsed' ||
          step.status === 'approved' ||
          Boolean(step.signedAt);
        if (!isSigned || cleanSig(step.signatureUrl)) return step;
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

    return {
      ...proposal,
      ...(makerSig ? { submittedBySignatureUrl: makerSig } : {}),
      preparedBy: {
        ...proposal.preparedBy,
        name: makerName || proposal.createdByName || '',
        roleTitle: makerRoleTitle,
        ...(proposal.preparedBy?.signedAt ? { signedAt: proposal.preparedBy.signedAt } : {}),
        ...(makerSig ? { signatureUrl: makerSig } : {}),
      },
      approvalChain: enrichedChain,
    };
  } catch {
    return proposal;
  }
}

/**
 * Draw `#E6E6E6` fill + diagonal stripe hatch lines matching Word `<w:shd w:val="diagStripe" w:fill="E6E6E6"/>`
 */
function fillDiagStripeCell(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(232, 232, 232);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(195, 195, 195);
  doc.setLineWidth(0.12);
  const step = 1.6;
  for (let d = -h; d < w + h; d += step) {
    const x1 = Math.max(x, x + d);
    const y1 = d < 0 ? y - d : y;
    const maxSpan = Math.min(x + w - x1, y + h - y1);
    if (maxSpan > 0.1) {
      doc.line(x1, y1, x1 + maxSpan, y1 + maxSpan);
    }
  }
}

/**
 * Main export function for official STI Form AP-01 Activity Proposal
 */
export async function exportActivityProposalPDF(
  rawProposal: Partial<ActivityProposal>,
  _options: ExportProposalPdfOptions = {}
): Promise<jsPDF> {
  try {
    const proposal =
      typeof window !== 'undefined' && !_options.imageLoader
        ? await enrichProposalSignatures(rawProposal)
        : rawProposal;

    const referenceNo = proposal.referenceNo || 'AP-2026-PENDING';

    if (_options.download !== false) {
      const { getDocxToPdfEndpoint } = await import('../../workflow/utils/docx-template-engine');
      if (getDocxToPdfEndpoint()) {
        const { tryExportActivityProposalDocxPdf } = await import('./ap-docx-populator');
        const cleanFileName = `STI_Activity_Proposal_${referenceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
        const exported = await tryExportActivityProposalDocxPdf(proposal, cleanFileName);
        if (exported) {
          return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        }
      }
    }

    // ─── US LETTER PAGE SETUP MATCHING AP_FORMAT_EMPTY.DOCX ─────────────────
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 215.9mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 279.4mm
    const marginL = 25.4; // 1.0 inch
    const marginR = 25.4; // 1.0 inch
    const topMargin = 14.5;
    const bottomLimit = pageHeight - 15.0;

    // 2-column layout matching AP_FORMAT_EMPTY.docx tblGrid (1507 : 7853 dxa)
    const col0Width = 28.0;
    const col0RightEdge = marginL + col0Width - 1.5;
    const col1X = marginL + col0Width + 1.0;
    const xRight = pageWidth - marginR; // 190.5mm
    const col1Width = xRight - col1X; // 136.1mm

    let y = topMargin;

    const ensureSpace = (neededHeight: number): void => {
      if (y + neededHeight > bottomLimit) {
        doc.addPage();
        y = topMargin;
      }
    };

    const drawCol0Label = (label: string, labelY: number): number => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(0, 0, 0);
      const lines: string[] = doc.splitTextToSize(label, col0Width - 1.5);
      let ly = labelY;
      lines.forEach((line) => {
        doc.text(line, col0RightEdge, ly, { align: 'right' });
        ly += 3.5;
      });
      return ly;
    };

    const imageLoader = _options.imageLoader || defaultLoadImageAsDataUrl;

    // Preload STI logo + maker signature + all signed chain step signatures
    const pAny = proposal as any;
    const chain: ProposalApprovalStep[] = Array.isArray(proposal.approvalChain) ? proposal.approvalChain : [];
    const makerSigUrl =
      cleanSig(proposal.preparedBy?.signatureUrl) ||
      cleanSig(proposal.submittedBySignatureUrl) ||
      cleanSig(pAny.signatureUrl);

    const [logoImg, makerSigImg, ...stepSigImgs] = await Promise.all([
      resolveImageWithMetadata(STI_LOGO_BASE64, imageLoader),
      makerSigUrl ? resolveImageWithMetadata(makerSigUrl, imageLoader) : Promise.resolve(null),
      ...chain.map((step) => {
        const isSigned =
          step.status === 'endorsed' ||
          step.status === 'approved' ||
          Boolean(step.signedAt);
        const sig = cleanSig(step.signatureUrl);
        if (!isSigned || !sig) return Promise.resolve(null);
        return resolveImageWithMetadata(sig, imageLoader);
      }),
    ]);

    // ─── 1. TOP HEADER (STI LOGO + RIGHT UNDERLINED DATE + "Activity Proposal") ─
    const submissionDate = formatDateLong(proposal.submissionDate || new Date());

    if (logoImg) {
      const fittedLogo = fitDimensions(logoImg.width, logoImg.height, 36.0, 11.2);
      try {
        doc.addImage(logoImg.dataUrl, logoImg.format, marginL, y - 1.5, fittedLogo.w, fittedLogo.h);
      } catch {}
    }

    const dateLineW = 42.0; // matches ~2245 dxa
    const dateLineX = xRight - dateLineW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Date:', dateLineX - 2.0, y + 6.2, { align: 'right' });

    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.text(submissionDate, dateLineX + 1.5, y + 6.2);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.line(dateLineX, y + 7.2, xRight, y + 7.2);

    y += 14.5;

    // Centered bold "Activity Proposal" (Word Title1 style = 14pt bold sans-serif)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Activity Proposal', pageWidth / 2, y, { align: 'center' });

    y += 7.5;

    // ─── 2. STANDARD FORM FIELD RENDERER (COL 0 RIGHT-ALIGNED, COL 1 TIMES) ───
    const renderField = (
      label: string,
      contentInput: string | string[],
      options: {
        boldContent?: boolean;
        skipUnderline?: boolean;
        isBullets?: boolean;
        prompt?: string;
      } = {}
    ): void => {
      if (options.isBullets) {
        const rawLines = toLines(contentInput);
        const bulletItems = rawLines
          .map((s) => s.replace(/^[\s•\-\*▪]+|^(\d+[\.\)]|\(\d+\))\s+/, '').trim())
          .filter(Boolean);

        doc.setFont('times', 'normal');
        doc.setFontSize(9.5);

        const promptHeight = options.prompt ? 4.0 : 0;
        let totalItemsHeight = 0;
        const itemLineArrays: string[][] = [];

        if (bulletItems.length === 0) {
          totalItemsHeight = 4.5;
        } else if (bulletItems.length === 1 && bulletItems[0].toLowerCase() === 'none') {
          totalItemsHeight = 4.5;
        } else {
          for (const item of bulletItems) {
            const lines = doc.splitTextToSize(item, col1Width - 7.5);
            itemLineArrays.push(lines);
            totalItemsHeight += lines.length * 3.8 + 0.8;
          }
        }

        ensureSpace(Math.min(22, promptHeight + totalItemsHeight + 3));

        drawCol0Label(label, y);

        if (options.prompt) {
          doc.setFont('times', 'italic');
          doc.setFontSize(8.2);
          doc.setTextColor(0, 0, 0);
          const pLines: string[] = doc.splitTextToSize(options.prompt, col1Width - 1);
          pLines.forEach((pl) => {
            if (y + 3.8 > bottomLimit) {
              doc.addPage();
              y = topMargin;
            }
            doc.text(pl, col1X, y);
            y += 3.8;
          });
        }

        if (bulletItems.length === 0) {
          y += 3.5;
        } else if (bulletItems.length === 1 && bulletItems[0].toLowerCase() === 'none') {
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(0, 0, 0);
          doc.text('None', col1X, y);
          y += 4.0;
        } else {
          for (let i = 0; i < bulletItems.length; i++) {
            const lines = itemLineArrays[i];
            const itemH = lines.length * 3.8 + 0.8;
            if (y + itemH > bottomLimit) {
              doc.addPage();
              y = topMargin;
              drawCol0Label(`${label} (cont.)`, y);
            }

            // Solid circular bullet point
            doc.setFillColor(0, 0, 0);
            doc.circle(col1X + 2.2, y - 1.0, 0.55, 'F');

            doc.setFont('times', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(0, 0, 0);
            lines.forEach((line) => {
              doc.text(line, col1X + 5.2, y);
              y += 3.8;
            });
            y += 0.6;
          }
          y -= 2.0;
        }

        if (!options.skipUnderline) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.22);
          doc.line(col1X, y + 0.6, xRight, y + 0.6);
        }
        y += 4.2;
        return;
      }

      doc.setFont('times', options.boldContent ? 'bold' : 'normal');
      doc.setFontSize(9.5);
      const linesArray: string[] = Array.isArray(contentInput)
        ? contentInput.flatMap((str) => doc.splitTextToSize(str, col1Width - 1.5))
        : doc.splitTextToSize(contentInput || '', col1Width - 1.5);

      const textH = Math.max(1, linesArray.length) * 3.8;
      ensureSpace(Math.min(20, textH + 4));

      const labelEndY = drawCol0Label(label, y);

      doc.setFont('times', options.boldContent ? 'bold' : 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);

      if (linesArray.length === 0) {
        y = Math.max(y + 1.0, labelEndY - 2.0);
      } else {
        for (const line of linesArray) {
          if (y + 3.8 > bottomLimit) {
            doc.addPage();
            y = topMargin;
            drawCol0Label(`${label} (cont.)`, y);
            doc.setFont('times', options.boldContent ? 'bold' : 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(0, 0, 0);
          }
          doc.text(line, col1X, y);
          y += 3.8;
        }
        y -= 2.2;
      }

      if (!options.skipUnderline) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.22);
        doc.line(col1X, y + 0.6, xRight, y + 0.6);
      }
      y += 4.2;
    };

    // ─── 3. BASIC INFORMATION ROWS (ROWS 1 TO 13) ───────────────────────────
    renderField('Activity title:', proposal.title || '', { boldContent: true });
    renderField('Description:', proposal.description || '');

    const organizersList =
      proposal.organizers && proposal.organizers.length > 0
        ? proposal.organizers.join(', ')
        : proposal.createdByName || 'Student Affairs & Services';
    renderField('Organizer/s:', organizersList);

    renderField('Objective/s:', proposal.objectives || '', { isBullets: true });
    renderField('Success indicator/s:', proposal.successIndicators || '', { isBullets: true });

    renderField('Mechanics:', proposal.mechanics || '', {
      isBullets: true,
      prompt: '(List the mechanics and/or procedures in detail. Attach sheets, if necessary.)',
    });

    renderField('Materials:', proposal.materials || '', { isBullets: true });

    renderField(
      'Target market:',
      proposal.targetMarket?.trim() ||
        proposal.targetAudience?.targetMarketSummary?.trim() ||
        formatTargetMarket(proposal.targetAudience)
    );

    const estAtt =
      proposal.estimatedAttendance ||
      (proposal.estAttendanceCount
        ? `${proposal.estAttendanceCount} ${proposal.estAttendanceQualifier || 'Participants'}`
        : '');
    renderField('Est. attendance:', estAtt);

    renderField('Marketing plan:', proposal.marketingPlan || '', { isBullets: true });
    renderField('Documentation:', proposal.documentationPlan || '', { isBullets: true });
    renderField('Date & time:', formatDateAndTime(proposal));

    const venueStr =
      proposal.customVenueName ||
      proposal.venueName ||
      proposal.sessions?.[0]?.venueName ||
      'STI College Ormoc';
    renderField('Venue:', venueStr);

    // ─── 4. ROW 14: TASK LIST (NESTED 3-COLUMN TABLE INSIDE COL 1) ───────────
    ensureSpace(26);
    drawCol0Label('Task list:', y);

    doc.setFont('times', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text('(List all involved tasks chronologically. Attach sheets, if necessary.)', col1X, y);
    y += 2.6;

    // Exact proportional split from AP_FORMAT_EMPTY.docx tblGrid (3401 : 2259 : 1967 dxa = 7627 dxa)
    const taskScale = col1Width / 7627;
    const colTaskW = Math.round(3401 * taskScale * 10) / 10;
    const colPersonW = Math.round(2259 * taskScale * 10) / 10;
    const colDateW = col1Width - colTaskW - colPersonW;

    const drawTaskHeader = (): void => {
      const headerH = 8.2;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.rect(col1X, y, colTaskW, headerH);
      doc.rect(col1X + colTaskW, y, colPersonW, headerH);
      doc.rect(col1X + colTaskW + colPersonW, y, colDateW, headerH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(0, 0, 0);
      doc.text('Task', col1X + colTaskW / 2, y + 5.0, { align: 'center' });
      doc.text('Person', col1X + colTaskW + colPersonW / 2, y + 3.5, { align: 'center' });
      doc.text('Assigned', col1X + colTaskW + colPersonW / 2, y + 6.5, { align: 'center' });
      doc.text('Date to be', col1X + colTaskW + colPersonW + colDateW / 2, y + 3.5, { align: 'center' });
      doc.text('Completed', col1X + colTaskW + colPersonW + colDateW / 2, y + 6.5, { align: 'center' });
      y += headerH;
    };

    drawTaskHeader();

    const tasks = proposal.tasks && proposal.tasks.length > 0 ? proposal.tasks : [];

    if (tasks.length === 0) {
      const emptyRowH = 5.4;
      for (let i = 0; i < 6; i++) {
        if (y + emptyRowH > bottomLimit) {
          doc.addPage();
          y = topMargin;
          drawTaskHeader();
        }
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.22);
        doc.rect(col1X, y, colTaskW, emptyRowH);
        doc.rect(col1X + colTaskW, y, colPersonW, emptyRowH);
        doc.rect(col1X + colTaskW + colPersonW, y, colDateW, emptyRowH);
        y += emptyRowH;
      }
    } else {
      tasks.forEach((t) => {
        const taskName = (t.taskName || '').trim();
        const person = (t.assignedPerson || '').trim();
        const date = t.completionDate ? formatDateLong(t.completionDate) : '—';

        doc.setFont('times', 'normal');
        doc.setFontSize(8.5);
        const tLines: string[] = doc.splitTextToSize(taskName || '—', colTaskW - 3.5);
        const pLines: string[] = doc.splitTextToSize(person || '—', colPersonW - 3.5);
        const dLines: string[] = doc.splitTextToSize(date || '—', colDateW - 3.5);

        const maxLines = Math.max(1, tLines.length, pLines.length, dLines.length);
        const rowH = Math.max(5.5, maxLines * 3.4 + 2.0);

        if (y + rowH > bottomLimit) {
          doc.addPage();
          y = topMargin;
          drawTaskHeader();
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.22);
        doc.rect(col1X, y, colTaskW, rowH);
        doc.rect(col1X + colTaskW, y, colPersonW, rowH);
        doc.rect(col1X + colTaskW + colPersonW, y, colDateW, rowH);

        doc.setFont('times', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(tLines, col1X + 1.8, y + 3.6);
        doc.text(pLines, col1X + colTaskW + 1.8, y + 3.6);
        doc.text(dLines, col1X + colTaskW + colPersonW + 1.8, y + 3.6);

        y += rowH;
      });

      if (tasks.length < 4) {
        const remaining = 4 - tasks.length;
        const emptyRowH = 5.4;
        for (let i = 0; i < remaining; i++) {
          ensureSpace(emptyRowH);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.22);
          doc.rect(col1X, y, colTaskW, emptyRowH);
          doc.rect(col1X + colTaskW, y, colPersonW, emptyRowH);
          doc.rect(col1X + colTaskW + colPersonW, y, colDateW, emptyRowH);
          y += emptyRowH;
        }
      }
    }

    y += 4.5;

    // ─── 5. ROW 15: FINANCIAL PROJECTIONS (EXACT AP_FORMAT_EMPTY.DOCX MATRIX) ─
    const fin = proposal.financialProjections || {
      revenues: [],
      expenses: [],
      totalRevenue: 0,
      totalExpenses: 0,
      balance: 0,
    };
    const isZeroBudget = proposal.fundingSource === 'zero_budget';
    const rawRevs = !isZeroBudget && Array.isArray(fin.revenues) ? fin.revenues : [];
    const rawExps = Array.isArray(fin.expenses) ? fin.expenses : [];

    ensureSpace(34);
    drawCol0Label('Financial projections:', y);

    doc.setFont('times', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text('(Anticipate all possible costs for an accurate budget proposal.)', col1X, y);
    y += 2.6;

    // Exact proportional split from AP_FORMAT_EMPTY.docx tblGrid (2603 : 973 : 970 : 1015 : 1129 : 937 = 7627 dxa)
    const finScale = col1Width / 7627;
    const fDescW = Math.round(2603 * finScale * 10) / 10;
    const fLastW = Math.round(973 * finScale * 10) / 10;
    const fThisW = Math.round(970 * finScale * 10) / 10;
    const fTotW = Math.round(1015 * finScale * 10) / 10;
    const fAdjW = Math.round(1129 * finScale * 10) / 10;
    const fRemW = col1Width - fDescW - fLastW - fThisW - fTotW - fAdjW;

    const xDesc = col1X;
    const xLast = xDesc + fDescW;
    const xThis = xLast + fLastW;
    const xTot = xThis + fThisW;
    const xAdj = xTot + fTotW;
    const xRem = xAdj + fAdjW;
    const mergedLabelW = fDescW + fLastW; // R1 Revenue, R4 Expenses, R7 Balance span first 2 columns

    const drawFinHeader = (): void => {
      const headerH = 10.5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);

      doc.rect(xDesc, y, fDescW, headerH);
      doc.rect(xLast, y, fLastW, headerH);
      doc.rect(xThis, y, fThisW, headerH);
      doc.rect(xTot, y, fTotW, headerH);
      doc.rect(xAdj, y, fAdjW, headerH);
      doc.rect(xRem, y, fRemW, headerH);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(7.5);
      doc.text('Description', xDesc + fDescW / 2, y + 6.0, { align: 'center' });

      doc.setFontSize(5.7);
      doc.text('LAST YEAR', xLast + fLastW / 2, y + 3.2, { align: 'center' });
      doc.text('ACTUAL', xLast + fLastW / 2, y + 5.8, { align: 'center' });
      doc.text('BUDGET', xLast + fLastW / 2, y + 8.4, { align: 'center' });

      doc.text('THIS YEAR', xThis + fThisW / 2, y + 3.2, { align: 'center' });
      doc.text('PROPOSED', xThis + fThisW / 2, y + 5.8, { align: 'center' });
      doc.text('BUDGET', xThis + fThisW / 2, y + 8.4, { align: 'center' });

      doc.setFontSize(6.2);
      doc.text('Total Amount', xTot + fTotW / 2, y + 6.0, { align: 'center' });

      doc.setFontSize(5.8);
      doc.text('ADJUSTMENT', xAdj + fAdjW / 2, y + 6.0, { align: 'center' });

      doc.setFontSize(6.2);
      doc.text('REMARKS', xRem + fRemW / 2, y + 6.0, { align: 'center' });

      y += headerH;
    };

    const drawFinSummaryRow = (
      title: string,
      thisYearVal: string,
      totalVal: string,
      adjVal: string,
      remarksVal = ''
    ): void => {
      const rowH = 5.6;
      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = topMargin;
        drawFinHeader();
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.rect(xDesc, y, mergedLabelW, rowH);
      doc.rect(xThis, y, fThisW, rowH);
      doc.rect(xTot, y, fTotW, rowH);
      doc.rect(xAdj, y, fAdjW, rowH);
      doc.rect(xRem, y, fRemW, rowH);

      doc.setFont('times', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(0, 0, 0);
      doc.text(title, xDesc + 1.4, y + 3.8);

      if (thisYearVal) doc.text(thisYearVal, xThis + fThisW - 1.2, y + 3.8, { align: 'right' });
      if (totalVal) doc.text(totalVal, xTot + fTotW - 1.2, y + 3.8, { align: 'right' });
      if (adjVal) doc.text(adjVal, xAdj + fAdjW - 1.2, y + 3.8, { align: 'right' });
      if (remarksVal) {
        doc.setFont('times', 'normal');
        doc.text(remarksVal, xRem + 1.2, y + 3.8);
      }
      y += rowH;
    };

    const drawFinItemRow = (item?: {
      description?: string;
      lastYearActual?: number | null;
      thisYearProposed?: number | null;
      adjustment?: number | null;
      remarks?: string;
    }): void => {
      doc.setFont('times', 'normal');
      doc.setFontSize(8.0);
      const descText = item?.description || '';
      const remText = item?.remarks || '';
      const descLines: string[] = descText ? doc.splitTextToSize(descText, fDescW - 2.6) : [];
      const remLines: string[] = remText ? doc.splitTextToSize(remText, fRemW - 2.6) : [];
      const maxLines = Math.max(1, descLines.length, remLines.length);
      const rowH = Math.max(5.2, maxLines * 3.3 + 1.8);

      if (y + rowH > bottomLimit) {
        doc.addPage();
        y = topMargin;
        drawFinHeader();
      }

      // Shaded Total Amount column matching AP_FORMAT_EMPTY.docx (diagStripe #E6E6E6)
      fillDiagStripeCell(doc, xTot, y, fTotW, rowH);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.rect(xDesc, y, fDescW, rowH);
      doc.rect(xLast, y, fLastW, rowH);
      doc.rect(xThis, y, fThisW, rowH);
      doc.rect(xTot, y, fTotW, rowH);
      doc.rect(xAdj, y, fAdjW, rowH);
      doc.rect(xRem, y, fRemW, rowH);

      doc.setFont('times', 'normal');
      doc.setFontSize(8.0);
      doc.setTextColor(0, 0, 0);
      if (descLines.length > 0) doc.text(descLines, xDesc + 1.4, y + 3.5);
      if (item?.lastYearActual !== undefined && item?.lastYearActual !== null && item.lastYearActual !== 0) {
        doc.text(formatPdfAmount(item.lastYearActual), xLast + fLastW - 1.2, y + 3.5, { align: 'right' });
      }
      if (item?.thisYearProposed !== undefined && item?.thisYearProposed !== null) {
        doc.text(formatPdfAmount(item.thisYearProposed), xThis + fThisW - 1.2, y + 3.5, { align: 'right' });
      }
      if (item?.adjustment !== undefined && item?.adjustment !== null && item.adjustment !== 0) {
        doc.text(formatPdfAmount(item.adjustment), xAdj + fAdjW - 1.2, y + 3.5, { align: 'right' });
      }
      if (remLines.length > 0) doc.text(remLines, xRem + 1.2, y + 3.5);

      y += rowH;
    };

    drawFinHeader();

    // Revenue section header row (2-col merged) + items (shaded Total Amount)
    const revThisYearSum = rawRevs.reduce((acc, r) => acc + (Number(r.thisYearProposed) || 0), 0);
    const revAdjSum = rawRevs.reduce((acc, r) => acc + (Number(r.adjustment) || 0), 0);
    const pdfAllocList = Array.isArray((proposal as any).allocations) ? (proposal as any).allocations : [];
    const pdfRevSummaryRem =
      pdfAllocList.length > 0
        ? `Allocations: ${pdfAllocList
            .map((a: any) => `${a.bucketName} (P ${formatPdfAmount(Number(a.allocatedAmount) || 0)})`)
            .join('; ')}`
        : '';
    drawFinSummaryRow(
      'Revenue:',
      rawRevs.length > 0 ? formatPdfAmount(revThisYearSum) : '',
      rawRevs.length > 0 ? formatPdfAmount(fin.totalRevenue) : '',
      rawRevs.length > 0 && revAdjSum !== 0 ? formatPdfAmount(revAdjSum) : '',
      pdfRevSummaryRem
    );

    if (rawRevs.length > 0) {
      rawRevs.forEach((rev) => {
        const matchedAlloc =
          rev.id && String(rev.id).startsWith('rev-bucket-')
            ? pdfAllocList.find((a: any) => `rev-bucket-${a.bucketId}` === rev.id)
            : undefined;
        const allocNote = matchedAlloc
          ? `Pulled Allocation: P ${formatPdfAmount(Number(matchedAlloc.allocatedAmount) || 0)}`
          : '';
        const mergedRem = [rev.remarks, allocNote].filter(Boolean).join(' • ');
        drawFinItemRow({ ...rev, remarks: mergedRem });
      });
    } else {
      drawFinItemRow();
    }

    // Expenses section header row (2-col merged) + items (shaded Total Amount)
    const expThisYearSum = rawExps.reduce((acc, e) => acc + (Number(e.thisYearProposed) || 0), 0);
    const expAdjSum = rawExps.reduce((acc, e) => acc + (Number(e.adjustment) || 0), 0);
    drawFinSummaryRow(
      'Expenses:',
      rawExps.length > 0 ? formatPdfAmount(expThisYearSum) : '',
      rawExps.length > 0 || (fin.totalExpenses ?? 0) > 0 ? formatPdfAmount(fin.totalExpenses) : '',
      rawExps.length > 0 && expAdjSum !== 0 ? formatPdfAmount(expAdjSum) : ''
    );

    if (rawExps.length > 0) {
      rawExps.forEach((exp) => drawFinItemRow(exp));
      if (rawExps.length < 2) drawFinItemRow();
    } else {
      drawFinItemRow();
      drawFinItemRow();
    }

    // Balance row (2-col merged matching AP_FORMAT_EMPTY.docx Row 7)
    const balanceVal = Number(fin.balance || 0);
    const balanceStr = `P ${balanceVal < 0 ? '-' : ''}${formatPdfAmount(Math.abs(balanceVal))}`;
    drawFinSummaryRow('Balance (Revenue less Expenses):', balanceStr, balanceStr, '');

    y += 5.0;

    // ─── 6. SIGNATORIES (Proposed by:, Endorsed by:, Approved by:) ───────────
    interface SigRenderEntry {
      name: string;
      roleTitle: string;
      img: LoadedImage | null;
      isSigned: boolean;
      status?: string;
    }

    const renderCol1SignatureSlot = (
      x: number,
      slotY: number,
      slotW: number,
      entry: SigRenderEntry
    ): number => {
      const sigBoxH = 11.5;
      if (entry.isSigned && entry.img) {
        const fitted = fitDimensions(entry.img.width, entry.img.height, Math.min(34, slotW - 4), sigBoxH - 1);
        const sigX = x + Math.max(0, (slotW - fitted.w) / 2);
        const sigY = slotY + Math.max(0, sigBoxH - fitted.h - 0.5);
        try {
          doc.addImage(entry.img.dataUrl, entry.img.format, sigX, sigY, fitted.w, fitted.h);
        } catch {}
      } else if (entry.status === 'waived') {
        doc.setFont('times', 'italic');
        doc.setFontSize(7.2);
        doc.setTextColor(110, 110, 110);
        doc.text('(Waived — Executive Clearance Granted)', x + slotW / 2, slotY + sigBoxH - 2, {
          align: 'center',
        });
      }

      const lineY = slotY + sigBoxH;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.22);
      doc.line(x, lineY, x + slotW, lineY);

      let textY = lineY + 3.6;
      if (entry.name) {
        doc.setFont('times', 'bold');
        doc.setFontSize(9.0);
        doc.setTextColor(0, 0, 0);
        const nLines: string[] = doc.splitTextToSize(entry.name, slotW);
        nLines.forEach((nl) => {
          doc.text(nl, x + slotW / 2, textY, { align: 'center' });
          textY += 3.5;
        });
      }

      if (entry.roleTitle) {
        doc.setFont('times', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(51, 65, 85);
        const rLines: string[] = doc.splitTextToSize(entry.roleTitle, slotW);
        rLines.forEach((rl) => {
          doc.text(rl, x + slotW / 2, textY, { align: 'center' });
          textY += 3.2;
        });
      }

      return textY;
    };

    const renderSignatoryGroup = (label: string, entries: SigRenderEntry[]): void => {
      const slotW = (col1Width - 8) / 2;
      if (entries.length === 0) {
        ensureSpace(22);
        drawCol0Label(label, y + 10.5);
        const endY = renderCol1SignatureSlot(col1X, y, slotW, {
          name: '',
          roleTitle: '',
          img: null,
          isSigned: false,
        });
        y = endY + 4.5;
        return;
      }

      for (let i = 0; i < entries.length; i += 2) {
        ensureSpace(25);
        if (i === 0) {
          drawCol0Label(label, y + 10.5);
        }
        const firstEndY = renderCol1SignatureSlot(col1X, y, slotW, entries[i]);
        let secondEndY = firstEndY;
        if (i + 1 < entries.length) {
          secondEndY = renderCol1SignatureSlot(col1X + slotW + 8, y, slotW, entries[i + 1]);
        }
        y = Math.max(firstEndY, secondEndY) + 4.5;
      }
    };

    // Proposed by: (Official Maker Signatory — Adviser or SAS Administrator)
    const makerName =
      proposal.preparedBy?.name ||
      proposal.createdByName ||
      proposal.proponents?.[0]?.split('–')?.[0]?.trim() ||
      '';
    const makerRole =
      proposal.preparedBy?.roleTitle ||
      (proposal.creatorRole === 'sas_admin' ? 'SAS Administrator' : 'Organization Adviser');
    const makerSigned = Boolean(makerSigImg || proposal.preparedBy?.signedAt || proposal.submissionDate);

    renderSignatoryGroup('Proposed by:', [
      {
        name: makerName,
        roleTitle: makerRole,
        img: makerSigImg,
        isSigned: makerSigned,
      },
    ]);

    if (chain.length > 0) {
      const groups: Array<{ label: string; entries: SigRenderEntry[] }> = [];
      chain.forEach((step, idx) => {
        const isLast = idx === chain.length - 1;
        const formalLabel = step.signatoryLabel || resolveSignatoryLabel(step, 'proposal', isLast);
        const existing = groups.find((g) => g.label.toLowerCase() === formalLabel.toLowerCase());
        const entry: SigRenderEntry = {
          name: step.signatoryName || 'Institutional Officer',
          roleTitle: step.roleTitle || 'Designated Signatory',
          img: stepSigImgs[idx] || null,
          isSigned:
            step.status === 'endorsed' ||
            step.status === 'approved' ||
            Boolean(step.signedAt),
          status: step.status,
        };
        if (existing) {
          existing.entries.push(entry);
        } else {
          groups.push({ label: formalLabel, entries: [entry] });
        }
      });

      for (const group of groups) {
        renderSignatoryGroup(group.label, group.entries);
      }
    } else {
      renderSignatoryGroup('Endorsed by:', []);
      renderSignatoryGroup('Approved by:', []);
    }

    // ─── 7. MANDATORY STI POLICY FOOTNOTE (VERBATIM WITH BOLD "initial task") ─
    y += 2.0;
    ensureSpace(10);

    const prefix = 'Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the ';
    const boldPart = 'initial task';
    const suffix = '.';

    doc.setFont('times', 'normal');
    doc.setFontSize(9.0);
    doc.setTextColor(0, 0, 0);

    const maxNoteW = xRight - marginL;
    const prefixW = doc.getTextWidth(prefix);
    doc.setFont('times', 'bold');
    const boldW = doc.getTextWidth(boldPart);
    doc.setFont('times', 'normal');
    const suffixW = doc.getTextWidth(suffix);

    if (prefixW + boldW + suffixW <= maxNoteW) {
      doc.setFont('times', 'normal');
      doc.text(prefix, marginL, y);
      doc.setFont('times', 'bold');
      doc.text(boldPart, marginL + prefixW, y);
      doc.setFont('times', 'normal');
      doc.text(suffix, marginL + prefixW + boldW, y);
    } else {
      const lines: string[] = doc.splitTextToSize(`${prefix}${boldPart}${suffix}`, maxNoteW);
      lines.forEach((line) => {
        doc.text(line, marginL, y);
        y += 3.8;
      });
    }

    // ─── 8. SAVE PDF FILE ─────────────────────────────────────────────────────
    const cleanFileName = `STI_Activity_Proposal_${referenceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    if (_options.download !== false && typeof window !== 'undefined' && doc.save) {
      doc.save(cleanFileName);
    }
    return doc;
  } catch (error) {
    console.error('[PDF Exporter] Error exporting Activity Proposal PDF:', error);
    throw error;
  }
}
