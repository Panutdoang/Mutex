import { parseCurrency } from "./currency";
import type { BankParser, Transaction } from "./types";

export const isBniStatement = (lines: string[]) =>
  lines.some((line) => line.includes("PT Bank Negara Indonesia"));

export const parseBniStatement: BankParser = (lines) => {
  const transactions: Transaction[] = [];
  const dateRegex =
    /^(\d{2} (?:Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Ags|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec) \d{4})/;
  const amountRegex = /([+-][\d,.]+)\s+([\d,.]+)$/;
  let inTransactionSection = false;
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const startMarkers = [
    "Tanggal & Waktu Rincian Transaksi Nominal (IDR) Saldo (IDR)",
    "Saldo Awal",
  ];
  const endMarkers = ["Saldo Akhir", "Informasi Lainnya"];
  const noise = [
    "Laporan Mutasi Rekening",
    "PT Bank Negara Indonesia (Persero) Tbk",
    "berizin dan diawasi oleh Otoritas Jasa Keuangan",
    "peserta penjaminan Lembaga Penjamin Simpanan",
    "lanjutan dari halaman sebelumnya",
    "Periode Transaksi :",
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (startMarkers.some((marker) => trimmed.startsWith(marker))) {
      inTransactionSection = true;
      if (currentBlock.length > 0) blocks.push(currentBlock);
      currentBlock = [];
      continue;
    }

    if (
      inTransactionSection &&
      endMarkers.some((marker) => trimmed.startsWith(marker))
    ) {
      if (currentBlock.length > 0) blocks.push(currentBlock);
      inTransactionSection = false;
      continue;
    }

    if (!inTransactionSection || !trimmed) continue;

    const pageNumRegex = /^\d+\s+dari\s+\d+$/;
    if (
      noise.some((item) => trimmed.includes(item)) ||
      /halaman \d+ dari \d+/.test(trimmed.toLowerCase()) ||
      pageNumRegex.test(trimmed) ||
      /^Periode\s*:\s*\d{1,2}\s*-\s*\d{1,2}\s*\w*\s*\d{4}$/.test(trimmed)
    ) {
      continue;
    }

    if (dateRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [trimmed];
    } else if (currentBlock.length > 0) {
      currentBlock.push(trimmed);
    }
  }

  if (inTransactionSection && currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  for (const block of blocks) {
    const combinedText = block.join(" ");
    const dateMatch = combinedText.match(dateRegex);
    if (!dateMatch) continue;

    const date = dateMatch[1];
    let amountLine = "";
    let amountMatch: RegExpMatchArray | null = null;
    let amountLineIndex = -1;

    for (let i = 0; i < block.length; i++) {
      const lineAmountMatch = block[i].match(amountRegex);
      if (lineAmountMatch) {
        amountLine = block[i];
        amountMatch = lineAmountMatch;
        amountLineIndex = i;
        break;
      }
    }

    if (!amountMatch) {
      const sameLineAmountMatch = combinedText.match(amountRegex);
      if (sameLineAmountMatch) {
        amountMatch = sameLineAmountMatch;
      } else {
        continue;
      }
    }

    const nominalString = amountMatch[1];
    const saldoString = amountMatch[2];
    const pengeluaran = nominalString.startsWith("-")
      ? parseCurrency(nominalString.substring(1))
      : 0;
    const pemasukan = nominalString.startsWith("+")
      ? parseCurrency(nominalString.substring(1))
      : 0;
    const saldo = parseCurrency(saldoString);

    const descriptionLines = [...block];
    if (amountLineIndex !== -1) {
      descriptionLines.splice(amountLineIndex, 1);
    }
    let description = descriptionLines
      .join(" ")
      .replace(date, "")
      .replace(/\d{2}:\d{2}:\d{2} WIB/, "")
      .trim();
    if (amountLine === "") {
      description = description.replace(amountMatch[0], "");
    }
    description = description.replace(/\s{2,}/g, " ").trim();

    transactions.push({
      Tanggal: date,
      Transaksi: description,
      Pemasukan: pemasukan,
      Pengeluaran: pengeluaran,
      Saldo: saldo,
    });
  }

  return transactions;
};
