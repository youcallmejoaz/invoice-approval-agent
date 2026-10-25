"use client";

import { useEffect, useRef, useState } from "react";

/** Renders the invoice file in the browser (pdf.js for PDFs, a plain image for scans). */
export function PdfViewer({ src, mime }: { src: string; mime: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mime !== "application/pdf") return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument(src).promise;
        if (cancelled || !holder.current) return;
        holder.current.innerHTML = "";
        const width = holder.current.clientWidth || 800;
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.style.marginBottom = "16px";
          holder.current.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, mime]);

  if (mime !== "application/pdf") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Invoice scan" data-testid="invoice-file" />;
  }
  return (
    <div style={{ width: "100%" }}>
      <div ref={holder} data-testid="invoice-file" style={{ width: "100%" }} />
      {error ? <div className="error-msg">Could not show the PDF: {error}</div> : null}
    </div>
  );
}
