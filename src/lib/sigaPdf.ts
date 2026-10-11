// Extrai o texto (com posição) de um PDF no navegador, com pdf.js. O arquivo não sai do aparelho.
import type { PdfItem } from "./siga";

export async function pdfItems(file: File): Promise<PdfItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PdfItem[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      out.push({ p, s: it.str, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), w: Math.round(it.width) });
    }
  }
  await doc.destroy();
  return out;
}
