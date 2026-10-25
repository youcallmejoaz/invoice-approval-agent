import fs from "node:fs";
import path from "node:path";
import { FIXTURES_DIR } from "../config";
import { ExtractionSchema, type Extraction } from "../schemas";

export type Fixture = {
  file: string;
  sha256: string;
  simulated?: boolean;
  responses: { fast: Extraction; check: Partial<Extraction> | null };
};

/** Demo mode: model responses stored as fixtures, keyed by the file's sha256, so runs are repeatable with no keys. */
export function loadFixture(sha256: string): Fixture | null {
  const file = path.join(FIXTURES_DIR, `${sha256}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;
  ExtractionSchema.parse(raw.responses.fast);
  if (raw.responses.check) ExtractionSchema.partial().parse(raw.responses.check);
  return raw;
}
