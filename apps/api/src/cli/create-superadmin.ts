/**
 * Crée (ou promeut) le premier super-administrateur. Aucun mot de passe n'est écrit dans le code :
 * il est lu dans SUPERADMIN_PASSWORD ou saisi au clavier.
 *
 *   npm run create-superadmin -- --phone 0197000000 --name "Prénom Nom"
 *   (compile d’abord l’API : la DI de NestJS exige les métadonnées émises par tsc)
 */
import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { NestFactory } from '@nestjs/core';
import { normalizePhone, passwordSchema } from '@plateforme/contracts';
import { AppModule } from '../app.module';
import { PlatformStaffService } from '../modules/platform-staff/platform-staff.service';
import { UsersService } from '../modules/users/users.service';

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
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        password = await rl.question('Mot de passe du super-administrateur : ');
        rl.close();
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
