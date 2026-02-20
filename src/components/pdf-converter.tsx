
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
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { locales } from "@/lib/locales";


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
     // Handle format like 1,234,567.89 (US) or 1.234.567,89 (ID)
    return parseFloat(value.replace(/\./g, '').replace(',', '.'));
};


export default function PdfConverter() {
  const [data, setData] = useState<Transaction[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingData, setPendingData] = useState<ArrayBuffer | null>(null);
  const [rawPdfText, setRawPdfText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<keyof typeof locales>("Bahasa Indonesia");
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const isSuccess = useRef(false);
  const isMobile = useIsMobile();
  const t = locales[selectedLanguage];
  const languages = Object.keys(locales);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const mainContainer = document.querySelector('#main-container');

    document.body.style.overflow = 'auto';
    if (mainContainer) {
      mainContainer.classList.remove('justify-center');
      mainContainer.classList.add('justify-start');
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);


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

    const isJenius = allLines.some(line => line.includes('www.jenius.com') || line.includes('PT Bank BTPN Tbk') || line.includes('PT Bank SMBC Indonesia Tbk'));
    const isBni = allLines.some(line => line.includes('PT Bank Negara Indonesia'));
    const isBri = allLines.some(l => l.includes('PT. BANK RAKYAT INDONESIA') || l.includes('via BRImo') || l.startsWith('IBIZ_') || allLines.some(l => l.includes("BritAma")));
    const isMandiri = allLines.some(l => l.includes('PT Bank Mandiri (Persero) Tbk.'));

    if (isJenius) {
        const headerLineIndex = allLines.findIndex(l => 
            l.toUpperCase().includes("AMOUNT") && l.toUpperCase().includes("DETAILS")
        );

        if (headerLineIndex === -1) {
            setData([]);
            return;
        }

        const footerLineIndex = allLines.findIndex((l, i) => 
            i > headerLineIndex && l.startsWith("Disclaimer")
        );

        const transactionLines = allLines.slice(
            headerLineIndex + 1,
            footerLineIndex !== -1 ? footerLineIndex : allLines.length
        );

        const jeniusDateRegex = /^\d{1,2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4}/i;
        const blocks: string[][] = [];
        let currentBlock: string[] = [];

        for (const line of transactionLines) {
            const trimmedLine = line.trim();
            const noise = ["TRANSACTION HISTORY", "DATE & TIME DETAILS NOTES AMOUNT", "Transaction ID | Category Transaction type"];
            if (!trimmedLine || /^\d+ of \d+$/.test(trimmedLine) || noise.some(n => trimmedLine.includes(n))) {
                continue;
            }
            
            if (jeniusDateRegex.test(trimmedLine)) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                }
                currentBlock = [trimmedLine];
            } else if (currentBlock.length > 0) {
                currentBlock.push(trimmedLine);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }
        
        for (const block of blocks) {
            try {
                if (block.length < 1) continue;
        
                const firstLine = block[0];
                const amountRegex = /([+-])\s+([\d,.]+)$/;
                const amountMatch = firstLine.match(amountRegex);
        
                if (!amountMatch) continue;
        
                const sign = amountMatch[1];
                const amountValue = parseCurrency(amountMatch[2]);
                const pemasukan = sign === '+' ? amountValue : 0;
                const pengeluaran = sign === '-' ? amountValue : 0;
        
                let description = firstLine.replace(amountRegex, '').trim();
                const dateMatch = description.match(jeniusDateRegex);
                if (!dateMatch) continue;
                const date = dateMatch[0];
                description = description.replace(date, '').trim();
        
                const notes = block.slice(1)
                    .map(line => {
                        if (line.includes('|')) return '';
                        return line.replace(/^\d{2}:\d{2}\s*/, '').trim();
                    })
                    .filter(line => line.length > 0);
        
                const fullDescription = [description, ...notes].join(' ').replace(/\s{2,}/g, ' ').trim();
                
                if (!fullDescription) continue;
                
                transactions.push({
                    Tanggal: date,
                    Transaksi: fullDescription,
                    Pemasukan: pemasukan,
                    Pengeluaran: pengeluaran,
                    Saldo: 0,
                });
            } catch (e) {
                console.error("Failed to parse Jenius block:", block.join('\n'), e);
            }
        }
        transactions.reverse();

    } else if (isBni) {
        const bniDateRegex = /^(\d{2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4})/;
        const bniAmountRegex = /([+-][\d,.]+)\s+([\d,.]+)$/;
        
        let inTransactionSection = false;
        let blocks: string[][] = [];
        let currentBlock: string[] = [];

        const startMarkers = ['Tanggal & Waktu Rincian Transaksi Nominal (IDR) Saldo (IDR)', 'Saldo Awal'];
        const endMarkers = ['Saldo Akhir', 'Informasi Lainnya'];
        const noise = [
            'Laporan Mutasi Rekening',
            'PT Bank Negara Indonesia (Persero) Tbk',
            'berizin dan diawasi oleh Otoritas Jasa Keuangan',
            'peserta penjaminan Lembaga Penjamin Simpanan',
            'lanjutan dari halaman sebelumnya',
            'Periode Transaksi :'
        ];

        for (const line of allLines) {
            const trimmed = line.trim();

            if (startMarkers.some(marker => trimmed.startsWith(marker))) {
                inTransactionSection = true;
                if(currentBlock.length > 0) blocks.push(currentBlock);
                currentBlock = [];
                continue;
            }

            if (inTransactionSection && endMarkers.some(marker => trimmed.startsWith(marker))) {
                if (currentBlock.length > 0) blocks.push(currentBlock);
                inTransactionSection = false;
                continue;
            }

            if (!inTransactionSection || !trimmed) continue;
            
            const pageNumRegex = /^\d+\s+dari\s+\d+$/;
            if (noise.some(n => trimmed.includes(n)) || /halaman \d+ dari \d+/.test(trimmed.toLowerCase()) || pageNumRegex.test(trimmed) || /^Periode\s*:\s*\d{1,2}\s*-\s*\d{1,2}\s*\w*\s*\d{4}$/.test(trimmed)) {
                continue;
            }
            
            if (bniDateRegex.test(trimmed)) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                }
                currentBlock = [trimmed];
            } else if (currentBlock.length > 0) {
                currentBlock.push(trimmed);
            }
        }
        if (inTransactionSection && currentBlock.length > 0) {
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
        let transactionLines: string[] = [];
        let inTransactionSection = false;

        const startMarker = "Transaction Description";
        const endMarker = "Saldo Awal";
        const pageHeaderMarker = "Tanggal Transaksi Uraian Transaksi";
        const footerSignature = "IBIZ_";
        
        for (const line of allLines) {
            if (line.includes(startMarker)) {
                inTransactionSection = true;
                continue;
            }
            if (line.includes(endMarker)) {
                inTransactionSection = false;
                continue;
            }
            if (inTransactionSection) {
                 if (!line.trim() || line.includes(pageHeaderMarker) || line.startsWith(footerSignature) || /Halaman \d+ dari \d+/.test(line)) continue;
                transactionLines.push(line);
            }
        }
        
        const blocks: string[][] = [];
        let currentBlock: string[] = [];
        const dateRegex = /^\d{2}\/\d{2}\/\d{2}/;

        for (const line of transactionLines) {
            const trimmed = line.trim();
            if (dateRegex.test(trimmed)) {
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
        
        const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})$/;

        for (const block of blocks) {
            if (block.length === 0) continue;

            const combinedText = block.join(' ').replace(/\s{2,}/g, ' ').trim();
            
            const dateMatch = combinedText.match(dateRegex);
            const amountMatch = combinedText.match(amountRegex);

            if (dateMatch && amountMatch) {
                const date = dateMatch[0];
                const debitStr = amountMatch[1];
                const creditStr = amountMatch[2];
                const balanceStr = amountMatch[3];
                
                let description = combinedText;
                description = description.replace(dateRegex, '').replace(amountRegex, '').trim();
                description = description.replace(/^\d{2}:\d{2}:\d{2}\s/, '').trim();
                description = description.replace(/\s\d{7,8}$/, '').trim(); // remove teller id
                
                description = description.replace('BANK NEGARA INDONESIA - PT', 'BANK BNI');
                description = description.replace(/\(PERSERO.*?\)/g, '').replace(/\(PERSERO\b/g, '');
                description = description.replace('BANK MANDIRI (PERSERO), PT', 'BANK MANDIRI');

                description = description.replace(/\s{2,}/g, ' ').trim();

                transactions.push({
                    Tanggal: date,
                    Transaksi: description,
                    Pemasukan: parseCurrency(creditStr),
                    Pengeluaran: parseCurrency(debitStr),
                    Saldo: parseCurrency(balanceStr),
                });
            }
        }
    } else if (isMandiri) {
        let inTransactionSection = false;
        const transactionLines: string[] = [];
        const startMarker = 'No Date Remarks Amount (IDR) Balance (IDR)';
        const endMarker = 'ini adalah batas akhir transaksi anda';
        const repeatedHeader = 'No Tanggal Keterangan Nominal (IDR) Saldo (IDR)';
        const footerJunk = 'PT Bank Mandiri (Persero) Tbk.';
    
        for (const line of allLines) {
            if (!inTransactionSection && line.includes(startMarker)) {
                inTransactionSection = true;
                continue;
            }
            if (inTransactionSection && line.startsWith(endMarker)) {
                inTransactionSection = false;
                break; 
            }
            if (inTransactionSection) {
                if (line.trim() && !line.includes(repeatedHeader) && !line.includes(footerJunk) && !line.includes('Mandiri Call 14000')) {
                    transactionLines.push(line);
                }
            }
        }
    
        const blocks: string[][] = [];
        let currentBlock: string[] = [];
        
        const anchorRegex = /^\d+\s+/;
        
        for (const line of transactionLines) {
            if (anchorRegex.test(line.trim())) {
                if (currentBlock.length > 0) {
                    blocks.push(currentBlock);
                }
                currentBlock = [line];
            } else {
                currentBlock.push(line);
            }
        }
        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
        }

        const dateRegex = /\d{2} (?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Ags|Agu|Sep|Okt|Nov|Des) \d{4}/;
        const amountRegex = /([+\-][\d.,]+,\d{2})\s+([\d.,]+,\d{2})/;
    
        for (const block of blocks) {
            const tanggal = block.find(line => dateRegex.test(line)) || '';
            const mainLine = block.find(line => anchorRegex.test(line));

            if (!mainLine) continue;

            const amountMatch = mainLine.match(amountRegex);
            if (!amountMatch) continue;
    
            const nominalStr = amountMatch[1];
            const saldoStr = amountMatch[2];
            
            const pemasukan = nominalStr.startsWith('+') ? parseCurrency(nominalStr.substring(1)) : 0;
            const pengeluaran = nominalStr.startsWith('-') ? parseCurrency(nominalStr.substring(1)) : 0;
            const saldo = parseCurrency(saldoStr);
    
            let combinedDescription = block
                .join(' ')
                .replace(tanggal, '')
                .replace(mainLine, '')
                .trim();
            
            let mainLineDesc = mainLine.replace(amountRegex, '').replace(anchorRegex, '').trim();

            let transaksi = [combinedDescription, mainLineDesc].join(' ').replace(/\d{2}:\d{2}:\d{2} WIB/, '').replace(/\s{2,}/g, ' ').trim();
    
            transactions.push({
                Tanggal: tanggal,
                Transaksi: transaksi,
                Pemasukan: pemasukan,
                Pengeluaran: pengeluaran,
                Saldo: saldo,
            });
        }
    }


    setData(transactions);
  }, []);

  const parsePdf = useCallback(async (pdfData: ArrayBuffer, filePassword?: string) => {
    if (!pdfjs) {
        setError(t.pdfLibError);
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
                setError(t.wrongPasswordError);
            } else {
                setError(t.passwordProtectedError);
            }
        } else {
            console.error(err);
            setError(t.pdfParseError + err.message);
        }
    } finally {
      setIsLoading(false);
    }
  }, [pdfjs, parseBankStatement, t]);

  const processFile = useCallback((file: File) => {
    if (!pdfjs) {
      setError(t.pdfLibError);
      return;
    }
    if (file.type !== "application/pdf") {
      setError(t.invalidFileError);
      return;
    }

    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        if (!e.target?.result) {
            setError(t.fileReadError);
            setIsLoading(false);
            return;
        }
        const fileData = e.target.result as ArrayBuffer;
        await parsePdf(fileData);
    };
    reader.onerror = () => {
        setError(t.fileReadErrorGeneral);
        setIsLoading(false);
    }
    reader.readAsArrayBuffer(file);
  }, [pdfjs, parsePdf, t]);

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
        <div className="absolute top-4 left-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size={isMobile ? "icon" : "sm"}>
                <Globe className={cn("h-4 w-4", !isMobile && "mr-2")} />
                <span className={cn(isMobile && "sr-only")}>
                  {selectedLanguage}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {languages.map((language, index) => (
                <DropdownMenuItem
                  key={index}
                  onSelect={() => setSelectedLanguage(language as keyof typeof locales)}
                >
                  {language}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
            <Button variant={theme === 'light' ? 'default' : 'ghost'} size="icon" onClick={() => handleThemeChange('light')} className={cn(theme === 'light' && 'shadow-neumorphic-inset')}>
                <Sun className={cn("h-6 w-6", theme === 'light' ? "text-primary" : "text-muted-foreground")} />
                <span className="sr-only">{t.themeLight}</span>
            </Button>
            <Button variant={theme === 'dark' ? 'default' : 'ghost'} size="icon" onClick={() => handleThemeChange('dark')} className={cn(theme === 'dark' && 'shadow-neumorphic-inset')}>
                <Moon className={cn("h-6 w-6", theme === 'dark' ? "text-primary" : "text-muted-foreground")} />
                <span className="sr-only">{t.themeDark}</span>
            </Button>
        </div>
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
        <CardDescription>
          {t.appDescription}
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
              <p className="font-semibold text-lg">{t.processingPdf}</p>
              <p className="text-muted-foreground">{t.processingPleaseWait}</p>
            </div>
          )}
          
          {!isLoading && !selectedFile && (
             <div className="text-center flex flex-col items-center">
                <UploadCloud className="w-16 h-16 text-primary/80 mb-4" />
                <p className="text-lg font-semibold text-foreground">
                    {t.uploadTitle}
                </p>
                <p className="text-sm text-muted-foreground">
                    {t.uploadSubtitle}
                </p>
            </div>
          )}

          {!isLoading && selectedFile && (
            <div className="text-center flex flex-col items-center">
                <FileCheck2 className="w-16 h-16 text-green-500 mb-4" />
                <p className="text-lg font-semibold text-foreground">
                    {t.fileSuccess}
                </p>
                 <p className="text-sm text-muted-foreground mb-4 px-4 break-all text-center max-w-full">
                    {fileName}
                </p>
                <Button variant="outline" size="sm" onClick={handleClearFile}>
                    <XIcon className="mr-2 h-4 w-4"/>
                    {t.processAnotherFile}
                </Button>
            </div>
          )}
        </div>

        {error && (
            <Alert variant="destructive">
                <AlertTitle>{t.errorTitle}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        <div className={"space-y-6"}>
          <Accordion type="single" collapsible className="w-full" defaultValue={"item-2"}>
            <AccordionItem value="item-1">
              <AccordionTrigger className="hover:no-underline text-left">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                  <span className="text-base sm:text-lg font-semibold text-foreground">
                    {t.rawTextFrom}
                  </span>
                  <span className="text-sm sm:text-base font-medium italic text-muted-foreground break-all">
                    {fileName || t.noFileYet}
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
                    <p>{t.rawTextPlaceholder}</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
         
            <AccordionItem value="item-2">
              <AccordionTrigger className="hover:no-underline text-left">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">
                    {t.analysisResult} ({data.length} {t.transactionsFound})
                  </h3>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {data.length > 0 ? (
                    <div className="rounded-lg shadow-neumorphic-inset p-2 max-h-[500px] overflow-x-auto overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                          <TableRow>
                            <TableHead className="text-xs rounded-tl-lg whitespace-nowrap">{t.tableDate}</TableHead>
                            <TableHead className="text-xs">{t.tableTransaction}</TableHead>
                            <TableHead className="text-right text-xs whitespace-nowrap">{t.tableIncome}</TableHead>
                            <TableHead className="text-right text-xs whitespace-nowrap">{t.tableExpense}</TableHead>
                            <TableHead className="text-right text-xs rounded-tr-lg whitespace-nowrap">{t.tableBalance}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.map((row, index) => (
                            <TableRow key={index}>
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
                                {row.Saldo > 0 ? row.Saldo.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                }) : "0.00"}
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
                            <AlertTitle>{t.noTransactionsFound}</AlertTitle>
                            <AlertDescription>
                                {t.unsupportedFormat}
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <p>{t.conversionPlaceholder}</p>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {data.length > 0 && (
            <div className="flex justify-center mt-6">
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                {t.downloadExcel}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-center">
        <p className="text-xs text-muted-foreground text-center max-w-md">
          {t.privacyFirst}
        </p>
      </CardFooter>

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
              <DialogTitle>{t.passwordRequired}</DialogTitle>
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
                  placeholder={t.enterPassword}
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
                    {showPassword ? t.hidePassword : t.showPassword}
                  </span>
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" className="mt-2 sm:mt-0" onClick={() => setIsPasswordDialogOpen(false)}>{t.cancel}</Button>
              <Button type="submit">{t.open}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

    