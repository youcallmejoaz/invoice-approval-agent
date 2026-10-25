"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UploadIcon } from "./ui";

type Result = { status: string } | { error: string };

export function UploadZone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (!files.length) return;
    (window as unknown as { __uploading?: boolean }).__uploading = true;
    setSummary(null);
    const results: Result[] = [];
    files.sort((a, b) => a.name.localeCompare(b.name));
    // ?pace=ms slows the UI between files so a screen recording can follow it (demo videos only).
    const pace = Number(new URLSearchParams(window.location.search).get("pace") ?? 0);
    for (let i = 0; i < files.length; i++) {
      if (pace > 0) await new Promise((r) => setTimeout(r, pace));
      setProgress({ done: i, total: files.length, current: files[i].name });
      const body = new FormData();
      body.append("file", files[i]);
      try {
        const res = await fetch("/api/upload", { method: "POST", body });
        results.push(await res.json());
      } catch (e) {
        results.push({ error: (e as Error).message });
      }
      router.refresh();
    }
    setProgress({ done: files.length, total: files.length, current: "" });
    const count = (s: string) => results.filter((r) => "status" in r && r.status === s).length;
    const errors = results.filter((r) => "error" in r).length;
    setSummary(
      `${files.length} processed: ${count("posted")} auto-approved and posted, ${count("needs_review") + count("awaiting_manager")} need a person, ${count("blocked")} blocked as duplicates${count("post_failed") ? `, ${count("post_failed")} posting error` : ""}${errors ? `, ${errors} not accepted` : ""}.`,
    );
    (window as unknown as { __uploading?: boolean }).__uploading = false;
    router.refresh();
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div
      className={`upload${drag ? " drag" : ""}`}
      data-testid="upload-zone"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="upload-icon">
        <UploadIcon />
      </div>
      <div className="upload-main">
        <div className="upload-title">
          {progress && progress.done < progress.total
            ? `Reading and checking ${progress.done + 1} of ${progress.total}...`
            : "Drop invoices here, or click to choose files"}
        </div>
        <div className="muted small">
          {progress && progress.done < progress.total
            ? progress.current
            : summary ?? "PDFs and photos of invoices. Emailed invoices and files saved to the watched folder arrive here on their own."}
        </div>
        {progress ? (
          <div className="progress" aria-label="Upload progress">
            <div style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        hidden
        data-testid="upload-input"
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
