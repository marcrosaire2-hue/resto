/**
 * Crée (ou promeut) le premier super-administrateur. Aucun mot de passe n'est écrit dans le code :
 * il est lu dans SUPERADMIN_PASSWORD ou saisi au clavier.
 *
 *   npm run create-superadmin -- --phone 0197000000 --name "Prénom Nom"
 *   (compile d’abord l’API : la DI de NestJS exige les métadonnées émises par tsc)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { normalizePhone, passwordSchema } from '@plateforme/contracts';
import { AppModule } from '../app.module';
import { PlatformStaffService } from '../modules/platform-staff/platform-staff.service';
import { UsersService } from '../modules/users/users.service';

/** Saisie masquée : rien n'est affiché à l'écran pendant la frappe. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Saisie interactive impossible : utilisez la variable SUPERADMIN_PASSWORD.'));
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { done(); return resolve(value); }
        if (c === '\u0003') { done(); return reject(new Error('Annulé.')); }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); };
    stdin.on('data', onData);
  });
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const phoneArg = arg('phone');
  const name = arg('name');
  if (!phoneArg || !name) throw new Error('Usage : --phone <numéro> --name "<nom complet>"');
  const phone = normalizePhone(phoneArg);
  if (!phone.ok) throw new Error(phone.error);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const users = app.get(UsersService);
    const staff = app.get(PlatformStaffService);
    let user = await users.findByPhone(phone.e164);
    if (!user) {
      let password = process.env.SUPERADMIN_PASSWORD;
      if (!password) {
        password = await askHidden('Mot de passe du super-administrateur (10 caractères minimum, non affiché) : ');
        const again = await askHidden('Confirmez le mot de passe : ');
        if (again !== password) throw new Error('Les deux saisies ne correspondent pas.');
      }
      const p = passwordSchema.safeParse(password);
      if (!p.success) throw new Error(p.error.issues[0].message);
      user = await users.create({ fullName: name, phone: phone.e164, password: p.data });
      console.log(`Compte créé pour ${phone.e164}.`);
    }
    await staff.assign(user._id, 'super_admin', null, { ip: null, userAgent: 'cli:create-superadmin' }).catch((e) => {
      if (e?.response?.error !== 'ALREADY_STAFF') throw e;
    });
    console.log(`${user.fullName} est super-administrateur.`);
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
