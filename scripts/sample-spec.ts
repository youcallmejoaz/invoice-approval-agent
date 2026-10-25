/**
 * Ground truth for the generated sample set. Every name here is fictional.
 * Amounts are in dollars as printed on the invoice; the generator and tests convert to cents.
 */

export type SpecVendor = {
  id: string;
  name: string;
  address: string;
  taxRate: number;
  termsDays: number;
  accent: string;
  layout: "left" | "band";
  inMaster: boolean;
};

export const VENDORS: SpecVendor[] = [
  { id: "V01", name: "Northgate Office Supply", address: "48 Mill Lane, Riverton", taxRate: 8, termsDays: 30, accent: "#1f4e79", layout: "left", inMaster: true },
  { id: "V02", name: "Bluebird Cleaning Services", address: "12 Orchard Way, Riverton", taxRate: 0, termsDays: 15, accent: "#2a7ab0", layout: "band", inMaster: true },
  { id: "V03", name: "Summit IT Solutions", address: "900 Ridge Road, Suite 4, Hillview", taxRate: 8, termsDays: 30, accent: "#3b3b98", layout: "left", inMaster: true },
  { id: "V04", name: "Greenleaf Catering Co.", address: "5 Market Square, Riverton", taxRate: 8, termsDays: 14, accent: "#2e7d32", layout: "band", inMaster: true },
  { id: "V05", name: "Harborline Logistics", address: "Unit 7, Dockside Park, Port Ellis", taxRate: 0, termsDays: 30, accent: "#00695c", layout: "left", inMaster: true },
  { id: "V06", name: "Brightspark Electrical", address: "221 Foundry Street, Hillview", taxRate: 8, termsDays: 30, accent: "#e65100", layout: "band", inMaster: true },
  { id: "V07", name: "Maple & Pine Print Shop", address: "77 High Street, Riverton", taxRate: 8, termsDays: 30, accent: "#6d4c41", layout: "left", inMaster: true },
  { id: "V08", name: "Clearwater Facilities", address: "3 Lakeside Drive, Port Ellis", taxRate: 0, termsDays: 30, accent: "#0277bd", layout: "band", inMaster: true },
  { id: "V09", name: "Redwood Marketing Studio", address: "15 Canal Row, Hillview", taxRate: 8, termsDays: 30, accent: "#ad1457", layout: "left", inMaster: false },
];

export const BILL_TO = ["Demo Company Ltd", "1 Sample Road", "Springfield"];

export type SpecLine = { description: string; quantity: number; unitPrice: number };

export type SpecPO = { poNumber: string; vendorId: string; lines: SpecLine[]; grnNumber: string; receivedAt: string };

export const PURCHASE_ORDERS: SpecPO[] = [
  { poNumber: "PO-3001", vendorId: "V03", grnNumber: "GRN-4001", receivedAt: "2026-09-29", lines: [
    { description: "Laptop docking station", quantity: 4, unitPrice: 185 },
    { description: "Network switch, 24 port", quantity: 1, unitPrice: 640 },
  ] },
  { poNumber: "PO-3002", vendorId: "V05", grnNumber: "GRN-4002", receivedAt: "2026-10-01", lines: [
    { description: "Pallet freight, Riverton to Port Ellis", quantity: 1, unitPrice: 1450 },
    { description: "Liftgate service", quantity: 1, unitPrice: 95 },
  ] },
  { poNumber: "PO-3003", vendorId: "V03", grnNumber: "GRN-4003", receivedAt: "2026-10-09", lines: [
    { description: "Business laptop, 14 inch", quantity: 6, unitPrice: 1290 },
    { description: "Laptop setup and imaging", quantity: 6, unitPrice: 60 },
  ] },
  { poNumber: "PO-3004", vendorId: "V06", grnNumber: "GRN-4004", receivedAt: "2026-10-15", lines: [
    { description: "Electrical panel upgrade, labour", quantity: 1, unitPrice: 1400 },
    { description: "LED ceiling fixture", quantity: 4, unitPrice: 150 },
  ] },
  { poNumber: "PO-3005", vendorId: "V05", grnNumber: "GRN-4005", receivedAt: "2026-10-13", lines: [
    { description: "Container drayage", quantity: 1, unitPrice: 875 },
    { description: "Fuel surcharge", quantity: 1, unitPrice: 112.5 },
  ] },
  { poNumber: "PO-3006", vendorId: "V06", grnNumber: "GRN-4006", receivedAt: "2026-10-02", lines: [
    { description: "Emergency call-out", quantity: 1, unitPrice: 350 },
    { description: "Outlet replacement", quantity: 3, unitPrice: 85 },
  ] },
];

