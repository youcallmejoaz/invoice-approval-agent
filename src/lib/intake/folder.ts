import fs from "node:fs";
import path from "node:path";
import { ingestFile, mimeFor } from "../pipeline";

/** Processes every PDF or image dropped into the watched folder, then moves it to processed/ (or failed/). */
export async function processFolder(dir: string): Promise<number> {
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith(".")).map((d) => d.name).sort();
  for (const name of files) {
    const full = path.join(dir, name);
    const target = mimeFor(name) ? "processed" : "failed";
    try {
      if (target === "processed") {
        await ingestFile({ buffer: fs.readFileSync(full), fileName: name, source: "folder" });
        count++;
      }
    } catch (e) {
      console.error(`[intake] ${name}: ${(e as Error).message}`);
    }
    fs.mkdirSync(path.join(dir, target), { recursive: true });
    fs.renameSync(full, path.join(dir, target, name));
  }
  return count;
}
