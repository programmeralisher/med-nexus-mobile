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

    header(doc, `Ledger: ${c.name}`, c.contact ? `Contact: ${c.contact}` : "No contact on file");
    doc.setFontSize(10);
    doc.text(`Outstanding balance: ${fmtMoney(outstanding)}`, 14, 37);
    doc.text(`Total credit: ${fmtMoney(credit)}`, 14, 43);
    doc.text(`Total recovery: ${fmtMoney(recovered)}`, 14, 49);

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
      return [
        String(i + 1),
        e.description,
        (e.type === "payment" ? "- " : "") + fmtMoney(e.amount),
        fmtDate(e.date),
        e.type === "item" ? "Credit" : "Payment",
        fmtMoney(running),
      ];
    });

    autoTable(doc, {
      startY: 54,
      head: [["S.No", "Description", "Amount", "Date", "Type", "Running balance"]],
      body: rows.length ? rows : [["-", "No ledger entries", "-", "-", "-", fmtMoney(0)]],
      theme: "grid",
      headStyles: { fillColor: [16, 122, 106] },
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
