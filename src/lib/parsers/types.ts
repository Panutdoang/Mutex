export interface Transaction {
  Tanggal: string;
  Transaksi: string;
  Pemasukan: number;
  Pengeluaran: number;
  Saldo: number;
}

export type BankParser = (lines: string[]) => Transaction[];
