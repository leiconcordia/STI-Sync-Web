/**
 * src/app/modules/workflow/utils/snapshot-cleaner.utils.ts
 *
 * Sanitizes and strips recursive snapshot structures, large base64 strings,
 * and historical logs from document snapshots.
 * Prevents Firestore documents from exceeding the strict 1,048,576 byte (1MB) limit.
 */

export function sanitizeCleanDocumentSnapshot(data: any): Record<string, any> {
  if (!data || typeof data !== 'object') return {};

  const clean = { ...data };

  // 1. Strip recursive nested snapshots and historical logs
  delete clean.returnedSnapshot;
  delete clean.previousSnapshot;
  delete clean.dataSnapshot;
  delete clean.snapshot;
  delete clean.proposalHistory;
  delete clean.versionHistory;
  delete clean.revisionHistory;
  delete clean.remarksHistory;

  // 2. Strip or omit raw base64 data URLs to prevent bloating the 1MB limit
  if (typeof clean.bannerImageUrl === 'string' && clean.bannerImageUrl.startsWith('data:image')) {
    clean.bannerImageUrl = '[base64-omitted-from-snapshot]';
  }

  if (typeof clean.submittedBySignatureUrl === 'string' && clean.submittedBySignatureUrl.startsWith('data:image')) {
    clean.submittedBySignatureUrl = '[base64-omitted-from-snapshot]';
  }

  if (clean.preparedBy && typeof clean.preparedBy === 'object') {
    clean.preparedBy = { ...clean.preparedBy };
    if (typeof clean.preparedBy.signatureUrl === 'string' && clean.preparedBy.signatureUrl.startsWith('data:image')) {
      clean.preparedBy.signatureUrl = '[base64-omitted-from-snapshot]';
    }
  }

  if (Array.isArray(clean.approvalChain)) {
    clean.approvalChain = clean.approvalChain.map((step: any) => {
      const cleanStep = { ...step };
      if (typeof cleanStep.signatureUrl === 'string' && cleanStep.signatureUrl.startsWith('data:image')) {
        cleanStep.signatureUrl = '[base64-omitted-from-snapshot]';
      }
      return cleanStep;
    });
  }

  if (clean.financialProjections && typeof clean.financialProjections === 'object') {
    clean.financialProjections = { ...clean.financialProjections };
    if (Array.isArray(clean.financialProjections.expenses)) {
      clean.financialProjections.expenses = clean.financialProjections.expenses.map((exp: any) => {
        const cleanExp = { ...exp };
        if (typeof cleanExp.receiptUrl === 'string' && cleanExp.receiptUrl.startsWith('data:image')) {
          cleanExp.receiptUrl = '[receipt-base64-omitted]';
        }
        return cleanExp;
      });
    }
  }

  if (Array.isArray(clean.photos)) {
    clean.photos = clean.photos.map((p: any) => {
      if (typeof p === 'string' && p.startsWith('data:image')) {
        return '[base64-photo-omitted]';
      }
      if (p && typeof p === 'object' && typeof p.url === 'string' && p.url.startsWith('data:image')) {
        return { ...p, url: '[base64-photo-omitted]' };
      }
      return p;
    });
  }

  if (Array.isArray(clean.documents)) {
    clean.documents = clean.documents.map((d: any) => {
      if (typeof d === 'string' && d.startsWith('data:')) {
        return '[doc-base64-omitted]';
      }
      if (d && typeof d === 'object') {
        const cleanDoc = { ...d };
        if (typeof cleanDoc.fileData === 'string' && cleanDoc.fileData.startsWith('data:')) {
          cleanDoc.fileData = '[doc-base64-omitted]';
        }
        if (typeof cleanDoc.url === 'string' && cleanDoc.url.startsWith('data:')) {
          cleanDoc.url = '[doc-base64-omitted]';
        }
        return cleanDoc;
      }
      return d;
    });
  }

  return clean;
}

