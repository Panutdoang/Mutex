import { parseCurrency } from "./currency";
import type { BankParser, Transaction } from "./types";

export const isJeniusStatement = (lines: string[]) =>
  lines.some(
    (line) =>
      line.includes("www.jenius.com") ||
      line.includes("PT Bank BTPN Tbk") ||
      line.includes("PT Bank SMBC Indonesia Tbk")
  );

export const parseJeniusStatement: BankParser = (lines) => {
  const transactions: Transaction[] = [];
  const headerLineIndex = lines.findIndex(
    (line) =>
      line.toUpperCase().includes("AMOUNT") &&
      line.toUpperCase().includes("DETAILS")
  );

  if (headerLineIndex === -1) {
    return [];
  }

  const footerLineIndex = lines.findIndex(
    (line, index) => index > headerLineIndex && line.startsWith("Disclaimer")
  );
  const transactionLines = lines.slice(
    headerLineIndex + 1,
    footerLineIndex !== -1 ? footerLineIndex : lines.length
  );

  const dateRegex =
    /^\d{1,2} (?:Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Ags|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec) \d{4}/i;
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of transactionLines) {
    const trimmedLine = line.trim();
    const noise = [
      "TRANSACTION HISTORY",
      "DATE & TIME DETAILS NOTES AMOUNT",
      "Transaction ID | Category Transaction type",
    ];
    if (
      !trimmedLine ||
      /^\d+ of \d+$/.test(trimmedLine) ||
      noise.some((item) => trimmedLine.includes(item))
    ) {
      continue;
    }

    if (dateRegex.test(trimmedLine)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [trimmedLine];
    } else if (currentBlock.length > 0) {
      currentBlock.push(trimmedLine);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  for (const block of blocks) {
    const firstLine = block[0];
    const amountRegex = /([+-])\s+([\d,.]+)\s*$/;
    const amountMatch = firstLine.match(amountRegex);
    if (!amountMatch) continue;

    const sign = amountMatch[1];
    const amountValue = parseCurrency(amountMatch[2].replace(/,\d{2}$/, ""));
    const pemasukan = sign === "+" ? amountValue : 0;
    const pengeluaran = sign === "-" ? amountValue : 0;

    let description = firstLine.replace(amountRegex, "").trim();
    const dateMatch = description.match(dateRegex);
    if (!dateMatch) continue;
    const date = dateMatch[0];
    description = description.replace(date, "").trim();

    const notes = block
      .slice(1)
      .map((line) => {
        if (line.includes("|") || /^\d{2}:\d{2}\s*/.test(line)) return "";
        return line.trim();
      })
      .filter((line) => line.length > 0);
    const fullDescription = [description, ...notes]
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!fullDescription) continue;

    transactions.push({
      Tanggal: date,
      Transaksi: fullDescription,
      Pemasukan: pemasukan,
      Pengeluaran: pengeluaran,
      Saldo: 0,
    });
  }

  return transactions.reverse();
};
