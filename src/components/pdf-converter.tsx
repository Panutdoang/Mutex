
"use client";

import { useState, useCallback, DragEvent, useRef, useEffect, FormEvent } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  Loader2,
  Download,
  Eye,
  EyeOff,
  FileText,
  Play,
  X as XIcon,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


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

    // BNI Parser
    const bniDateRegex = /^(\d{2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4})/;
    const bniAmountRegex = /([+-][\d.,]+)\s+([\d.,]+)$/;

    // BRI Parser
    const briDateRegex = /^(\d{2}\/\d{2}\/\d{2})/;
    const briAmountRegex = /([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/;


    const isBni = allLines.some(line => line.includes('PT Bank Negara Indonesia'));
    const isBri = allLines.some(line => line.includes('LAPORAN TRANSAKSI FINANSIAL'));


    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let inTransactionSection = false;

    const bniIgnoreMarkers = [
        'PT Bank Negara Indonesia', 'Laporan Mutasi Rekening', 'Periode:',
        'Tanggal & Waktu', 'berizin dan diawasi oleh Otoritas Jasa Keuangan',
        'peserta penjaminan Lembaga Penjamin Simpanan'
    ];
    const bniEndMarkers = ['Saldo Akhir', 'Informasi Lainnya'];

    if (isBni) {
        for (const line of allLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (bniEndMarkers.some(marker => trimmed.startsWith(marker))) {
                inTransactionSection = false;
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock.join(' '));
                }
                currentBlock = [];
                break; 
            }

            if (bniIgnoreMarkers.some(marker => trimmed.includes(marker)) || /^\d+ dari \d+$/.test(trimmed)) {
                continue;
            }

            if (bniDateRegex.test(trimmed)) {
                inTransactionSection = true;
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock.join(' '));
                }
                currentBlock = [trimmed];
            } else if (inTransactionSection) {
                currentBlock.push(trimmed);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock.join(' '));
        }
        
        for (const block of blocks) {
            try {
                const dateMatch = block.match(bniDateRegex);
                if (!dateMatch) continue;
                const date = dateMatch[1];
                
                const amountMatch = block.match(bniAmountRegex);
                if (!amountMatch) continue;

                const nominalString = amountMatch[1];
                const saldoString = amountMatch[2];

                const pengeluaran = nominalString.startsWith('-') ? parseCurrency(nominalString.substring(1)) : 0;
                const pemasukan = nominalString.startsWith('+') ? parseCurrency(nominalString.substring(1)) : 0;
                const saldo = parseCurrency(saldoString);

                let description = block;
                description = description.replace(bniDateRegex, '');
                description = description.replace(bniAmountRegex, '');
                description = description.replace(/\d{2}:\d{2}:\d{2} WIB/, '');
                description = description.trim().replace(/\s{2,}/g, ' ');

                transactions.push({
                    Tanggal: date,
                    Transaksi: description,
                    Pemasukan: pemasukan,
                    Pengeluaran: pengeluaran,
                    Saldo: saldo,
                });

            } catch (e) {
                console.error("Failed to parse BNI block:", block, e);
            }
        }
    } else if (isBri) {
        let transactionLinesStarted = false;
        for (const line of allLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('Transaction Date')) {
                transactionLinesStarted = true;
                continue;
            }
            if(trimmed.startsWith('Opening Balance')){
                transactionLinesStarted = false;
                continue;
            }

            if(transactionLinesStarted && briDateRegex.test(trimmed)){
                 try {
                    const parts = trimmed.split(/\s{2,}/);
                    const dateMatch = trimmed.match(briDateRegex);
                    if(!dateMatch) continue;
                    
                    const amountPart = parts[parts.length - 1];
                    const amountMatch = amountPart.match(/([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/);
                    if(!amountMatch) continue;

                    const [_, debitStr, creditStr, balanceStr] = amountMatch;
                    
                    let description = trimmed;
                    description = description.replace(briDateRegex, '');
                    description = description.replace(amountPart, '');
                    description = description.replace(/\d{2}:\d{2}:\d{2}/, ''); // time
                    description = description.replace(/\s\d{7}\s/, ''); // teller id
                    description = description.trim();

                    transactions.push({
                        Tanggal: dateMatch[1],
                        Transaksi: description,
                        Pemasukan: parseCurrency(creditStr),
                        Pengeluaran: parseCurrency(debitStr),
                        Saldo: parseCurrency(balanceStr),
                    });

                } catch(e) {
                    console.error("Failed to parse BRI line:", line, e);
                }
            }
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
        const pdfDataForDocument = pdfData.slice(0);
        const typedArray = new Uint8Array(pdfDataForDocument);
        const pdf = await pdfjs.getDocument({ data: typedArray, password: filePassword }).promise;

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
        setIsLoading(false);
        if (err.name === 'PasswordException') {
            setPendingData(pdfData);
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
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setFileName(file.name);
      setData([]);
      setRawPdfText(null);
      setError(null);
      if(fileInputRef.current) fileInputRef.current.value = "";
      e.dataTransfer.clearData();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFileName(file.name);
      setData([]);
      setRawPdfText(null);
      setError(null);
    }
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
    <Card className="w-full shadow-xl">
      <CardHeader className="text-center">
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
            "relative flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-lg transition-colors duration-200",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-accent/50",
            selectedFile ? "cursor-default" : "cursor-pointer"
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
          {!selectedFile ? (
            <>
                <UploadCloud className="w-16 h-16 text-primary/80 mb-4" />
                <p className="text-lg font-semibold text-foreground">
                    Drag & drop file PDF, atau klik untuk memilih
                </p>
                <p className="text-sm text-muted-foreground">
                    Semua proses dilakukan di browser Anda, file tidak diupload.
                </p>
            </>
          ) : (
             <div className="text-center flex flex-col items-center">
                <FileText className="w-16 h-16 text-primary/80 mb-4" />
                <p className="text-lg font-semibold text-foreground">{fileName}</p>
                {selectedFile.size > 0 && <p className="text-sm text-muted-foreground">{Math.round(selectedFile.size / 1024)} KB</p>}
                <Button variant="ghost" size="sm" className="mt-4 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setFileName(null);
                    setData([]);
                    setRawPdfText(null);
                    setError(null);
                    if(fileInputRef.current) fileInputRef.current.value = "";
                }}>
                    <XIcon className="mr-2 h-4 w-4"/>
                    Hapus File
                </Button>
            </div>
          )}
        </div>

        {!isLoading && selectedFile && (
            <div className="flex justify-center">
                <Button onClick={() => processFile(selectedFile)} disabled={!pdfjs} size="lg">
                    <Play className="mr-2 h-4 w-4" />
                    Convert
                </Button>
            </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center p-8 text-primary">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="font-semibold text-lg">Memproses PDF...</p>
            <p className="text-muted-foreground">Ini mungkin butuh beberapa saat.</p>
          </div>
        )}

        <div className={cn("space-y-6", isLoading ? "hidden" : "block")}>
          <Accordion type="single" collapsible className="w-full" defaultValue="item-2">
            <AccordionItem value="item-1">
              <AccordionTrigger className="hover:no-underline">
                <h3 className="text-lg font-semibold text-foreground">
                  Teks Mentah dari: <span className="font-medium italic text-muted-foreground">{fileName || 'Belum ada file'}</span>
                </h3>
              </AccordionTrigger>
              <AccordionContent>
                {rawPdfText ? (
                  <div className="w-full rounded-md border bg-background">
                    <pre className="p-4 text-sm text-foreground overflow-y-auto max-h-[400px] whitespace-pre-wrap">
                      <code>{rawPdfText}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-muted-foreground">
                    <p>Unggah dan proses file PDF untuk melihat teks mentah di sini.</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
         
            <AccordionItem value="item-2">
              <AccordionTrigger className="hover:no-underline">
                <h3 className="text-lg font-semibold text-foreground">
                  Hasil Analisa ({data.length} transaksi ditemukan)
                </h3>
              </AccordionTrigger>
              <AccordionContent>
                {data.length > 0 ? (
                  <div className="space-y-4 pt-4">
                    <div className="flex justify-end items-center">
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
                            <TableHead>Transaksi</TableHead>
                            <TableHead className="text-right">Pemasukan</TableHead>
                            <TableHead className="text-right">Pengeluaran</TableHead>
                            <TableHead className="text-right">Saldo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.map((row, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium whitespace-nowrap">{row.Tanggal}</TableCell>
                              <TableCell>{row.Transaksi}</TableCell>
                              <TableCell className="text-right font-mono">
                                {row.Pemasukan.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.Pengeluaran.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.Saldo.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-muted-foreground">
                    {rawPdfText ? (
                        <Alert variant="destructive" className="w-full text-left">
                            <AlertTitle>Gagal Mengekstrak Transaksi</AlertTitle>
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
        </div>
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
                setSelectedFile(null);
                setFileName(null);
              }}>Batal</Button>
              <Button type="submit">Buka</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

    