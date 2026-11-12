import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Model, Types } from 'mongoose';
import { Order } from '../orders/order.schema';
import { Refund } from './finance.schemas';

export interface ReportRow { restaurantId: string; restaurant: string; orders: number; gross: number; discounts: number; commission: number; restaurantNet: number; deliveryFees: number; courierPay: number; serviceFees: number; platformDiscounts: number; refunds: number }
export interface Report { from: Date; to: Date; rows: ReportRow[]; totals: Omit<ReportRow, 'restaurantId' | 'restaurant'> }

const COLS: [keyof ReportRow, string][] = [
  ['restaurant', 'Restaurant'], ['orders', 'Commandes livrées'], ['gross', 'Ventes brutes'], ['discounts', 'Promotions restaurant'], ['commission', 'Commissions'],
  ['restaurantNet', 'Net restaurant'], ['deliveryFees', 'Frais de livraison'], ['courierPay', 'Rémunération livreurs'], ['serviceFees', 'Frais de service'],
  ['platformDiscounts', 'Coupons plateforme'], ['refunds', 'Remboursements'],
];
const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ');

/** Rapports financiers calculés à partir des commandes livrées et des remboursements payés sur la période. */
@Injectable()
export class ReportsService {
  constructor(@InjectModel(Order.name) private readonly orders: Model<Order>, @InjectModel(Refund.name) private readonly refunds: Model<Refund>) {}

  async build(from: Date, to: Date, restaurantId?: string): Promise<Report> {
    const match: Record<string, unknown> = { status: 'DELIVERED', statusChangedAt: { $gte: from, $lt: to } };
    if (restaurantId) match.restaurantId = new Types.ObjectId(restaurantId);
    const agg = await this.orders.aggregate<ReportRow & { _id: Types.ObjectId }>([
      { $match: match },
      { $group: {
        _id: '$restaurantId', restaurant: { $first: '$restaurantSnapshot.name' }, orders: { $sum: 1 },
        gross: { $sum: '$amounts.itemsSubtotal' }, discounts: { $sum: '$amounts.restaurantDiscount' }, commission: { $sum: '$finance.commissionAmount' },
        restaurantNet: { $sum: '$finance.restaurantNet' }, deliveryFees: { $sum: '$amounts.deliveryFee' }, courierPay: { $sum: '$finance.courierPay' },
        serviceFees: { $sum: '$amounts.serviceFee' }, platformDiscounts: { $sum: '$amounts.platformDiscount' },
      } },
      { $sort: { gross: -1 } },
    ]).option({ crossTenant: true });
    const rf = await this.refunds.aggregate<{ _id: Types.ObjectId; s: number }>([
      { $match: { status: 'PAID', updatedAt: { $gte: from, $lt: to }, ...(restaurantId ? { restaurantId: new Types.ObjectId(restaurantId) } : {}) } },
      { $group: { _id: '$restaurantId', s: { $sum: '$amount' } } },
    ]);
    const rMap = new Map(rf.map((r) => [String(r._id), r.s]));
    const rows: ReportRow[] = agg.map((a) => ({ ...a, restaurantId: String(a._id), refunds: rMap.get(String(a._id)) ?? 0 }));
    const totals = rows.reduce((t, r) => {
      for (const [k] of COLS) if (k !== 'restaurant') (t as Record<string, number>)[k] = ((t as Record<string, number>)[k] ?? 0) + (r[k] as number);
      return t;
    }, { orders: 0, gross: 0, discounts: 0, commission: 0, restaurantNet: 0, deliveryFees: 0, courierPay: 0, serviceFees: 0, platformDiscounts: 0, refunds: 0 });
    return { from, to, rows, totals };
  }

  async xlsx(r: Report, title: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketplace';
    const ws = wb.addWorksheet('Rapport');
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([`Période : du ${r.from.toLocaleDateString('fr-FR')} au ${new Date(r.to.getTime() - 1).toLocaleDateString('fr-FR')} (montants en FCFA)`]);
    ws.addRow([]);
    const header = ws.addRow(COLS.map(([, l]) => l));
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE5D6' } };
    for (const row of r.rows) ws.addRow(COLS.map(([k]) => row[k]));
    const t = ws.addRow(['TOTAL', ...COLS.slice(1).map(([k]) => (r.totals as Record<string, number>)[k])]);
    t.font = { bold: true };
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 18; if (i > 0) c.numFmt = '#,##0'; });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  pdf(r: Report, title: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(16).fillColor('#F15A24').text(title);
      doc.moveDown(0.3).fontSize(10).fillColor('#202124').text(`Période : du ${r.from.toLocaleDateString('fr-FR')} au ${new Date(r.to.getTime() - 1).toLocaleDateString('fr-FR')} — montants en FCFA`);
      doc.moveDown();
      const widths = [140, 55, 60, 60, 60, 60, 60, 60, 55, 55, 55];
      const drawRow = (cells: string[], bold = false) => {
        const y = doc.y;
        let x = doc.page.margins.left;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        cells.forEach((c, i) => { doc.text(c, x, y, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right' }); x += widths[i]; });
        doc.moveDown(0.6);
        if (doc.y > doc.page.height - 60) doc.addPage();
      };
      drawRow(COLS.map(([, l]) => l), true);
      for (const row of r.rows) drawRow(COLS.map(([k]) => (k === 'restaurant' ? String(row[k]) : fmt(row[k] as number))));
      drawRow(['TOTAL', ...COLS.slice(1).map(([k]) => fmt((r.totals as Record<string, number>)[k]))], true);
      doc.moveDown().font('Helvetica').fontSize(8).fillColor('#5F6368').text(`Généré le ${new Date().toLocaleString('fr-FR')}. Données issues des commandes livrées et des remboursements payés.`);
      doc.end();
    });
  }
}
