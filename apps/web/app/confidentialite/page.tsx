import type { Metadata } from 'next';
import Link from 'next/link';
import { PlainHeader } from '@/components/client/plain-header';
import { MobileScreen } from '@/components/mobile';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Quelles données Miamigo collecte, pourquoi, avec qui elles sont partagées et comment exercer vos droits.',
};

const CONTACT = 'marcrosaireatayiguedegbe35@gmail.com';
const UPDATED = '19 novembre 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

/** Politique de confidentialité publique (exigée notamment par Google pour la connexion « Se connecter avec Google »). */
export default function PrivacyPage() {
  return (
    <MobileScreen wide className="bg-surface">
      <PlainHeader title="Politique de confidentialité" backHref="/" />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16">
        <p className="text-sm text-ink-muted">Dernière mise à jour : {UPDATED}</p>
        <p className="text-[15px] leading-relaxed">
          Miamigo est une plateforme de commande de repas auprès des restaurants de Cotonou, avec livraison. Cette page explique
          quelles données personnelles nous traitons, pourquoi, avec qui elles sont partagées et comment exercer vos droits.
        </p>

        <Section title="1. Données que nous collectons">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Compte</b> : nom complet, numéro de téléphone, adresse e-mail, mot de passe (enregistré uniquement sous forme chiffrée irréversible), photo de profil si vous en ajoutez une.</li>
            <li><b>Connexion avec Google</b> : si vous choisissez « Se connecter avec Google », nous recevons de Google votre nom, votre adresse e-mail (vérifiée) et un identifiant de compte Google. Nous ne recevons ni votre mot de passe Google, ni vos contacts, ni aucune autre donnée de votre compte Google.</li>
            <li><b>Commandes et livraison</b> : adresses de livraison et leur position sur la carte, contenu et historique des commandes, échanges avec l’assistance, avis laissés sur les restaurants.</li>
            <li><b>Paiement</b> : le paiement Mobile Money est réalisé chez notre prestataire FedaPay. Nous conservons la référence et le statut de la transaction, jamais vos codes ou identifiants Mobile Money.</li>
            <li><b>Livreurs et restaurants partenaires</b> : informations nécessaires à leur activité (pièces justificatives, véhicule, numéro de versement, position pendant les livraisons pour les livreurs en service).</li>
            <li><b>Sécurité</b> : adresse IP et type de navigateur lors des connexions et des actions sensibles, pour protéger les comptes et détecter les abus.</li>
          </ul>
        </Section>

        <Section title="2. Pourquoi nous les utilisons">
          <ul className="list-disc space-y-1 pl-5">
            <li>Créer et sécuriser votre compte, vous authentifier (y compris via Google) et vérifier votre adresse e-mail par un code.</li>
            <li>Transmettre votre commande au restaurant, organiser la livraison et vous informer de son avancement.</li>
            <li>Encaisser les paiements, tenir la comptabilité et traiter les remboursements.</li>
            <li>Répondre à vos demandes d’assistance et prévenir la fraude.</li>
          </ul>
          <p>Nous ne vendons pas vos données et ne les utilisons pas pour de la publicité ciblée.</p>
        </Section>

        <Section title="3. Avec qui elles sont partagées">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Le restaurant</b> qui prépare votre commande et <b>le livreur</b> qui la livre reçoivent les informations utiles (nom, téléphone, adresse de livraison, contenu de la commande).</li>
            <li><b>Nos prestataires techniques</b>, uniquement pour faire fonctionner le service : FedaPay (paiement Mobile Money), MongoDB Atlas (base de données), Render (hébergement), Cloudinary (images), Brevo (envoi des e-mails), Google (connexion avec Google).</li>
            <li>Les autorités, si la loi nous y oblige.</li>
          </ul>
        </Section>

        <Section title="4. Durée de conservation">
          <p>
            Vos données de compte sont conservées tant que votre compte est actif. Les données de commande et de paiement peuvent être
            conservées plus longtemps lorsque nos obligations comptables et légales l’exigent. Les sessions de connexion expirent
            automatiquement.
          </p>
        </Section>

        <Section title="5. Vos droits">
          <p>
            Vous pouvez consulter et modifier les informations de votre compte depuis l’espace « Mon compte ». Pour obtenir une copie de
            vos données, demander leur rectification ou la suppression de votre compte, ou retirer l’accès accordé via Google,
            écrivez-nous à <a className="font-semibold text-brand" href={`mailto:${CONTACT}`}>{CONTACT}</a>. Vous pouvez aussi
            révoquer l’accès de Miamigo à votre compte Google à tout moment depuis les paramètres de sécurité de votre compte Google.
          </p>
        </Section>

        <Section title="6. Sécurité">
          <p>
            Les échanges avec Miamigo sont chiffrés (HTTPS), les mots de passe sont enregistrés sous forme chiffrée irréversible et l’accès
            aux données est limité aux personnes qui en ont besoin pour leur rôle.
          </p>
        </Section>

        <Section title="7. Contact">
          <p>
            Pour toute question sur cette politique : <a className="font-semibold text-brand" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <p className="pt-2 text-sm"><Link href="/" className="font-semibold text-brand">← Retour à l’accueil</Link></p>
      </main>
    </MobileScreen>
  );
}
