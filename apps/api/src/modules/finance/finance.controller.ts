import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { toObjectId } from '../../common/object-id';
import { AppRequest, AuthContext, CurrentAuth, CurrentTenant, requestMeta, TenantContext } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { RequirePermission } from '../rbac/require-permission';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';

const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const money = z.number().int().min(1).max(100_000_000);
const remittanceBody = z.object({ amount: money, note: z.string().trim().max(200).default('') });
const payoutBody = z.object({ beneficiaryType: z.enum(['RESTAURANT', 'COURIER']), beneficiaryId: oid, amount: money, method: z.enum(['MTN_MOMO', 'MOOV_MONEY', 'BANK_TRANSFER', 'CASH']), note: z.string().trim().max(200).default('') });
const referenceBody = z.object({ reference: z.string().trim().min(3, 'Référence de l’opération requise.').max(80) });
const reasonBody = z.object({ reason: z.string().trim().min(3).max(300) });
const refundBody = z.object({ orderId: oid, amount: money, reason: z.string().trim().min(3).max(300), borneBy: z.enum(['RESTAURANT', 'PLATFORM']) });
const refundPayBody = referenceBody.extend({ method: z.enum(['MTN_MOMO', 'MOOV_MONEY', 'CASH', 'BANK_TRANSFER']) });

/** Période [from, to[ en heure du Bénin ; par défaut le mois en cours. */
function period(from?: string, to?: string) {
  const now = new Date(Date.now() + 3600_000);
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00+01:00`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3600_000);
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86_400_000) : new Date(Date.now() + 60_000);
  return { from: f, to: t };
}

@ApiTags('finances')
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService, private readonly reports: ReportsService, private readonly audit: AuditService) {}

  @Get('overview') @RequirePermission('finance.ledger.view') overview() { return this.finance.overview(); }
  @Get('balances') @RequirePermission('finance.ledger.view') balances() { return this.finance.balances(); }
  @Get('transactions') @RequirePermission('finance.ledger.view')
  transactions(@Query('account') account?: string, @Query('type') type?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const p = period(from, to);
    return this.finance.transactions({ account: account?.slice(0, 120), type: type?.slice(0, 60), from: from ? p.from : undefined, to: to ? p.to : undefined });
  }

  @Get('remittances') @RequirePermission('finance.courier_cash.reconcile') remittances(@Query('courierId') courierId?: string) { return this.finance.remittanceList(courierId && /^[a-f0-9]{24}$/i.test(courierId) ? courierId : undefined); }
  @Post('couriers/:id/remittances') @RequirePermission('finance.courier_cash.reconcile')
  remit(@Param('id') id: string, @Body(new ZodPipe(remittanceBody)) b: z.output<typeof remittanceBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.finance.recordRemittance(toObjectId(id), b.amount, b.note, a.userId, requestMeta(r));
  }

  @Get('payouts') @RequirePermission('finance.ledger.view') payouts(@Query('status') status?: string, @Query('beneficiaryId') beneficiaryId?: string) { return this.finance.payoutList({ status, beneficiaryId: beneficiaryId && /^[a-f0-9]{24}$/i.test(beneficiaryId) ? beneficiaryId : undefined }); }
  @Post('payouts') @RequirePermission('finance.payouts.execute')
  requestPayout(@Body(new ZodPipe(payoutBody)) b: z.output<typeof payoutBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) {
    return this.finance.requestPayout({ ...b, beneficiaryId: toObjectId(b.beneficiaryId) }, a.userId, requestMeta(r));
  }
  @Post('payouts/:id/approve') @RequirePermission('finance.payouts.execute') approvePayout(@Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.approvePayout(toObjectId(id), a.userId, requestMeta(r)); }
  @Post('payouts/:id/execute') @RequirePermission('finance.payouts.execute')
  executePayout(@Param('id') id: string, @Body(new ZodPipe(referenceBody)) b: z.output<typeof referenceBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.executePayout(toObjectId(id), b.reference, a.userId, requestMeta(r)); }
  @Post('payouts/:id/reject') @RequirePermission('finance.payouts.execute')
  rejectPayout(@Param('id') id: string, @Body(new ZodPipe(reasonBody)) b: z.output<typeof reasonBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.rejectPayout(toObjectId(id), b.reason, a.userId, requestMeta(r)); }

  @Get('refunds') @RequirePermission('finance.refunds.approve') refunds(@Query('status') status?: string, @Query('orderId') orderId?: string) { return this.finance.refundList({ status, orderId }); }
  @Post('refunds') @RequirePermission('finance.refunds.approve')
  requestRefund(@Body(new ZodPipe(refundBody)) b: z.output<typeof refundBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.requestRefund({ ...b, orderId: toObjectId(b.orderId) }, a.userId, requestMeta(r)); }
  @Post('refunds/:id/approve') @RequirePermission('finance.refunds.approve') approveRefund(@Param('id') id: string, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.approveRefund(toObjectId(id), a.userId, requestMeta(r)); }
  @Post('refunds/:id/pay') @RequirePermission('finance.refunds.approve')
  payRefund(@Param('id') id: string, @Body(new ZodPipe(refundPayBody)) b: z.output<typeof refundPayBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.payRefund(toObjectId(id), b.method, b.reference, a.userId, requestMeta(r)); }
  @Post('refunds/:id/reject') @RequirePermission('finance.refunds.approve')
  rejectRefund(@Param('id') id: string, @Body(new ZodPipe(reasonBody)) b: z.output<typeof reasonBody>, @CurrentAuth() a: AuthContext, @Req() r: AppRequest) { return this.finance.rejectRefund(toObjectId(id), b.reason, a.userId, requestMeta(r)); }

  @Get('reports') @RequirePermission('finance.reports.export')
  async report(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('format') format: string | undefined, @CurrentAuth() a: AuthContext, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const p = period(from, to);
    const data = await this.reports.build(p.from, p.to);
    if (format === 'xlsx' || format === 'pdf') {
      await this.audit.record({ actorUserId: a.userId, scope: 'platform', action: 'finance.report_export', entity: 'report', entityId: format, after: { from: p.from, to: p.to }, ...requestMeta(req) });
      const name = `rapport-financier-${p.from.toISOString().slice(0, 10)}`;
      const buf = format === 'xlsx' ? await this.reports.xlsx(data, 'Rapport financier de la plateforme') : await this.reports.pdf(data, 'Rapport financier de la plateforme');
      res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.${format}"`);
      res.send(buf);
      return;
    }
    return data;
  }
}

