/**
 * PDF rendering helper – loads pdf.js from CDN to avoid webpack ESM issues.
 * Only call from client-side code.
 */

const PDFJS_VERSION = "3.11.174";
const CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let pdfjsLib: any = null;
let loadingPromise: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function getPdfjs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    await loadScript(`${CDN_BASE}/pdf.min.js`);
    const lib = (globalThis as any).pdfjsLib;
    if (!lib) {
      throw new Error("pdfjsLib not found after loading script");
    }
    lib.GlobalWorkerOptions.workerSrc = `${CDN_BASE}/pdf.worker.min.js`;
    pdfjsLib = lib;
    return lib;
  })();

  return loadingPromise;
}

/** Load a PDF document from a URL or data */
export async function loadPdfDocument(source: string | ArrayBuffer) {
  const lib = await getPdfjs();
  return lib.getDocument(source).promise;
}

/** Render a single page to a canvas */
export async function renderPdfPage(
  pdfDoc: any,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale = 1.5
) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}
