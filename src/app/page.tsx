import PdfConverter from "@/components/pdf-converter";

export default function Home() {
  return (
    <main id="main-container" className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24">
      <div className="w-full max-w-5xl">
        <PdfConverter />
      </div>
    </main>
  );
}
