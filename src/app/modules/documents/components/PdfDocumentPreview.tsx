import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfDocumentPreview({ url, title }: { url: string; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDocument(null); setPage(1); setError(''); setRendering(true);
    const loading = getDocument({ url, isEvalSupported: false });
    loading.promise.then((pdf) => { if (active) setDocument(pdf); else pdf.destroy(); }).catch((error) => { if (active) { setError(error.message); setRendering(false); } });
    return () => { active = false; loading.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    document.getPage(page).then(async (pdfPage) => {
      if (!active || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      task = pdfPage.render({ canvas: canvas.current, viewport });
      await task.promise;
      if (active) setRendering(false);
    }).catch((error) => { if (active && error.name !== 'RenderingCancelledException') { setError(error.message); setRendering(false); } });
    return () => { active = false; task?.cancel(); };
  }, [document, page]);
  return <div className="rounded-lg border bg-gray-100 p-2">
    <div className="mb-2 flex items-center justify-center gap-4 text-sm"><button disabled={!document || page <= 1 || rendering} onClick={() => setPage((value) => value - 1)} className="rounded border bg-white px-3 py-1 disabled:opacity-40">Previous Page</button><span>Page {page} of {document?.numPages || '…'}</span><button disabled={!document || page >= document.numPages || rendering} onClick={() => setPage((value) => value + 1)} className="rounded border bg-white px-3 py-1 disabled:opacity-40">Next Page</button></div>
    {rendering && <p role="status" className="p-4 text-center text-sm text-gray-500">Rendering PDF…</p>}
    {error && <p role="alert" className="p-4 text-sm text-red-600">Preview unavailable: {error}. You can still download the file.</p>}
    <canvas ref={canvas} role="img" aria-label={`${title}, page ${page}`} className={`mx-auto h-auto max-w-full bg-white shadow ${rendering || error ? 'hidden' : ''}`} />
  </div>;
}