export type Scenario =
  | "clean"
  | "exact_duplicate"
  | "resent_duplicate"
  | "near_duplicate"
  | "maths_lines"
  | "maths_tax"
  | "new_vendor"
  | "scan_recovered"
  | "scan_unclear"
  | "over_limit"
  | "ledger_fault";

export type SpecInvoice = {
  seq: number;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  poNumber?: string;
  lines: SpecLine[];
  channel: "upload" | "email";
  scenario: Scenario;
  /** Printed values that differ from the correct maths (built-in errors). */
  printedSubtotal?: number;
  printedTax?: number;
  /** For duplicates: seq of the original. */
  duplicateOfSeq?: number;
  format?: "pdf" | "jpg";
  stamp?: string;
  expectedRoute: "auto" | "review" | "manager" | "blocked";
  expectedFlags: string[];
};

const L = (description: string, quantity: number, unitPrice: number): SpecLine => ({ description, quantity, unitPrice });
const po = (n: string) => PURCHASE_ORDERS.find((p) => p.poNumber === n)!.lines;

export const INVOICES: SpecInvoice[] = [
  { seq: 1, vendorId: "V01", invoiceNumber: "NG-2031", invoiceDate: "2026-10-01", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Copy paper, A4, box of 5 reams", 10, 42), L("Toner cartridge, black", 3, 89), L("Sticky notes, 12 pack", 12, 4.5)] },
  { seq: 2, vendorId: "V02", invoiceNumber: "BB-0901", invoiceDate: "2026-10-01", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Office cleaning, September", 1, 1150)] },
  { seq: 3, vendorId: "V03", invoiceNumber: "SIT-7710", invoiceDate: "2026-10-02", poNumber: "PO-3001", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: po("PO-3001") },
  { seq: 4, vendorId: "V04", invoiceNumber: "GC-5501", invoiceDate: "2026-10-02", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Team lunch catering, per person", 25, 18.5), L("Delivery fee", 1, 35)] },
  { seq: 5, vendorId: "V05", invoiceNumber: "HL-88120", invoiceDate: "2026-10-03", poNumber: "PO-3002", channel: "email", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: po("PO-3002") },
  { seq: 6, vendorId: "V06", invoiceNumber: "BSE-1180", invoiceDate: "2026-10-03", poNumber: "PO-3006", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: po("PO-3006") },
  { seq: 7, vendorId: "V07", invoiceNumber: "MP-3301", invoiceDate: "2026-10-04", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Business cards, box of 500", 4, 45), L("Tri-fold brochures", 1000, 0.42)] },
  { seq: 8, vendorId: "V08", invoiceNumber: "CWF-6610", invoiceDate: "2026-10-04", channel: "email", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Water cooler rental, October", 2, 38), L("Bottled water, 5 gallon", 20, 9.5)] },
  { seq: 9, vendorId: "V01", invoiceNumber: "NG-2036", invoiceDate: "2026-10-05", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Ergonomic office chair", 3, 289), L("LED desk lamp", 4, 36.5)] },
  { seq: 10, vendorId: "V03", invoiceNumber: "SIT-7718", invoiceDate: "2026-10-05", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Managed IT support, October", 1, 2400), L("Cloud backup storage, 2 TB", 1, 120)] },
  { seq: 11, vendorId: "V04", invoiceNumber: "GC-5512", invoiceDate: "2026-10-06", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Breakfast platter", 3, 65), L("Coffee service, per cup", 30, 3.2)] },
  { seq: 12, vendorId: "V01", invoiceNumber: "NG-2041", invoiceDate: "2026-10-06", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Whiteboard markers", 20, 2.75), L("Filing cabinet, 3 drawer", 2, 215), L("Shredder bags", 5, 12)] },
  { seq: 13, vendorId: "V02", invoiceNumber: "BB-0907", invoiceDate: "2026-10-07", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Carpet deep clean", 1, 680), L("Exterior window cleaning", 1, 340)] },
  { seq: 14, vendorId: "V06", invoiceNumber: "BSE-1186", invoiceDate: "2026-10-07", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Lighting safety inspection", 1, 220), L("Replacement ballast", 2, 48)] },
  { seq: 15, vendorId: "V08", invoiceNumber: "CWF-6618", invoiceDate: "2026-10-08", channel: "upload", scenario: "scan_recovered", format: "jpg", expectedRoute: "auto", expectedFlags: [],
    lines: [L("HVAC filter replacement", 12, 18.75), L("Maintenance visit", 1, 150)] },
  { seq: 16, vendorId: "V05", invoiceNumber: "HL-88131", invoiceDate: "2026-10-08", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Same day courier", 6, 42), L("Parcel shipping", 14, 11.25)] },
  { seq: 17, vendorId: "V07", invoiceNumber: "MP-3308", invoiceDate: "2026-10-09", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Event banner, 2 m", 2, 135), L("Poster, A2", 25, 6.8)] },
  { seq: 18, vendorId: "V02", invoiceNumber: "BB-0917", invoiceDate: "2026-10-09", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Restroom supplies restock", 1, 185), L("Floor waxing", 1, 560)] },
  { seq: 19, vendorId: "V03", invoiceNumber: "SIT-7725", invoiceDate: "2026-10-10", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Firewall licence renewal, annual", 1, 1180), L("Security review", 1, 950)] },
  { seq: 20, vendorId: "V03", invoiceNumber: "SIT-7731", invoiceDate: "2026-10-11", poNumber: "PO-3003", channel: "upload", scenario: "over_limit", expectedRoute: "manager", expectedFlags: ["over_limit"],
    lines: po("PO-3003") },
  { seq: 21, vendorId: "V04", invoiceNumber: "GC-5523", invoiceDate: "2026-10-12", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Client meeting lunch, per person", 12, 24), L("Dessert tray", 1, 55)] },
  { seq: 22, vendorId: "V04", invoiceNumber: "GC-5530", invoiceDate: "2026-10-14", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Town hall catering, per person", 60, 19), L("Beverage station", 1, 100)] },
  { seq: 23, vendorId: "V01", invoiceNumber: "NG-2047", invoiceDate: "2026-10-14", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Printer paper, box of 5 reams", 15, 42), L("Binder clips, box", 10, 3.4)] },
  { seq: 24, vendorId: "V05", invoiceNumber: "HL-88140", invoiceDate: "2026-10-15", poNumber: "PO-3005", channel: "email", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: po("PO-3005") },
  { seq: 25, vendorId: "V07", invoiceNumber: "MP-3315", invoiceDate: "2026-10-15", channel: "upload", scenario: "maths_lines", printedSubtotal: 1250, expectedRoute: "review", expectedFlags: ["subtotal_mismatch"],
    lines: [L("Letterhead, printed", 1000, 0.35), L("Envelopes, printed", 1000, 0.3), L("Presentation folders", 500, 1)] },
  { seq: 26, vendorId: "V08", invoiceNumber: "CWF-6625", invoiceDate: "2026-10-16", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Pest control, quarterly", 1, 210), L("Grease trap service", 1, 340)] },
  { seq: 27, vendorId: "V09", invoiceNumber: "RMS-0042", invoiceDate: "2026-10-16", channel: "upload", scenario: "new_vendor", expectedRoute: "review", expectedFlags: ["new_vendor"],
    lines: [L("Social media campaign setup", 1, 1200), L("Ad creative set", 3, 150)] },
  { seq: 28, vendorId: "V02", invoiceNumber: "BB-0923", invoiceDate: "2026-10-17", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Post-event cleanup", 1, 420), L("Upholstery cleaning, per chair", 6, 45)] },
  { seq: 29, vendorId: "V06", invoiceNumber: "BSE-1199", invoiceDate: "2026-10-17", poNumber: "PO-3004", channel: "upload", scenario: "maths_tax", printedTax: 180, expectedRoute: "review", expectedFlags: ["tax_mismatch"],
    lines: po("PO-3004") },
  { seq: 30, vendorId: "V03", invoiceNumber: "SIT-7740", invoiceDate: "2026-10-18", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Laptop repair", 2, 165), L("Replacement charger", 3, 55)] },
  { seq: 31, vendorId: "V01", invoiceNumber: "NG-2041", invoiceDate: "2026-10-06", channel: "email", scenario: "exact_duplicate", duplicateOfSeq: 12, expectedRoute: "blocked", expectedFlags: ["duplicate_file"],
    lines: [] },
  { seq: 32, vendorId: "V01", invoiceNumber: "NG-2052", invoiceDate: "2026-10-19", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Desk organiser", 10, 14.5), L("Monitor stand", 5, 48)] },
  { seq: 33, vendorId: "V05", invoiceNumber: "HL-88152", invoiceDate: "2026-10-19", channel: "upload", scenario: "scan_unclear", format: "jpg", expectedRoute: "review", expectedFlags: ["low_confidence"],
    lines: [L("Freight, Port Ellis to Hillview", 1, 1180), L("Pallet wrap", 4, 12.5)] },
  { seq: 34, vendorId: "V02", invoiceNumber: "BB-0917", invoiceDate: "2026-10-09", channel: "upload", scenario: "resent_duplicate", duplicateOfSeq: 18, stamp: "SECOND NOTICE", expectedRoute: "blocked", expectedFlags: ["duplicate_invoice_number"],
    lines: [L("Restroom supplies restock", 1, 185), L("Floor waxing", 1, 560)] },
  { seq: 35, vendorId: "V07", invoiceNumber: "MP-3322", invoiceDate: "2026-10-20", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Vinyl window lettering", 1, 380), L("Table tent cards", 200, 0.95)] },
  { seq: 36, vendorId: "V04", invoiceNumber: "GC-5536", invoiceDate: "2026-10-20", channel: "upload", scenario: "near_duplicate", duplicateOfSeq: 22, expectedRoute: "review", expectedFlags: ["possible_duplicate"],
    lines: [L("Town hall catering, per person", 60, 19.1), L("Beverage station", 1, 100)] },
  { seq: 37, vendorId: "V08", invoiceNumber: "CWF-6631", invoiceDate: "2026-10-21", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Bottled water delivery, 5 gallon", 24, 9.5), L("Paper cups, sleeve", 10, 6)] },
  { seq: 38, vendorId: "V01", invoiceNumber: "NG-2058", invoiceDate: "2026-10-22", channel: "upload", scenario: "ledger_fault", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Standing desk converter", 3, 199), L("Cable management kit", 6, 22)] },
  { seq: 39, vendorId: "V06", invoiceNumber: "BSE-1204", invoiceDate: "2026-10-22", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Exit sign battery replacement", 8, 27), L("Inspection report", 1, 95)] },
  { seq: 40, vendorId: "V03", invoiceNumber: "SIT-7746", invoiceDate: "2026-10-23", channel: "upload", scenario: "clean", expectedRoute: "auto", expectedFlags: [],
    lines: [L("Wi-Fi access point", 3, 210), L("Installation labour, per hour", 4, 85)] },
];

/** The demo ledger fails the first post of this bill once, to show the error queue and retry. */
export const LEDGER_FAULTS = [
  {
    billNumber: "NG-2058",
    reason: "The accounting system did not respond in time. Nothing was posted. Retry to send it again.",
    technical: "ETIMEDOUT after 30000 ms on POST /bills",
    remaining: 1,
  },
];
