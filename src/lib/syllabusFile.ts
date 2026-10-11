// Abre o arquivo do cronograma no navegador (Excel, Word ou PDF). Nada é enviado para fora.
import { strFromU8, unzipSync } from "fflate";
import { docxCells, docxText, guessYear, pdfText, rowsFromPdf, rowsFromTable, type RawRow } from "./syllabus";

export async function readSyllabus(file: File): Promise<{ rows: RawRow[]; year: number }> {
  const name = file.name.toLowerCase();
  const now = new Date().getFullYear();
  if (name.endsWith(".pdf")) {
    const { pdfItems } = await import("./sigaPdf");
    const items = await pdfItems(file);
    const year = guessYear(pdfText(items), now);
    return { rows: rowsFromPdf(items, year), year };
  }
  if (name.endsWith(".xls") || name.endsWith(".doc")) throw new Error("antigo");
  const z = unzipSync(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith(".xlsx")) {
    const shared = z["xl/sharedStrings.xml"] ? strFromU8(z["xl/sharedStrings.xml"]) : "";
    const { xlsxCells } = await import("./syllabus");
    // usa a aba que tiver mais aulas com data
    let best: RawRow[] = [];
    for (const k of Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))) {
      const cells = xlsxCells(strFromU8(z[k]), shared);
      const rows = rowsFromTable(cells, guessYear(cells.flat().join(" "), now));
      if (rows.filter((r) => r.date).length > best.filter((r) => r.date).length) best = rows;
    }
    return { rows: best, year: now };
  }
  if (name.endsWith(".docx")) {
    const xml = strFromU8(z["word/document.xml"]);
    const year = guessYear(docxText(xml), now);
    return { rows: rowsFromTable(docxCells(xml), year), year };
  }
  throw new Error("formato");
}
