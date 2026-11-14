/**
 * Shared DOCX Template Populator & PDF Bridge Engine
 *
 * Loads `.docx` templates from `/templates/*.docx`, injects text/loop data via
 * `docxtemplater` + `pizzip` and digital signature PNGs via
 * `docxtemplater-image-module-free`, and optionally converts the exact populated
 * `.docx` to a 1:1 `.pdf` through `VITE_DOCX_TO_PDF_URL`.
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// @ts-ignore - docxtemplater-image-module-free ships without .d.ts declarations
import RawImageModule from 'docxtemplater-image-module-free';

const ImageModuleConstructor: any = (RawImageModule as any)?.default || RawImageModule;

export interface ResolvedSignatureImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Fetches an external or inline data-URI signature image, normalizes to a
 * base64 data URL, and measures its fitted dimensions in pixels (max 130x38px).
 */
export async function resolveSignatureDataUrl(
  url?: string,
  maxWidthPx = 130,
  maxHeightPx = 38
): Promise<ResolvedSignatureImage | null> {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();

  let dataUrl: string | null = trimmed.startsWith('data:image/') ? trimmed : null;

  if (!dataUrl) {
    try {
      const res = await fetch(trimmed, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        dataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      dataUrl = null;
    }
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    dataUrl = await new Promise<string | null>((resolve) => {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 240;
          canvas.height = img.naturalHeight || img.height || 80;
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

  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;

  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ w: maxWidthPx, h: maxHeightPx });
      return;
    }
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || img.width || maxWidthPx,
        h: img.naturalHeight || img.height || maxHeightPx,
      });
    img.onerror = () => resolve({ w: maxWidthPx, h: maxHeightPx });
    img.src = dataUrl!;
  });

  const ratio = Math.min(maxWidthPx / Math.max(1, dims.w), maxHeightPx / Math.max(1, dims.h));
  return {
    dataUrl,
    widthPx: Math.max(24, Math.round(dims.w * ratio)),
    heightPx: Math.max(16, Math.round(dims.h * ratio)),
  };
}

function base64DataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Loads a `.docx` template URL and populates all `{placeholder}`, `{#loop}`,
 * and `{%signatureImage}` tags cleanly using `docxtemplater`.
 */
export async function populateDocxTemplate(
  templateUrl: string,
  data: Record<string, any>,
  imageDimensions: Map<string, [number, number]> = new Map()
): Promise<Blob> {
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`Failed to load Word template at ${templateUrl} (HTTP ${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);

  const imageModule = new ImageModuleConstructor({
    centered: false,
    fileType: 'docx',
    getImage(tagValue: string) {
      return base64DataUrlToUint8Array(tagValue);
    },
    getSize(_img: Uint8Array, tagValue: string) {
      return imageDimensions.get(tagValue) || [120, 36];
    },
  });

  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() {
      return '';
    },
  });

  doc.render(data);
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function getDocxToPdfEndpoint(): string | null {
  try {
    const raw = (import.meta as any).env?.VITE_DOCX_TO_PDF_URL;
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    return null;
  }
}

function triggerPdfDownload(blob: Blob, fileName: string): void {
  const safeName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Populates a `.docx` template and sends the populated `.docx` to a configured
 * server-side DOCX->PDF converter (`VITE_DOCX_TO_PDF_URL`, e.g. LibreOffice /
 * Gotenberg / ConvertAPI proxy) so the downloaded file is a 1:1 PDF of the Word
 * layout. Returns `false` if no converter endpoint is configured so callers can
 * safely fall back to client-side jsPDF without adding a `.docx` button.
 */
export async function tryConvertPopulatedDocxToPdf(
  templateUrl: string,
  data: Record<string, any>,
  imageDimensions: Map<string, [number, number]>,
  pdfFileName: string
): Promise<boolean> {
  const endpoint = getDocxToPdfEndpoint();
  if (!endpoint) return false;

  try {
    const populatedDocxBlob = await populateDocxTemplate(templateUrl, data, imageDimensions);
    const formData = new FormData();
    formData.append(
      'file',
      populatedDocxBlob,
      pdfFileName.replace(/\.pdf$/i, '') + '.docx'
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      console.warn(`[DOCX->PDF] Converter returned HTTP ${res.status}; falling back to jsPDF.`);
      return false;
    }

    const pdfBlob = await res.blob();
    if (!pdfBlob || pdfBlob.size === 0) {
      console.warn('[DOCX->PDF] Converter returned empty PDF; falling back to jsPDF.');
      return false;
    }

    triggerPdfDownload(pdfBlob, pdfFileName);
    return true;
  } catch (err) {
    console.warn('[DOCX->PDF] Conversion failed; falling back to jsPDF:', err);
    return false;
  }
}
