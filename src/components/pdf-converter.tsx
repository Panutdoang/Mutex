"use client";

import { useState, useCallback, DragEvent, useRef, useEffect, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  Loader2,
  Download,
  Eye,
  EyeOff,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
    const standard = value.replace(/\s/g, '');
    const hasComma = standard.includes(',');
    const hasDot = standard.includes('.');

    // If no separators, or only one type that isn't a decimal separator for sure
    if (!hasComma && !hasDot) return parseFloat(standard);
    
    // Only commas, treat as thousand separators (e.g., 1,234,567)
    if (hasComma && !hasDot) return parseFloat(standard.replace(/,/g, ''));
    
    // Only dots, could be ambiguous (1.234 vs 1.23)
    if (hasDot && !hasComma) {
        // If more than 2 digits after the last dot, it's likely a thousands separator (e.g. 1.234.567)
        if (standard.substring(standard.lastIndexOf('.') + 1).length > 2) {
            return parseFloat(standard.replace(/\./g, ''));
        }
        // Otherwise, it's likely a decimal separator (e.g. 123.45)
        return parseFloat(standard);
    }

    // Both comma and dot exist, determine format by last separator
    const lastDot = standard.lastIndexOf('.');
    const lastComma = standard.lastIndexOf(',');

    if (lastComma > lastDot) {
      // Indonesian format: 1.234,56
      return parseFloat(standard.replace(/\./g, '').replace(',', '.'));
    } else {
      // US format: 1,234.56
      return parseFloat(standard.replace(/,/g, ''));
    }
};

export default function PdfConverter() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Transaction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingData, setPendingData] = useState<ArrayBuffer | null>(null);
  const [rawPdfText, setRawPdfText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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
    const allLines = text.split('\n');
    const transactions: Transaction[] = [];

    const dateRegex = /^(\d{2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4})/;
    
    // Find transaction blocks first
    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let inHeader = true;

    for (const line of allLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip header lines until we see the first transaction date
        if (inHeader && !dateRegex.test(trimmed)) {
            continue;
        }
        
        // This is the start of the first or a new transaction
        if (dateRegex.test(trimmed)) {
            inHeader = false; // We are now in the transaction list
            if (currentBlock.length > 0) {
                blocks.push(currentBlock.join(' '));
            }
            currentBlock = [trimmed];
        } else if (!inHeader) {
            // Ignore common page footers and headers that might appear mid-page
            if (trimmed.startsWith('PT Bank Negara Indonesia') || /^\d+ dari \d+$/.test(trimmed) || trimmed.startsWith('Laporan Mutasi Rekening') || trimmed.startsWith('Periode:') || trimmed.startsWith('Tanggal & Waktu')) {
                continue;
            }
            currentBlock.push(trimmed);
        }
    }
    // Add the last block
    if (currentBlock.length > 0) {
        blocks.push(currentBlock.join(' '));
    }
    
    for (const block of blocks) {
        try {
            const dateMatch = block.match(dateRegex);
            if (!dateMatch) continue;

            const date = dateMatch[1];
            
            // For BNI, the amounts are together, like `+28,620,000 48,068,577` or `-2,500 33,866,077`
            const amountMatch = block.match(/([+-][\d,.]+) ([\d,.]+)/);
            if (!amountMatch) continue;

            const nominalString = amountMatch[1];
            const saldoString = amountMatch[2];

            const debit = nominalString.startsWith('-') ? parseCurrency(nominalString.substring(1)) : 0;
            const kredit = nominalString.startsWith('+') ? parseCurrency(nominalString.substring(1)) : 0;
            const saldo = parseCurrency(saldoString);

            let description = block;
            description = description.replace(dateRegex, ''); // remove date
            description = description.replace(amountMatch[0], ''); // remove amounts
            description = description.replace(/\d{2}:\d{2}:\d{2} WIB/, ''); // remove time
            description = description.trim().replace(/\s{2,}/g, ' ');

            transactions.push({
                Tanggal: date,
                Deskripsi: description,
                Debit: debit,
                Kredit: kredit,
                Saldo: saldo,
            });

        } catch (e) {
            console.error("Failed to parse block:", block, e);
            continue;
        }
    }

    setData(transactions);
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
            const pdfDataForPassword = pdfData.slice(0);
            setPendingData(pdfDataForPassword);
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
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
        if (!e.target?.result) {
            setError("Could not read the file.");
            setIsLoading(false);
            return;
        }
        const fileData = e.target.result as ArrayBuffer;
        await parsePdf(fileData);
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
          <div className="w-full space-y-2 pt-4">
            <h3 className="text-lg font-semibold text-foreground">
              Teks Mentah dari: <span className="font-medium italic text-muted-foreground">{fileName}</span>
            </h3>
            <div className="w-full rounded-md border bg-background">
              <pre className="p-4 text-sm text-foreground overflow-auto max-h-[400px]">
                <code>{rawPdfText}</code>
              </pre>
            </div>
          </div>
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

        {!isLoading && rawPdfText && data.length === 0 && (
            <div className="w-full space-y-2 pt-4">
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password..."
                  autoFocus
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-0 flex items-center h-full px-3"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">
                    {showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  </span>
                </Button>
              </div>
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
