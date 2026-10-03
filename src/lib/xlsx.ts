'use client';
// Lecture / écriture de classeurs .xlsx dans le navigateur (chargées à la demande).
import type { Sheet } from '@/core/sheet';

export async function writeSheets(sheets: Sheet[], filename: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(sheets.map((s) => ({ sheet: s.sheet, data: s.data.map((r) => r.map((c) => (c === undefined ? null : c))) })) as never).toFile(filename);
}

export async function readSheets(file: File): Promise<Sheet[]> {
  const { default: readExcelFile } = await import('read-excel-file/browser');
  return (await readExcelFile(file)) as Sheet[];
}
