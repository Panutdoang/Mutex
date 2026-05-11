import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBankStatement, parseCurrency } from "./bank-statement";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const fixture = (name: string) => readFileSync(join(fixtureDir, name), "utf8");

const tests: Array<[string, () => void]> = [
  [
    "parseCurrency handles Indonesian and US-style separators",
    () => {
      assert.equal(parseCurrency("1.234.567,89"), 1234567.89);
      assert.equal(parseCurrency("1,234,567.89"), 1234567.89);
      assert.equal(parseCurrency("250000"), 250000);
    },
  ],
  [
    "parses Jenius raw text fixture",
    () => {
      const rows = parseBankStatement(fixture("jenius.txt"));

      assert.equal(rows.length, 2);
      assert.equal(rows[0].Tanggal, "2 Jan 2026");
      assert.equal(rows[0].Pemasukan, 1500000);
      assert.equal(rows[1].Pengeluaran, 25000);
    },
  ],
  [
    "parses BNI raw text fixture",
    () => {
      const rows = parseBankStatement(fixture("bni.txt"));

      assert.equal(rows.length, 2);
      assert.equal(rows[0].Transaksi, "Transfer Masuk");
      assert.equal(rows[0].Pemasukan, 500000);
      assert.equal(rows[1].Pengeluaran, 25000);
      assert.equal(rows[1].Saldo, 1475000);
    },
  ],
  [
    "parses BRI raw text fixture",
    () => {
      const rows = parseBankStatement(fixture("bri.txt"));

      assert.equal(rows.length, 2);
      assert.equal(rows[0].Pemasukan, 500000);
      assert.equal(rows[1].Pengeluaran, 25000);
      assert.equal(rows[1].Saldo, 1475000);
    },
  ],
  [
    "parses BRI Indonesian amount fixture across Saldo Awal sections",
    () => {
      const rows = parseBankStatement(fixture("bri-id-format.txt"));

      assert.equal(rows.length, 4);
      assert.equal(rows[0].Pemasukan, 500000);
      assert.equal(rows[1].Pengeluaran, 25000);
      assert.equal(rows[2].Pemasukan, 100000);
      assert.equal(rows[3].Pengeluaran, 50000);
      assert.equal(rows[3].Saldo, 1525000);
    },
  ],
  [
    "parses BRI financial transaction report rows across pages",
    () => {
      const rows = parseBankStatement(fixture("bri-financial-transaction-report.txt"));

      assert.equal(rows.length, 38);
      assert.equal(rows[0].Tanggal, "01/04/26");
      assert.equal(rows[0].Pengeluaran, 2500000);
      assert.equal(rows[15].Transaksi.includes("Muhammad Faruq Al Bara"), true);
      assert.equal(rows[15].Pengeluaran, 6350000);
      assert.equal(rows[37].Transaksi, "Transfer Dari Tutusobi La via BRImo");
      assert.equal(rows[37].Pemasukan, 3500000);
      assert.equal(rows[37].Saldo, 24166970.4);
    },
  ],
  [
    "parses Mandiri raw text fixture",
    () => {
      const rows = parseBankStatement(fixture("mandiri.txt"));

      assert.equal(rows.length, 2);
      assert.equal(rows[0].Pemasukan, 500000);
      assert.equal(rows[1].Pengeluaran, 25000);
      assert.equal(rows[1].Saldo, 1475000);
    },
  ],
];

for (const [name, test] of tests) {
  test();
  console.log(`PASS ${name}`);
}
