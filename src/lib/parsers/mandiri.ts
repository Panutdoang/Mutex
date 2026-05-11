import { parseCurrency } from "./currency";
import type { BankParser, Transaction } from "./types";

export const isMandiriStatement = (lines: string[]) =>
  lines.some((line) => line.includes("PT Bank Mandiri (Persero) Tbk."));

export const parseMandiriStatement: BankParser = (lines) => {
  const transactions: Transaction[] = [];
  let inTransactionSection = false;
  const transactionLines: string[] = [];
  const startMarkers = [
    "No Date Remarks Amount (IDR) Balance (IDR)",
    "No Tanggal Keterangan Nominal (IDR) Saldo (IDR)",
  ];
  const endMarker = "ini adalah batas akhir transaksi anda";
  const headerAndFooterJunk = [
    "PT Bank Mandiri (Persero) Tbk.",
    "Mandiri Call 14000",
    "e-Statement",
    "Menara Mandiri 1 Jalan Jenderal Sudirman",
    "serta merupakan peserta penjamin Lembaga Penjamin Simpanan (LPS)",
    "Nama/ Name :",
    "Cabang/ Branch :",
    ...startMarkers,
  ];

  for (const line of lines) {
    if (!inTransactionSection && startMarkers.some((marker) => line.includes(marker))) {
      inTransactionSection = true;
      continue;
    }

    if (inTransactionSection && line.startsWith(endMarker)) {
      break;
    }

    if (inTransactionSection) {
      const trimmedLine = line.trim();
      const isJunk =
        headerAndFooterJunk.some((junk) => trimmedLine.includes(junk)) ||
        /^\d+\s+(of|dari)\s+\d+$/.test(trimmedLine) ||
        /^Dicetak pada\//.test(trimmedLine) ||
        /^Periode\//.test(trimmedLine);
      if (trimmedLine && !isJunk) {
        transactionLines.push(trimmedLine);
      }
    }
  }

  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  const mainLineRegex = /^\d+\s+.*/;
  const amountRegexForMainLine = /[+\-]\s*[\d.,]+,\d{2}\s+[\d.,]+,\d{2}$/;

  for (const line of [...transactionLines].reverse()) {
    const isMainLine = mainLineRegex.test(line) && amountRegexForMainLine.test(line);
    if (isMainLine) {
      if (currentBlock.length > 0) {
        blocks.unshift(currentBlock);
      }
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.unshift(currentBlock);
  }

  const dateRegex =
    /\d{2} (?:Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Ags|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec) \d{4}/i;
  const amountRegex = /([+\-]\s*[\d.,]+,\d{2})\s+([\d.,]+,\d{2})$/;
  const anchorRegex = /^\d+\s+/;
  const timeRegex = /\d{2}:\d{2}:\d{2} WIB/;

  for (const block of blocks) {
    const dateLine = block.find((line) => dateRegex.test(line));
    if (!dateLine) continue;

    const mainLine = block.find(
      (line) => anchorRegex.test(line) && amountRegex.test(line)
    );
    if (!mainLine) continue;

    const amountMatch = mainLine.match(amountRegex);
    if (!amountMatch) continue;

    const nominalStr = amountMatch[1].replace(/\s/g, "");
    const saldoStr = amountMatch[2];
    const pemasukan = nominalStr.startsWith("+")
      ? parseCurrency(nominalStr.substring(1))
      : 0;
    const pengeluaran = nominalStr.startsWith("-")
      ? parseCurrency(nominalStr.substring(1))
      : 0;
    const saldo = parseCurrency(saldoStr);

    const allTextParts = block
      .map((line) => {
        if (line === dateLine || timeRegex.test(line)) {
          return "";
        }
        if (line === mainLine) {
          return mainLine.replace(anchorRegex, "").replace(amountRegex, "").trim();
        }
        return line.trim();
      })
      .filter(Boolean);
    const transaksi = allTextParts.join(" ").replace(/\s{2,}/g, " ").trim();

    if (!transaksi) continue;

    transactions.push({
      Tanggal: dateLine,
      Transaksi: transaksi,
      Pemasukan: pemasukan,
      Pengeluaran: pengeluaran,
      Saldo: saldo,
    });
  }

  return transactions;
};
