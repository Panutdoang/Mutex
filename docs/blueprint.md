# App Name: Mutex

## Product Goal

Mutex helps users convert monthly Indonesian bank statement PDFs into spreadsheet-ready Excel reports without uploading financial data to a server.

## Core Features

- PDF upload interface: responsive drag-and-drop upload for bank statement PDF files.
- Client-side PDF parsing: use `pdfjs-dist` in the browser and load the PDF worker locally from `public/pdf.worker.min.mjs`.
- Password support: prompt users for a PDF password when the document is protected.
- Bank-specific extraction: parse raw PDF text into `Tanggal`, `Transaksi`, `Pemasukan`, `Pengeluaran`, and `Saldo`.
- Preview table: show parsed transactions before export.
- Raw text debugging: expose extracted text so unsupported formats can be diagnosed.
- Excel generation: dynamically load `exceljs` only when the user downloads an `.xlsx` report.

## Supported Banks

- Jenius / BTPN / SMBC Indonesia
- BNI
- BRI / BRImo / BritAma
- Mandiri

## Parser Maintenance

Each bank parser lives in its own module under `src/lib/parsers`. When adding or fixing a bank format:

1. Add an anonymized raw text fixture to `src/lib/parsers/__fixtures__`.
2. Update or add the bank parser module.
3. Add assertions in `src/lib/parsers/bank-statement.test.ts`.
4. Run `npm run test:parsers`, `npm run typecheck`, and `npm run build`.

## Style Guidelines

- Keep the UI focused on the working conversion flow rather than a landing page.
- Use clear upload, preview, and download states.
- Keep financial tables compact, readable, and horizontally scrollable on small screens.
- Preserve privacy messaging without implying server-side deletion, because files are processed locally in the browser.
- Use the existing muted blue/cyan theme and neumorphic shadows conservatively.
