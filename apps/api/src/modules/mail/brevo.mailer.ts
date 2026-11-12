import { Global, Injectable, Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../common/env';

export interface MailMessage { to: string; toName?: string; subject: string; html: string; text: string }

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Envoi d'e-mails transactionnels via l'API Brevo (https://developers.brevo.com/reference/sendtransacemail).
 * La clé reste côté serveur. Sans configuration, l'envoi est refusé explicitement (aucun faux envoi).
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger('E-mail');

  configured() {
    const e = env();
    return !!(e.BREVO_API_KEY && e.MAIL_FROM_EMAIL);
  }

  async send(m: MailMessage) {
    const e = env();
    if (!this.configured()) {
      throw new ServiceUnavailableException({ statusCode: 503, error: 'MAIL_UNAVAILABLE', message: 'L’envoi d’e-mails n’est pas encore configuré sur la plateforme. Réessayez plus tard.' });
    }
    const res = await fetch(`${e.BREVO_API_URL ?? 'https://api.brevo.com/v3'}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': e.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: e.MAIL_FROM_EMAIL, name: e.MAIL_FROM_NAME },
        to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }],
        subject: m.subject, htmlContent: m.html, textContent: m.text,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err: Error) => {
      this.logger.error(`Brevo injoignable : ${err.message}`);
      return null;
    });
    if (!res || !res.ok) {
      if (res) this.logger.error(`Brevo → ${res.status} ${(await res.text()).slice(0, 300)}`);
      throw new ServiceUnavailableException({ statusCode: 503, error: 'MAIL_FAILED', message: 'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant.' });
    }
  }

  /** E-mail contenant un code à 6 chiffres. */
  async sendCode(to: string, code: string, purpose: 'REGISTER' | 'RESET' | 'CHANGE_PASSWORD', minutes: number) {
    const brand = env().MAIL_FROM_NAME;
    const what = purpose === 'REGISTER' ? 'confirmer votre adresse e-mail et créer votre compte'
      : purpose === 'RESET' ? 'réinitialiser votre mot de passe' : 'modifier votre mot de passe';
    const subject = `${code} est votre code ${brand}`;
    const text = `Votre code pour ${what} : ${code}\nIl est valable ${minutes} minutes et ne peut servir qu’une fois.\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : personne ne peut utiliser votre compte sans ce code.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#202124">
<p style="font-size:16px">Votre code pour ${escapeHtml(what)} :</p>
<p style="font-size:34px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#E8590C">${code}</p>
<p>Il est valable <b>${minutes} minutes</b> et ne peut servir qu’une fois.</p>
<p style="color:#5f6368;font-size:13px">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail. Ne communiquez jamais ce code, même à une personne se présentant comme ${escapeHtml(brand)}.</p>
</div>`;
    await this.send({ to, subject, html, text });
  }
}

@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {}
