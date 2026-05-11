# Mutex

Mutex converts Indonesian bank statement PDFs into clean Excel reports in the browser. Files are parsed client-side with `pdfjs-dist`; the app does not upload banking data to a server.

## Features

- Drag-and-drop PDF upload.
- Password-protected PDF handling.
- Raw PDF text preview for debugging unsupported formats.
- Transaction preview table.
- Excel export with `Tanggal`, `Transaksi`, `Pemasukan`, `Pengeluaran`, and `Saldo`.
- Dark/light theme and multilingual UI.

## Supported Statement Formats

- Jenius / BTPN / SMBC Indonesia
- BNI
- BRI / BRImo / BritAma
- Mandiri

Parsing is based on extracted text patterns. If a bank changes its PDF layout, add an anonymized raw text fixture in `src/lib/parsers/__fixtures__` and update the matching parser.

## Development

```bash
npm install
npm run dev
```

The app runs on `http://localhost:9002`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:parsers
npm run build
npm audit --omit=dev
```

`npm install`, `npm run dev`, and `npm run build` copy the PDF.js worker into `public/pdf.worker.min.mjs`, so the browser does not load the worker from a CDN.

## Parser Structure

- `src/lib/parsers/bank-statement.ts`: parser router.
- `src/lib/parsers/jenius.ts`: Jenius/BTPN/SMBC parser.
- `src/lib/parsers/bni.ts`: BNI parser.
- `src/lib/parsers/bri.ts`: BRI parser.
- `src/lib/parsers/mandiri.ts`: Mandiri parser.
- `src/lib/parsers/currency.ts`: currency normalization.
- `src/lib/parsers/__fixtures__`: raw text fixtures used by parser tests.
