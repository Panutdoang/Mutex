
"use client";

import { useState, useCallback, DragEvent, useRef, useEffect, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  Loader2,
  Download,
  Eye,
  EyeOff,
  X as XIcon,
  FileCheck2,
  Sun,
  Moon,
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
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";


interface Transaction {
  Tanggal: string;
  Transaksi: string;
  Pemasukan: number;
  Pengeluaran: number;
  Saldo: number;
}

const parseCurrency = (value: string): number => {
    if (!value) return 0;
    // Handle Indonesian format: 1.234.567,89 -> remove dots, replace comma with dot
    if (value.includes(',') && value.includes('.')) {
        const lastDot = value.lastIndexOf('.');
        const lastComma = value.lastIndexOf(',');
        if (lastComma > lastDot) {
            return parseFloat(value.replace(/\./g, '').replace(',', '.'));
        }
    }
    // Handle US format: 1,234,567.89 -> remove commas
    return parseFloat(value.replace(/,/g, ''));
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isSuccess = useRef(false);
  const isMobile = useIsMobile();

  const handleThemeChange = (theme: 'light' | 'dark') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const mainContainer = document.querySelector('#main-container');
    const shouldLockScroll = data.length === 0;

    if (shouldLockScroll && !isMobile) {
      document.body.style.overflow = 'hidden';
      if (mainContainer) {
        mainContainer.classList.remove('justify-start');
        mainContainer.classList.add('justify-center');
      }
    } else {
      document.body.style.overflow = 'auto';
      if (mainContainer) {
        mainContainer.classList.remove('justify-center');
        mainContainer.classList.add('justify-start');
      }
    }

    return () => {
      document.body.style.overflow = 'auto';
       if (mainContainer) {
        mainContainer.classList.remove('justify-center');
        mainContainer.classList.add('justify-start');
      }
    };
  }, [data.length, isMobile]);


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

    const isBni = allLines.some(line => line.includes('PT Bank Negara Indonesia'));
    const isBri = allLines.some(line => line.includes('LAPORAN TRANSAKSI FINANSIAL'));

    if (isBni) {
        const bniDateRegex = /^(\d{2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4})/;
        const bniAmountRegex = /([+-][\d,.]+)\s+([\d,.]+)$/;
        
        let inTransactionSection = false;
        let blocks: string[][] = [];
        let currentBlock: string[] = [];

        const startMarkers = ['Tanggal & Waktu Rincian Transaksi Nominal (IDR) Saldo (IDR)', 'Saldo Awal'];
        const endMarkers = ['Saldo Akhir', 'Informasi Lainnya'];

        for (const line of allLines) {
            const trimmed = line.trim();
            if (startMarkers.some(marker => trimmed.startsWith(marker))) {
                inTransactionSection = true;
                if(currentBlock.length > 0) blocks.push(currentBlock);
                currentBlock = [];
                continue;
            }
            if (endMarkers.some(marker => trimmed.startsWith(marker))) {
                if (currentBlock.length > 0) blocks.push(currentBlock);
                inTransactionSection = false;
                break;
            }
            if (!inTransactionSection || !trimmed || trimmed.includes('peserta penjaminan Lembaga Penjamin Simpanan')) continue;
            
            if (bniDateRegex.test(trimmed)) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                }
                currentBlock = [trimmed];
            } else if (currentBlock.length > 0) {
                currentBlock.push(trimmed);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }

        for (const block of blocks) {
            let combinedText = block.join(' ');
            const dateMatch = combinedText.match(bniDateRegex);
            if (!dateMatch) continue;

            const date = dateMatch[1];
            
            let amountLine = '';
            let amountMatch: RegExpMatchArray | null = null;
            let amountLineIndex = -1;

            for(let i = 0; i < block.length; i++) {
                const lineAmountMatch = block[i].match(bniAmountRegex);
                if (lineAmountMatch) {
                    amountLine = block[i];
                    amountMatch = lineAmountMatch;
                    amountLineIndex = i;
                    break;
                }
            }

            if (!amountMatch) {
                const sameLineAmountMatch = combinedText.match(bniAmountRegex);
                if(sameLineAmountMatch){
                    amountMatch = sameLineAmountMatch;
                } else {
                    continue;
                }
            }
            
            const nominalString = amountMatch[1];
            const saldoString = amountMatch[2];

            const pengeluaran = nominalString.startsWith('-') ? parseCurrency(nominalString.substring(1)) : 0;
            const pemasukan = nominalString.startsWith('+') ? parseCurrency(nominalString.substring(1)) : 0;
            const saldo = parseCurrency(saldoString);

            let descriptionLines = [...block];
            if(amountLineIndex !== -1) {
                descriptionLines.splice(amountLineIndex, 1);
            }
            let description = descriptionLines.join(' ')
                .replace(date, '')
                .replace(/\d{2}:\d{2}:\d{2} WIB/, '')
                .trim();
            if (amountMatch && amountLine === '') { 
                description = description.replace(amountMatch[0], '');
            }

            description = description.replace(/\s{2,}/g, ' ').trim();

            transactions.push({
                Tanggal: date,
                Transaksi: description,
                Pemasukan: pemasukan,
                Pengeluaran: pengeluaran,
                Saldo: saldo,
            });
        }
    } else if (isBri) {
        let inTransactionSection = false;
        const briDateRegex = /^(\d{2}\/\d{2}\/\d{2})/;

        for (const line of allLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.includes('Transaction Date') && trimmed.includes('Description')) {
                inTransactionSection = true;
                continue;
            }
             if (trimmed.startsWith('Opening Balance') || trimmed.startsWith('Saldo Awal')) {
                inTransactionSection = false;
                continue; 
            }

            if (inTransactionSection && briDateRegex.test(trimmed)) {
                try {
                    const dateMatch = trimmed.match(briDateRegex);
                    if (!dateMatch) continue;
                    
                    const date = dateMatch[1];
                    const lineContent = trimmed;

                    // Regex to robustly find debit, credit, and balance at the end of the line
                    const amountRegex = /(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d[\d.,]*)$/;
                    const amountMatch = lineContent.match(amountRegex);

                    if (amountMatch) {
                        const [fullAmountMatch, debitStr, creditStr, balanceStr] = amountMatch;
                        
                        let description = lineContent.substring(0, lineContent.indexOf(fullAmountMatch)).trim();
                        
                        description = description.replace(briDateRegex, '').trim();
                        description = description.replace(/^\d{2}:\d{2}:\d{2}\s+/, '').trim();
                        
                        // Clean up teller ID from the end of the description
                        description = description.replace(/\s\d{7,8}$/, '').trim();

                        transactions.push({
                            Tanggal: date,
                            Transaksi: description,
                            Pemasukan: parseCurrency(creditStr),
                            Pengeluaran: parseCurrency(debitStr),
                            Saldo: parseCurrency(balanceStr),
                        });
                    }
                } catch (e) {
                    console.error("Failed to parse BRI line:", line, e);
                }
            }
        }
    }


    setData(transactions);
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
    
    const originalPdfData = pdfData.slice(0);

    try {
        const typedArray = new Uint8Array(pdfData);
        const pdf = await pdfjs.getDocument({ data: typedArray, password: filePassword }).promise;
        isSuccess.current = true;

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            if (!textContent.items) {
                continue;
            }

            const lines: { [y: number]: { x: number, text: string }[] } = {};
            textContent.items.forEach((item: any) => {
                if (!('str' in item) || !item.str.trim()) {
                    return;
                }
                const y = Math.round(item.transform[5]);
                if (!lines[y]) {
                    lines[y] = [];
                }
                lines[y].push({ x: Math.round(item.transform[4]), text: item.str });
            });
            
            const pageLines = Object.keys(lines)
                .map(y => parseInt(y, 10))
                .sort((a, b) => b - a)
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
        if (err.name === 'PasswordException') {
            isSuccess.current = false;
            const bufferCopy = originalPdfData.slice(0);
            setPendingData(bufferCopy);
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
    } finally {
      setIsLoading(false);
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

  useEffect(() => {
    if (selectedFile) {
        processFile(selectedFile);
    }
  }, [selectedFile, processFile]);

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pendingData) {
      const pendingDataCopy = pendingData.slice(0);
      parsePdf(pendingDataCopy, password);
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
      const file = e.dataTransfer.files[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFile(file);
      e.dataTransfer.clearData();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
    }
  };

  const handleClearFile = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedFile(null);
      setFileName(null);
      setData([]);
      setRawPdfText(null);
      setError(null);
      setIsLoading(false);
      setPendingData(null);
      setIsPasswordDialogOpen(false);
      setPassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const handleDownload = () => {
    const dataForSheet = data.map(row => ({
      'Tanggal': row.Tanggal,
      'Transaksi': row.Transaksi,
      'Pemasukan': row.Pemasukan,
      'Pengeluaran': row.Pengeluaran,
      'Saldo': row.Saldo
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi");
    
    if (dataForSheet.length > 0) {
        const cols = Object.keys(dataForSheet[0]);
        const colWidths = cols.map(col => {
            const key = col as keyof (typeof dataForSheet)[0];
            return {
              wch: Math.max(
                ...dataForSheet.map(row => row[key]?.toString().length ?? 0), 
                key.length
              )
            }
        });
        worksheet["!cols"] = colWidths;
    }

    XLSX.writeFile(workbook, "Mutex_Report.xlsx");
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center relative">
        <Button variant="ghost" size="icon" className="absolute top-4 left-4" onClick={() => handleThemeChange('light')}>
            <Sun className="h-6 w-6 text-muted-foreground" />
            <span className="sr-only">Light mode</span>
        </Button>
        <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={() => handleThemeChange('dark')}>
            <Moon className="h-6 w-6 text-muted-foreground" />
            <span className="sr-only">Dark mode</span>
        </Button>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-primary mb-2">
          <svg
            role="img"
            aria-label="Mutex Logo"
            className="h-7 w-7 text-primary-foreground"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M2 22V2h5l5 9 5-9h5v20h-5V8l-5 9-5-9v14H2z" />
          </svg>
        </div>
        <CardTitle className="text-3xl font-bold text-primary">
          Mutex
        </CardTitle>
        <CardDescription className="text-lg">
          PDF Bank Mutation to Excel Converter
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div
          className={cn(
            "relative flex flex-col items-center justify-center w-full min-h-[200px] p-12 rounded-lg transition-all duration-200 shadow-neumorphic-inset",
            isDragging ? "bg-primary/10" : "",
            !selectedFile && !isLoading && "cursor-pointer"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !selectedFile && !isLoading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            disabled={!pdfjs || isLoading}
          />

          {isLoading && (
            <div className="flex flex-col items-center justify-center text-primary">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-semibold text-lg">Memproses PDF...</p>
              <p className="text-muted-foreground">Ini mungkin butuh beberapa saat.</p>
            </div>
          )}
          
          {!isLoading && !selectedFile && (
             <div className="text-center flex flex-col items-center">
                <UploadCloud className="w-16 h-16 text-primary/80 mb-4" />
                <p className="text-lg font-semibold text-foreground">
                    Drag & drop file PDF, atau klik untuk memilih
                </p>
                <p className="text-sm text-muted-foreground">
                    Semua proses dilakukan di browser Anda, file tidak diupload.
                </p>
            </div>
          )}

          {!isLoading && selectedFile && (
            <div className="text-center flex flex-col items-center">
                <FileCheck2 className="w-16 h-16 text-green-500 mb-4" />
                <p className="text-lg font-semibold text-foreground">
                    File Berhasil Diproses!
                </p>
                 <p className="text-sm text-muted-foreground mb-4 px-4 break-all text-center max-w-full">
                    {fileName}
                </p>
                <Button variant="outline" size="sm" onClick={handleClearFile}>
                    <XIcon className="mr-2 h-4 w-4"/>
                    Proses File Lain
                </Button>
            </div>
          )}
        </div>

        {error && (
            <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        <div className={"space-y-6"}>
          <Accordion type="single" collapsible className="w-full" defaultValue={data.length > 0 ? "item-2" : undefined}>
            <AccordionItem value="item-1">
              <AccordionTrigger className="hover:no-underline text-left">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                  <span className="text-base sm:text-lg font-semibold text-foreground">
                    Teks Mentah dari:
                  </span>
                  <span className="text-sm sm:text-base font-medium italic text-muted-foreground break-all">
                    {fileName || 'Belum ada file'}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {rawPdfText ? (
                  <div className="w-full rounded-md bg-background shadow-neumorphic-inset">
                    <pre className="p-4 text-sm text-foreground overflow-auto max-h-[400px] whitespace-pre-wrap">
                      <code>{rawPdfText}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-md shadow-neumorphic-inset p-8 text-muted-foreground">
                    <p>Unggah dan proses file PDF untuk melihat teks mentah di sini.</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
         
            <AccordionItem value="item-2">
              <AccordionTrigger className="hover:no-underline text-left">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">
                    Hasil Analisa ({data.length} transaksi ditemukan)
                  </h3>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {data.length > 0 ? (
                    <div className="rounded-lg shadow-neumorphic-inset p-2 max-h-[500px] overflow-scroll">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow className="border-b-0">
                            <TableHead className="text-xs rounded-tl-lg whitespace-nowrap">Tanggal</TableHead>
                            <TableHead className="text-xs">Transaksi</TableHead>
                            <TableHead className="text-right text-xs whitespace-nowrap">Pemasukan</TableHead>
                            <TableHead className="text-right text-xs whitespace-nowrap">Pengeluaran</TableHead>
                            <TableHead className="text-right text-xs rounded-tr-lg whitespace-nowrap">Saldo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.map((row, index) => (
                            <TableRow key={index} className="border-t">
                              <TableCell className="font-medium text-xs select-none whitespace-nowrap">{row.Tanggal}</TableCell>
                              <TableCell className="text-xs select-none">{row.Transaksi}</TableCell>
                              <TableCell className="text-right font-mono text-xs select-none whitespace-nowrap">
                                {row.Pemasukan > 0 ? row.Pemasukan.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                }) : "0.00"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs select-none whitespace-nowrap">
                                {row.Pengeluaran > 0 ? row.Pengeluaran.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                }) : "0.00"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs select-none whitespace-nowrap">
                                {row.Saldo.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                ) : (
                  <div className="flex items-center justify-center rounded-md shadow-neumorphic-inset p-8 text-muted-foreground">
                    {selectedFile && !isLoading ? (
                        <Alert variant="default" className="w-full text-left bg-transparent shadow-none">
                            <AlertTitle>Tidak ada transaksi yang ditemukan</AlertTitle>
                            <AlertDescription>
                                Aplikasi tidak dapat menemukan transaksi dari teks mentah. Formatnya mungkin tidak didukung.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <p>Tabel hasil konversi akan muncul di sini setelah diproses.</p>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {data.length > 0 && (
            <div className="flex justify-center">
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={isPasswordDialogOpen} onOpenChange={(isOpen) => {
        if (!isOpen) {
            if (isSuccess.current) {
                isSuccess.current = false;
            } else {
                handleClearFile({ stopPropagation: () => {} } as React.MouseEvent);
            }
        }
        setIsPasswordDialogOpen(isOpen);
      }}>
        <DialogContent className="w-[95vw] rounded-lg sm:w-full sm:max-w-[425px]">
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
              <Button type="button" variant="secondary" className="mt-2 sm:mt-0" onClick={() => setIsPasswordDialogOpen(false)}>Batal</Button>
              <Button type="submit">Buka</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
