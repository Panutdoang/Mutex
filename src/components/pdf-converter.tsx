"use client";

import { useState, useCallback, DragEvent, useRef, useEffect, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  const standard = value.replace(/\s/g, ''); // remove spaces
  const lastDot = standard.lastIndexOf('.');
  const lastComma = standard.lastIndexOf(',');

  if (lastComma > lastDot) {
    // Indonesian format: 1.234,56 -> 1234.56
    return parseFloat(standard.replace(/\./g, '').replace(',', '.'));
  } else if (lastDot > lastComma) {
    // US format: 1,234.56 -> 1234.56
    return parseFloat(standard.replace(/,/g, ''));
  } else {
    // No separators or only one kind (e.g. 1,234)
    return parseFloat(standard.replace(/,/g, ''));
  }
};

export default function PdfConverter() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Transaction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfjs, setPdfjs] = useState<typeof import("pdfjs-dist") | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingData, setPendingData] = useState<ArrayBuffer | null>(null);
  const [rawPdfText, setRawPdfText] = useState<string | null>(null);

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
    const lines = text.split("\n").filter(line => line.trim() !== '');
    const transactions: Transaction[] = [];
    let previousBalance: number | null = null;
    
    const dateRegex = /^\d{2}[\/.-]\d{2}(?:[\/.-]\d{2,4})?/;
    const numberRegex = /[\d,.-]+/g;

    // First pass: find initial balance
    for (const line of lines) {
        if (/SALDO AWAL|Previous Balance/i.test(line)) {
            const numbers = line.match(numberRegex);
            if (numbers && numbers.length > 0) {
                previousBalance = parseCurrency(numbers[numbers.length - 1]);
                break;
            }
        }
    }

    // Second pass: process transactions
    for (const line of lines) {
      if (dateRegex.test(line)) {
        const dateMatch = line.match(dateRegex);
        if (!dateMatch) continue;

        const date = dateMatch[0].replace(/-/g, '/');
        
        const numbers = line.match(numberRegex);
        
        if (numbers && numbers.length >= 1) { // Need at least a balance
          const parsedNumbers = numbers.map(parseCurrency);

          const saldo = parsedNumbers[parsedNumbers.length - 1];
          
          let debit = 0;
          let kredit = 0;
          let amountIsGuessed = false;
          
          if (previousBalance !== null) {
            const diff = saldo - previousBalance;
            const tolerance = 0.01;
            
            if (diff > tolerance) {
              kredit = diff;
            } else if (diff < -tolerance) {
              debit = -diff;
            }
          } else {
             amountIsGuessed = true;
             if (parsedNumbers.length >= 2) {
                const amount = parsedNumbers[parsedNumbers.length - 2];
                if (line.toUpperCase().includes('CR')) {
                    kredit = amount;
                } else {
                    debit = amount; // Default to debit
                }
             }
          }

          if (!amountIsGuessed && (debit > 0 || kredit > 0)) {
            const actualAmount = debit > 0 ? debit : kredit;
            const transactionCandidates = parsedNumbers.slice(0, parsedNumbers.length - 1);
            
            const closestMatch = transactionCandidates.find(p => Math.abs(p - actualAmount) < 0.01);
            
            if (closestMatch !== undefined) {
                if (debit > 0) debit = closestMatch;
                if (kredit > 0) kredit = closestMatch;
            }
          }

          let description = line;
          description = description.replace(dateRegex, '').trim();
          numbers.forEach(numStr => {
            description = description.replace(numStr, '');
          });
          description = description.replace(/\s+(CR|DB)\s*$/i, '').trim().replace(/\s{2,}/g, ' ');

          transactions.push({
            Tanggal: date,
            Deskripsi: description || "N/A",
            Debit: debit,
            Kredit: kredit,
            Saldo: saldo
          });

          previousBalance = saldo;
        }
      }
    }
    
    if (transactions.length > 0) {
        setData(transactions);
        setError(null);
    }
    setIsLoading(false);
  }, []);

  const parsePdf = useCallback(async (pdfData: ArrayBuffer, filePassword?: string) => {
    if (!pdfjs) {
        setError("PDF library is still loading. Please try again in a moment.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setData([]);
    setRawPdfText(null);

    try {
        const pdfDataCopy = pdfData.slice(0);
        const typedArray = new Uint8Array(pdfDataCopy);
        const pdf = await pdfjs.getDocument({ data: typedArray, password: filePassword }).promise;

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            if (!textContent.items) {
                continue;
            }

            // Group text items by their Y-coordinate to reconstruct lines
            const lines: { [y: number]: { x: number, text: string }[] } = {};
            textContent.items.forEach((item: any) => {
                if (!('str' in item) || !item.str.trim()) {
                    return;
                }
                // Round Y to group items on the same line
                const y = Math.round(item.transform[5]);
                if (!lines[y]) {
                    lines[y] = [];
                }
                // Store text and its X position for later sorting
                lines[y].push({ x: Math.round(item.transform[4]), text: item.str });
            });
            
            // Sort lines by Y-coordinate (top to bottom), then sort text within each line by X-coordinate (left to right)
            const pageLines = Object.keys(lines)
                .map(y => parseInt(y, 10))
                .sort((a, b) => b - a) // PDF Y-coordinates can be top-to-bottom or bottom-to-top, descending is safer
                .map(y => lines[y]
                    .sort((a, b) => a.x - b.x)
                    .map(item => item.text)
                    .join(' ')
                );
                
            fullText += pageLines.join('\n') + '\n';
        }

        setRawPdfText(fullText);
        parseBankStatement(fullText);
        setIsPasswordDialogOpen(false);
        setPendingData(null);
        setPassword("");

    } catch (err: any) {
        setIsLoading(false);
        if (err.name === 'PasswordException') {
            setPendingData(pdfData.slice(0));
            setIsPasswordDialogOpen(true);
            if (filePassword) {
                setError("Password salah. Silakan coba lagi.");
            } else {
                setError("File ini dilindungi password. Silakan masukkan password.");
            }
        } else {
            console.error(err);
            setError("An error occurred while parsing the PDF: " + err.message);
        }
    }
  }, [pdfjs, parseBankStatement]);

  const processFile = useCallback((file: File) => {
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
    setRawPdfText(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
        if (!e.target?.result) {
            setError("Could not read the file.");
            setIsLoading(false);
            return;
        }
        const fileData = e.target.result as ArrayBuffer;
        await parsePdf(fileData.slice(0));
    };
    reader.onerror = () => {
        setError("Error reading file.");
        setIsLoading(false);
    }
    reader.readAsArrayBuffer(file);
  }, [pdfjs, parsePdf]);

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pendingData) {
      parsePdf(pendingData, password);
    }
  };

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

        {!isLoading && rawPdfText && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Tampilkan Teks Mentah dari PDF</AccordionTrigger>
              <AccordionContent>
                <pre className="mt-2 w-full overflow-auto rounded-md bg-slate-800 p-4 text-sm text-white">
                  <code>{rawPdfText}</code>
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {!isLoading && data.length === 0 && rawPdfText && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gagal Mengekstrak Transaksi</AlertTitle>
            <AlertDescription>
              Aplikasi tidak dapat menemukan transaksi apa pun. Silakan periksa "Teks Mentah dari PDF" di atas untuk memverifikasi bahwa file Anda terbaca dengan benar. Formatnya mungkin tidak didukung.
            </AlertDescription>
          </Alert>
        )}
        
        {!isLoading && data.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-semibold text-primary">
                Hasil Analisa ({data.length} transaksi ditemukan)
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

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handlePasswordSubmit}>
            <DialogHeader>
              <DialogTitle>Password Diperlukan</DialogTitle>
              <DialogDescription>
                {error}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password..."
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => {
                setIsPasswordDialogOpen(false);
                setError(null);
                setIsLoading(false);
              }}>Batal</Button>
              <Button type="submit">Buka</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
