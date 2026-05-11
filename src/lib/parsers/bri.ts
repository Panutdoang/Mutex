import { parseCurrency } from "./currency";
import type { BankParser, Transaction } from "./types";

export const isBriStatement = (lines: string[]) =>
  lines.some(
    (line) =>
      line.includes("PT. BANK RAKYAT INDONESIA") ||
      line.includes("via BRImo") ||
      line.startsWith("IBIZ_") ||
      line.includes("BritAma")
  );

export const parseBriStatement: BankParser = (lines) => {
  const transactionLines: string[] = [];
  let inTransactionSection = false;
  const startMarkers = [
    "Transaction Description",
    "Tanggal Transaksi Uraian Transaksi",
    "Tanggal Transaksi Uraian",
  ];
  const endMarkers = ["Saldo Akhir", "Total Mutasi"];
  const pageHeaderMarker = "Tanggal Transaksi Uraian Transaksi";
  const footerSignature = "IBIZ_";

  for (const line of lines) {
    const trimmed = line.trim();

    if (startMarkers.some((marker) => line.includes(marker))) {
      inTransactionSection = true;
      continue;
    }

    if (inTransactionSection && endMarkers.some((marker) => line.includes(marker))) {
      inTransactionSection = false;
      continue;
    }

    if (inTransactionSection) {
      if (
        !trimmed ||
        line.includes(pageHeaderMarker) ||
        line.startsWith(footerSignature) ||
        /Halaman \d+ dari \d+/.test(line) ||
        /^Saldo Awal\b/i.test(trimmed) ||
        /^No\.?\s+Rekening\b/i.test(trimmed) ||
        /^Periode\b/i.test(trimmed)
      ) {
        continue;
      }
      transactionLines.push(line);
    }
  }

  const sectionTransactions = parseBriTransactionLines(transactionLines);
  const fullDocumentTransactions = parseBriTransactionLines(
    lines.filter((line) => isPotentialTransactionLine(line))
  );

  return mergeTransactions(sectionTransactions, fullDocumentTransactions);
};

const dateRegex = /^\d{2}\/\d{2}\/(?:\d{2}|\d{4})/;
const dateTimeRegex = /^\d{2}\/\d{2}\/(?:\d{2}|\d{4})(?:\s+\d{2}:\d{2}:\d{2})?/;
const amountPattern = String.raw`(?:\d{1,3}(?:[.,]\d{3})*|\d+)[,.]\d{2}`;
const amountRegex = new RegExp(
  `(${amountPattern})\\s+(${amountPattern})\\s+(${amountPattern})`,
  "g"
);

const isPotentialTransactionLine = (line: string) => {
  const trimmed = line.trim();

  if (!trimmed) return false;
  if (dateRegex.test(trimmed)) return true;

  return !isBriNoiseLine(trimmed);
};

const isBriNoiseLine = (line: string) => {
  const summaryAmountRowRegex = new RegExp(
    `^${amountPattern}(?:\\s+${amountPattern}){1,}$`
  );

  return (
    summaryAmountRowRegex.test(line) ||
    /^BRI$/i.test(line) ||
    /^LAPORAN TRANSAKSI FINANSIAL/i.test(line) ||
    /^STATEMENT OF FINANCIAL TRANSACTION/i.test(line) ||
    /^Halaman \d+ dari \d+/i.test(line) ||
    /^Page \d+ of \d+/i.test(line) ||
    /^Tanggal Transaksi\b/i.test(line) ||
    /^Transaction Date\b/i.test(line) ||
    /^Uraian Transaksi\b/i.test(line) ||
    /^Transaction Description\b/i.test(line) ||
    /^Teller\b/i.test(line) ||
    /^User ID\b/i.test(line) ||
    /^Debet\b/i.test(line) ||
    /^Debit\b/i.test(line) ||
    /^Kredit\b/i.test(line) ||
    /^Credit\b/i.test(line) ||
    /^Saldo\b/i.test(line) ||
    /^Balance\b/i.test(line) ||
    /^Saldo Awal\b/i.test(line) ||
    /^Opening Balance\b/i.test(line) ||
    /^Saldo Akhir\b/i.test(line) ||
    /^Closing Balance\b/i.test(line) ||
    /^Total Transaksi\b/i.test(line) ||
    /^Total Debit Transaction\b/i.test(line) ||
    /^Total Credit Transaction\b/i.test(line) ||
    /^No\.?\s+Rekening\b/i.test(line) ||
    /^Account No\b/i.test(line) ||
    /^Periode\b/i.test(line) ||
    /^Transaction Period\b/i.test(line) ||
    /^Created By\b/i.test(line) ||
    /^Kepada Yth\./i.test(line) ||
    /^To\s*:/i.test(line)
  );
};

const parseBriTransactionLines = (transactionLines: string[]) => {
  const transactions: Transaction[] = [];
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of transactionLines) {
    const trimmed = line.trim();
    if (isBriNoiseLine(trimmed)) continue;

    if (dateRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [trimmed];
    } else if (currentBlock.length > 0) {
      currentBlock.push(trimmed);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  for (const block of blocks) {
    const combinedText = block.join(" ").replace(/\s{2,}/g, " ").trim();
    const dateMatch = combinedText.match(dateRegex);
    const amountMatches = [...combinedText.matchAll(amountRegex)];
    const amountMatch = amountMatches.at(-1);

    if (!dateMatch || !amountMatch) continue;

    const date = dateMatch[0];
    const debitStr = amountMatch[1];
    const creditStr = amountMatch[2];
    const balanceStr = amountMatch[3];
    let description = combinedText;
    description = description.replace(dateTimeRegex, "").replace(amountMatch[0], "").trim();
    description = description.replace(/^\d{2}:\d{2}:\d{2}\s/, "").trim();
    description = description.replace(/\b\d{6,8}\b/g, "").trim();
    description = description.replace("BANK NEGARA INDONESIA - PT", "BANK BNI");
    description = description
      .replace(/\(PERSERO.*?\)/g, "")
      .replace(/\(PERSERO\b/g, "");
    description = description.replace(
      "BANK MANDIRI (PERSERO), PT",
      "BANK MANDIRI"
    );
    description = description.replace(/\s{2,}/g, " ").trim();

    transactions.push({
      Tanggal: date,
      Transaksi: description,
      Pemasukan: parseCurrency(creditStr),
      Pengeluaran: parseCurrency(debitStr),
      Saldo: parseCurrency(balanceStr),
    });
  }

  return transactions;
};

const mergeTransactions = (...transactionGroups: Transaction[][]) => {
  const merged = new Map<string, Transaction>();

  for (const transactions of transactionGroups) {
    for (const transaction of transactions) {
      const key = [
        transaction.Tanggal,
        transaction.Transaksi,
        transaction.Pemasukan,
        transaction.Pengeluaran,
        transaction.Saldo,
      ].join("|");
      merged.set(key, transaction);
    }
  }

  return [...merged.values()];
};
