// Copies the pdf.js worker next to the app so the browser can load it (used by the invoice viewer).
import fs from "node:fs";
fs.mkdirSync("public", { recursive: true });
fs.copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
