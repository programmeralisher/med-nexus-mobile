import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  balanceOf,
  fmtDate,
  fmtMoney,
  monthKey,
  paidTotalOf,
  type AppData,
  type Customer,
} from "./store";

const header = (doc: jsPDF, title: string, sub?: string) => {
  doc.setFontSize(16);
  doc.text("Zeeshan Medical Store - Khatta", 14, 16);
  doc.setFontSize(12);
  doc.text(title, 14, 24);
  if (sub) {
    doc.setFontSize(9);
    doc.text(sub, 14, 30);
  }
};

export type Period = "daily" | "monthly" | "yearly";

const inPeriod = (iso: string, period: Period) => {
  const d = new Date(iso);
  const now = new Date();
  if (period === "daily") return d.toDateString() === now.toDateString();
  if (period === "monthly") return monthKey(d) === monthKey(now);
  return d.getFullYear() === now.getFullYear();
};

export function downloadLedgerPdf(c: Customer, period: Period) {
  const doc = new jsPDF();
  header(doc, `Ledger: ${c.name}`, `${c.contact || "no contact"} · ${period} report`);
  const rows = c.entries
    .filter((e) => inPeriod(e.date, period))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .map((e, i) => [
      String(i + 1),
      e.type === "payment" ? `Payment - ${e.description || "received"}` : e.description,
      (e.type === "payment" ? "- " : "") + fmtMoney(e.amount),
      fmtDate(e.date),
    ]);
  autoTable(doc, {
    startY: 36,
    head: [["S.No", "Item description", "Amount", "Date"]],
    body: rows.length ? rows : [["-", "No entries in this period", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: [16, 122, 106] },
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text(`Total outstanding: ${fmtMoney(balanceOf(c))}`, 14, y);
  doc.save(`${c.name.replace(/\s+/g, "-")}-${period}.pdf`);
}

export function downloadReportsPdf(customers: Customer[]) {
  const doc = new jsPDF();
  const mk = monthKey();
  header(doc, `Reports - ${mk}`, new Date().toLocaleString());
  autoTable(doc, {
    startY: 36,
    head: [["#", "Name", "Contact", "Paid total", "Outstanding", "Status"]],
    body: customers.map((c, i) => [
      String(i + 1),
      c.name,
      c.contact,
      fmtMoney(paidTotalOf(c)),
      fmtMoney(balanceOf(c)),
      c.paidMonths.includes(mk) ? "PAID" : "PENDING",
    ]),
    theme: "grid",
    headStyles: { fillColor: [16, 122, 106] },
  });
  doc.save(`zeeshan-reports-${mk}.pdf`);
}

// Date format used only inside the per-customer ledger table below, e.g.
// "02-Sep-2026". Deliberately a local helper, not a change to store.ts's
// exported fmtDate (which Dashboard/Reports/downloadLedgerPdf all still use
// unchanged) -- this keeps the format change isolated to this one table.
// Uses a fixed month-abbreviation table rather than
// toLocaleString(...,{month:"short"}): that's locale/ICU-dependent and can
// print "Sept" instead of "Sep" for September depending on the environment
// (confirmed while testing this change) -- a fixed table guarantees the
// exact 3-letter format every time, everywhere.
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const fmtDateLong = (iso: string) => {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTH_ABBR[d.getMonth()]}-${d.getFullYear()}`;
};

// Light green used to highlight an entire payment/recovery row so it reads
// as visually distinct from credit/item rows at a glance, per the backup
// PDF spec. Credit rows are left with the table's normal default styling.
const PAYMENT_ROW_FILL: [number, number, number] = [198, 246, 213];

export function downloadBackupPdf(data: AppData) {
  const doc = new jsPDF();
  header(doc, "Full data backup", new Date().toLocaleString());
  autoTable(doc, {
    startY: 36,
    head: [["Name", "Contact", "Entries", "Total credit", "Total recovery", "Outstanding"]],
    body: data.customers.map((c) => {
      const recovered = paidTotalOf(c);
      const outstanding = balanceOf(c);
      // Total credit = every item entry's amount summed. Not stored anywhere
      // of its own -- derived from the same two source-of-truth functions
      // already used everywhere else in this file (outstanding = credit -
      // recovery, so credit = outstanding + recovery), rather than re-summing
      // c.entries a second, separate way.
      const credit = outstanding + recovered;
      return [
        c.name,
        c.contact,
        String(c.entries.length),
        fmtMoney(credit),
        fmtMoney(recovered),
        fmtMoney(outstanding),
      ];
    }),
    theme: "grid",
    headStyles: { fillColor: [16, 122, 106] },
  });

  data.customers.forEach((c) => {
    doc.addPage();
    const recovered = paidTotalOf(c);
    const outstanding = balanceOf(c);
    const credit = outstanding + recovered;

    header(doc, `Customer: ${c.name}`, c.contact ? `Contact: ${c.contact}` : "Contact: -");

    let y = 40;
    doc.setFontSize(11);
    doc.text("Summary:", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(`Name: ${c.name}`, 14, y);
    y += 6;
    doc.text(`Entries: ${c.entries.length}`, 14, y);
    y += 6;
    doc.text(`Total Credit: ${fmtMoney(credit)}`, 14, y);
    y += 6;
    doc.text(`Total Recovery: ${fmtMoney(recovered)}`, 14, y);
    y += 6;
    doc.text(`Outstanding: ${fmtMoney(outstanding)}`, 14, y);
    y += 10;
    doc.setFontSize(11);
    doc.text("Ledger:", 14, y);
    y += 4;

    // Chronological order (oldest first) so the running balance column below
    // reads as an actual running total, same ordering downloadLedgerPdf
    // already uses for its own single-customer report.
    const sortedEntries = [...c.entries].sort((a, b) => +new Date(a.date) - +new Date(b.date));

    let running = 0;
    const rows = sortedEntries.map((e, i) => {
      // Same signed-sum step balanceOf() reduces over all at once -- applied
      // here one entry at a time, in date order, purely to print the
      // intermediate value per row. Not a second balance calculation: by the
      // last row this always lands on the same total balanceOf(c) returns.
      running += e.type === "item" ? e.amount : -e.amount;
      // "Buyer" isn't a field the Firestore schema tracks -- every current
      // entry was made by the shop against this customer directly, so this
      // column is always "Self" for now, not derived from EntryDoc.
      const buyer = "Self";
      const description =
        e.type === "payment" ? e.description || "Payment received" : e.description;
      return [
        String(i + 1),
        buyer,
        fmtDateLong(e.date),
        description,
        fmtMoney(e.amount),
        fmtMoney(running),
      ];
    });

    autoTable(doc, {
      startY: y + 2,
      head: [["S.No", "Buyer", "Date", "Item / Description", "Price", "Running Balance"]],
      body: rows.length ? rows : [["-", "-", "-", "No ledger entries", "-", fmtMoney(0)]],
      theme: "grid",
      headStyles: { fillColor: [16, 122, 106] },
      // Highlight the whole row green for payment/recovery entries so they
      // are visually distinct from credit/item rows at a glance. rowIndex
      // maps 1:1 onto sortedEntries/rows since neither is filtered.
      didParseCell: (hookData) => {
        if (hookData.section === "body" && sortedEntries[hookData.row.index]?.type === "payment") {
          hookData.cell.styles.fillColor = PAYMENT_ROW_FILL;
        }
      },
      // Only fires for a SECOND (or later) page belonging to THIS customer's
      // own table -- i.e. exactly the "ledger continues onto additional
      // pages" case. Page 1 already has the full header + summary block
      // above; a repeated small label here just keeps a page readable in
      // isolation if the ledger runs long enough to paginate on its own.
      didDrawPage: (hookData) => {
        if (hookData.pageNumber > 1) {
          doc.setFontSize(9);
          doc.text(`${c.name} (continued)`, 14, 16);
        }
      },
    });
  });

  doc.save("zeeshan-medical-backup.pdf");
}
