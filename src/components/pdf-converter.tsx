"use client";

import { useState, useCallback, DragEvent, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  FileText,
  Loader2,
  Download,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Transaction {
  Tanggal: string;
  Deskripsi: string;
  Debit: number;
  Kredit: number;
  Saldo: number;
}

const parseCurrency = (value: string): number => {
  if (!value) return 0;
  // Standardize to use '.' as decimal separator and remove thousand separators
  const cleaned = value.replace(/[\s,]/g, (match) => (match === ',' ? '.' : ''));
  return parseFloat(cleaned) || 0;
};

export default function PdfConverter() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Transaction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfjs, setPdfjs] = useState<typeof import("pdfjs-dist") | null>(null);

  useEffect(() => {
    const loadPdfJs = async () => {
        try {
            const pdfjsModule = await import("pdfjs-dist");
            pdfjsModule.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsModule.version}/build/pdf.worker.min.mjs`;
            setPdfjs(pdfjsModule);
        } catch (e) {
            console.error("Failed to load pdfjs-dist", e);
            setError("Failed to load PDF library.");
        }
    };
    if (typeof window !== "undefined") {
        loadPdfJs();
    }
  }, []);

  const parseBankStatement = useCallback((text: string) => {
    const lines = text.split("\n");
    const transactions: Transaction[] = [];
    
    // Very basic regex to find potential transaction lines.
    // This looks for a line starting with a date, followed by text, and at least two numbers.
    // This will need to be adjusted for specific bank statement formats.
    const dateRegex = /^(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/;
    const numberRegex = /[\d.,]+(?:[ \t](?:CR|DB))?/g;

    for (const line of lines) {
      if (dateRegex.test(line)) {
        const dateMatch = line.match(dateRegex);
        const date = dateMatch ? dateMatch[0] : "";
        
        const numbers = line.match(numberRegex);

        if (numbers && numbers.length >= 2) {
          // Heuristic: remove date and numbers to get description
          let description = line.replace(dateRegex, '').trim();
          numbers.forEach(num => {
            description = description.replace(num, '').trim();
          });
          description = description.replace(/\s{2,}/g, ' ').trim();

          const numericValues = numbers.map(parseCurrency);
          
          // Assumption: Last number is balance, second to last is credit/debit amount.
          // This is a common but not universal pattern.
          if (numericValues.length > 0) {
            const saldo = numericValues[numericValues.length-1];
            let debit = 0;
            let kredit = 0;

            if (numericValues.length > 1) {
                const amount = numericValues[numericValues.length-2];
                // Check for common patterns like credit/debit being in specific positions or having signs.
                // A simple guess: if balance decreases, it's a debit. If it increases, it's credit.
                // This requires tracking previous balance, which adds complexity.
                // Simpler for now: Check for "DB"/"CR" hints or assume one column is for debit, one for credit.
                // Let's assume two amount columns: DEBIT and KREDIT.
                 if(numericValues.length >= 3){
                    debit = numericValues[numericValues.length-3];
                    kredit = numericValues[numericValues.length-2];
                 } else {
                    // If only one amount column, we need to guess. A common pattern is positive for credit, negative for debit.
                    // Or check for 'CR' 'DB' text which we stripped. Let's re-check original text.
                    if (line.toUpperCase().includes("DB") || line.includes("DEBET")) {
                        debit = amount;
                    } else if (line.toUpperCase().includes("CR") || line.toUpperCase().includes("KREDIT")) {
                        kredit = amount;
                    } else {
                       // If no clear indicator, we'll put it in debit for now.
                       // This is a good place for future improvement.
                       debit = amount;
                    }
                 }
            }
            
            transactions.push({
              Tanggal: date,
              Deskripsi: description || "N/A",
              Debit: debit,
              Kredit: kredit,
              Saldo: saldo
            });
          }
        }
      }
    }
    if (transactions.length === 0) {
        setError("No transactions could be automatically extracted. The PDF format might not be supported.");
    }
    setData(transactions);
    setIsLoading(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!pdfjs) {
      setError("PDF library is still loading. Please try again in a moment.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setData([]);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) {
            setError("Could not read the file.");
            setIsLoading(false);
            return;
        }

        const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
        const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item) => ('str' in item ? item.str : '')).join(" ") + "\n";
        }

        parseBankStatement(fullText);
      };
      reader.onerror = () => {
        setError("Error reading file.");
        setIsLoading(false);
      }
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      setError("An error occurred while parsing the PDF.");
      setIsLoading(false);
    }
  }, [pdfjs, parseBankStatement]);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleDownload = () => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi");
    
    // Auto-size columns
    const cols = Object.keys(data[0]);
    const colWidths = cols.map(col => ({
      wch: Math.max(...data.map(row => row[col as keyof Transaction]?.toString().length ?? 0), col.length)
    }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "Laporan_Keuangan_Kandang_Ayam.xlsx");
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold text-primary">
          FarmFin PDF to Excel
        </CardTitle>
        <CardDescription className="text-lg">
          Sistem Laporan Keuangan Kandang Ayam
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div
          className={cn(
            "relative flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-accent/50"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            disabled={!pdfjs || isLoading}
          />
          <UploadCloud className="w-16 h-16 text-primary/80 mb-4" />
          <p className="text-lg font-semibold text-foreground">
            Drag & drop file PDF, atau klik untuk memilih
          </p>
          <p className="text-sm text-muted-foreground">
            Semua proses dilakukan di browser Anda, file tidak diupload.
          </p>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center p-8 text-primary">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="font-semibold text-lg">Memproses PDF...</p>
            <p className="text-muted-foreground">Ini mungkin butuh beberapa saat.</p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data.length > 0 && !isLoading && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-semibold text-primary">
                Preview Data ({data.length} transaksi ditemukan)
                </h3>
                <Button onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Excel
                </Button>
            </div>
            <div className="border rounded-lg max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Kredit</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium whitespace-nowrap">{row.Tanggal}</TableCell>
                      <TableCell>{row.Deskripsi}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.Debit.toLocaleString("id-ID", {minimumFractionDigits: 2})}
                      </TableCell>
                       <TableCell className="text-right font-mono">
                        {row.Kredit.toLocaleString("id-ID", {minimumFractionDigits: 2})}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.Saldo.toLocaleString("id-ID", {minimumFractionDigits: 2})}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
