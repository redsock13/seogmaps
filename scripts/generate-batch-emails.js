#!/usr/bin/env node
/**
 * Génère les emails Cadeau de Troie pour les prospects France
 * Filtre les emails génériques, personnalise par niche
 */

const fs = require('fs')

const leads = JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/workspace/seogmaps/results/france-leads.json'))

// Emails à exclure (génériques/faux)
const BLACKLIST = [
  'support@webador.fr', 'jean.dupont@gmail.com', 'info@society.com',
  'utilisateur@domaine.com', 'contact@local.fr', 'info+noreply'
]

// Avis démo par niche (corrigés)
const DEMO_REVIEWS = {
  'plombier': { neg: { author: 'Nadia K.', text: 'Fuite pas complètement réparée, obligé de rappeler 2 jours après.', rating: 2 }, pos: { author: 'Christine B.', text: 'Intervention rapide, problème résolu en 30 min. Très professionnel !' } },
  'électricien': { neg: { author: 'François L.', text: 'Rendez-vous décalé deux fois sans prévenir. Travail correct au final.', rating: 2 }, pos: { author: 'Patrick V.', text: 'Travail soigné, rapide et propre. Très satisfait de l\'installation.' } },
  'menuisier': { neg: { author: 'Paul R.', text: 'Délai de livraison non respecté, 3 semaines de retard. Résultat correct.', rating: 2 }, pos: { author: 'Marie T.', text: 'Travail impeccable, fenêtres posées proprement. Je recommande !' } },
  'garage automobile': { neg: { author: 'Marc D.', text: 'Délai non respecté, ma voiture prête 3 jours après la date promise.', rating: 2 }, pos: { author: 'Sophie L.', text: 'Super garage, réparation rapide et prix honnête. Je recommande !' } },
  'serrurier': { neg: { author: 'Thomas B.', text: 'Prix annoncé au téléphone différent de la facture. Peu transparent.', rating: 2 }, pos: { author: 'Claire M.', text: 'Intervention rapide à 22h, porte ouverte en 10 min. Parfait !' } },
  'maçon': { neg: { author: 'Jean-Pierre V.', text: 'Finitions laissées à désirer, traces de ciment partout. Déçu.', rating: 2 }, pos: { author: 'Sylvie D.', text: 'Terrasse refaite parfaitement, très soigné. Excellent travail.' } },
  'default': { neg: { author: 'David R.', text: 'Délai non respecté et peu de communication. Résultat correct finalement.', rating: 2 }, pos: { author: 'Pierre M.', text: 'Excellent service, très professionnel. Je recommande vivement !' } }
}

// Réponses IA pré-générées par niche
function getResponses(niche, businessName) {
  const r = DEMO_REVIEWS[niche] || DEMO_REVIEWS['default']
  return {
    neg_response: `Bonjour ${r.neg.author.split(' ')[0]}, nous sommes sincèrement désolés pour ce désagrément. Nous avons pris note de votre retour et mis en place des actions correctives. N'hésitez pas à nous recontacter directement pour qu'on règle ça ensemble. 🙏`,
    pos_response: `Merci beaucoup ${r.pos.author.split(' ')[0]} pour ce retour ! C'est exactement ce que nous visons chez ${businessName}. À très bientôt ! 😊`,
    neg_review: r.neg,
    pos_review: r.pos
  }
}

function buildEmail(lead, email) {
  const r = getResponses(lead.niche, lead.name)
  const competitorByNiche = {
    'plombier': `un plombier concurrent à ${lead.city}`,
    'électricien': `un électricien concurrent à ${lead.city}`,
    'menuisier': `un menuisier concurrent à ${lead.city}`,
    'garage automobile': `un garage concurrent à ${lead.city}`,
    'serrurier': `un serrurier concurrent à ${lead.city}`,
    'maçon': `un maçon concurrent à ${lead.city}`,
  }
  const competitor = competitorByNiche[lead.niche] || `un concurrent à ${lead.city}`

  const issues = []
  if (lead.reviews < 15) issues.push(`seulement ${lead.reviews} avis`)
  if (lead.rating && lead.rating < 4.2) issues.push(`note ${lead.rating}/5`)
  if (lead.photos < 3) issues.push(`peu de photos`)

  const issueText = issues.length > 0 ? ` (${issues.join(', ')})` : ''

  return {
    to: email,
    businessName: lead.name,
    niche: lead.niche,
    city: lead.city,
    subject: `Votre fiche Google ${lead.name} — j'ai déjà préparé quelque chose pour vous`,
    html: `<p>Bonjour,</p>

<p>En analysant les fiches Google Maps de ${lead.niche}s à ${lead.city}, j'ai remarqué que <strong>${lead.name}</strong> a ${lead.reviews} avis (note ${lead.rating || '?'}/5)${issueText}.</p>

<p>J'ai remarqué que <em>${competitor}</em> répond systématiquement à ses avis et gagne du terrain sur Google Maps. Voici une réponse que j'ai déjà rédigée pour votre avis de ${r.neg_review.author.split(' ')[0]} :</p>

<hr>
<p>💬 <strong>Avis original (${r.neg_review.rating}⭐) :</strong> "${r.neg_review.text}"</p>
<p>✅ <strong>Réponse prête à poster :</strong><br>"${r.neg_response}"</p>
<hr>

<p>J'ai préparé les mêmes pour vos 3 derniers avis.</p>

<p><strong>Pour 99€ flat je vous livre sous 48h :</strong></p>
<ul>
<li>Réponses optimisées pour tous vos avis</li>
<li>Description Google Maps avec mots-clés locaux</li>
<li>Guide "obtenir plus d'avis 5 étoiles"</li>
</ul>

<p>Intéressé ? Je réponds aujourd'hui.</p>

<p>Safwane — <a href="https://mindforge-ia.com">mindforge-ia.com</a></p>`
  }
}

// Filtrer et sélectionner les 20 meilleurs
const validLeads = leads.filter(l => {
  const email = l.emails[0]
  if (!email) return false
  if (BLACKLIST.some(b => email.includes(b.split('@')[1] || b))) return false
  if (email.includes('jean.dupont') || email.includes('utilisateur@') || email.includes('info@society')) return false
  return true
}).slice(0, 20)

console.error(`\n✅ ${validLeads.length} prospects valides sélectionnés\n`)

const batch = validLeads.map(l => buildEmail(l, l.emails[0]))

fs.writeFileSync(
  '/home/openclaw/.openclaw/workspace/seogmaps/results/batch-emails-france.json',
  JSON.stringify(batch, null, 2)
)

console.error('💾 Sauvegardé : results/batch-emails-france.json')

// Aperçu des 3 premiers
console.error('\n--- APERÇU 3 PREMIERS EMAILS ---\n')
batch.slice(0, 3).forEach((e, i) => {
  console.error(`[${i+1}] À : ${e.to}`)
  console.error(`    Entreprise : ${e.businessName} (${e.niche}, ${e.city})`)
  console.error(`    Objet : ${e.subject}`)
  console.error('')
})

console.log(JSON.stringify(batch, null, 2))