@ApiTags('restaurant')
@Controller('restaurants/:restaurantId/finance')
export class RestaurantFinanceController {
  constructor(private readonly finance: FinanceService, private readonly reports: ReportsService, private readonly audit: AuditService) {}

  @Get() @RequirePermission('finance.restaurant.view')
  statement(@CurrentTenant() t: TenantContext, @Query('from') from?: string, @Query('to') to?: string) {
    const p = period(from, to);
    return this.finance.restaurantStatement(t.restaurantId, p.from, p.to);
  }

  @Get('export') @RequirePermission('finance.restaurant.view')
  async export(@CurrentTenant() t: TenantContext, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('format') format: string | undefined, @CurrentAuth() a: AuthContext, @Req() req: AppRequest, @Res() res: Response) {
    const p = period(from, to);
    const data = await this.reports.build(p.from, p.to, t.restaurantId);
    const f = format === 'pdf' ? 'pdf' : 'xlsx';
    await this.audit.record({ actorUserId: a.userId, scope: 'restaurant', restaurantId: t.restaurantId, action: 'finance.statement_export', entity: 'report', entityId: f, after: { from: p.from, to: p.to }, ...requestMeta(req) });
    const buf = f === 'xlsx' ? await this.reports.xlsx(data, 'Relevé du restaurant') : await this.reports.pdf(data, 'Relevé du restaurant');
    res.setHeader('Content-Type', f === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="releve-${p.from.toISOString().slice(0, 10)}.${f}"`);
    res.send(buf);
  }
}
