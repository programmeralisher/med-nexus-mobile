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
    head: [["Name", "Contact", "Entries", "Outstanding"]],
    body: data.customers.map((c) => [
      c.name,
      c.contact,
      String(c.entries.length),
      fmtMoney(balanceOf(c)),
    ]),
    theme: "grid",
    headStyles: { fillColor: [16, 122, 106] },
  });
  data.customers.forEach((c) => {
    doc.addPage();
    header(doc, `Ledger: ${c.name}`, c.contact);
    autoTable(doc, {
      startY: 36,
      head: [["S.No", "Description", "Amount", "Date"]],
      body: c.entries.map((e, i) => [
        String(i + 1),
        (e.type === "payment" ? "Payment - " : "") + e.description,
        fmtMoney(e.amount),
        fmtDate(e.date),
      ]),
      theme: "grid",
      headStyles: { fillColor: [16, 122, 106] },
    });
  });
  doc.save("zeeshan-medical-backup.pdf");
}
