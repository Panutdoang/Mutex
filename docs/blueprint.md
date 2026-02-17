# **App Name**: FarmFin PDF to Excel

## Core Features:

- PDF Upload Interface: Provide a responsive drag-and-drop area for users to easily upload PDF bank statement files directly within their browser.
- Client-Side PDF Parsing: Utilize 'pdfjs-dist' to securely read and extract all text content from the uploaded PDF file entirely on the user's device, ensuring financial data privacy.
- Intelligent Data Extraction & Cleaning: Implement advanced client-side logic to parse the extracted PDF text, identify patterns for Date, Description, Debit, Kredit, and Saldo. This includes a tool for text cleaning to remove headers, footers, or page numbers, and accurate separation of nominal values based on signs or 'DB'/'CR' indicators.
- Interactive Data Preview Table: Display the extracted and cleaned financial data in a structured, readable table format directly in the application UI, allowing users to review the parsed information before export.
- Excel Generation & Download: Leverage 'xlsx' or 'SheetJS' to convert the validated data from the preview table into an .xlsx file, with a 'Download Excel' button to allow users to save it with specified columns: Tanggal, Deskripsi, Debit, Kredit, Saldo.

## Style Guidelines:

- The color palette is inspired by themes of clarity and natural groundedness, reflecting both financial precision and the agricultural context. The scheme is light, prioritizing readability and a modern aesthetic.
- Primary color: A sophisticated, muted blue (#4573A1) that signifies reliability and analytical clarity, offering strong contrast against the light background.
- Background color: A very subtle, cool-toned off-white (#EEF1F3) with a hint of blue, designed to provide a spacious and clean canvas for the data and UI elements.
- Accent color: A vibrant yet harmonious cyan (#58DBDB) to draw attention to interactive elements, calls to action, and highlights, providing a fresh contrast to the primary blue.
- Body and headline font: 'Inter' (sans-serif), chosen for its exceptional readability across various screen sizes, modern aesthetic, and suitability for data-heavy financial reports, aligning with the clean UI provided by Tailwind CSS.
- Utilize a consistent set of clean, minimalist vector icons from a library like Heroicons, focusing on clarity for actions like 'upload', 'preview', and 'download' to maintain a professional and user-friendly interface.
- A responsive, single-column layout optimized for easy navigation and clear display of data on both desktop and mobile devices. The drag-and-drop area will be prominently featured at the top, followed by the preview table and action buttons.