#!/usr/bin/env node
/**
 * SEO Local — Générateur d'email "Cadeau de Troie"
 * Génère un email personnalisé avec des réponses aux avis déjà rédigées
 * Usage: node generate-email.js <place_id> <business_name> <niche>
 */

const https = require('https')

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || null
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || null

// Avis de démo si pas d'accès API reviews
const DEMO_REVIEWS = [
  { author: 'Jean-Pierre M.', rating: 5, text: 'Super garage, réparation rapide et prix honnête. Je recommande !', time: '2026-03-20' },
  { author: 'Sophie L.', rating: 4, text: 'Bon travail mais attente un peu longue. Résultat impeccable.', time: '2026-03-15' },
  { author: 'Marc D.', rating: 2, text: 'Délai non respecté, ma voiture était prête 3 jours après la date promise.', time: '2026-03-10' },
]

async function getReviews(placeId) {
  if (!GOOGLE_KEY || placeId.startsWith('demo_')) return DEMO_REVIEWS

  return new Promise((resolve) => {
    let raw = ''
    const body = JSON.stringify({ maxResultCount: 5 })
    const req = https.request({
      hostname: 'places.googleapis.com',
      path: `/v1/places/${placeId}/reviews`,
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'reviews.authorAttribution,reviews.rating,reviews.text,reviews.relativePublishTimeDescription',
      }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => {
        try {
          const d = JSON.parse(raw)
          const reviews = (d.reviews || []).map(r => ({
            author: r.authorAttribution?.displayName || 'Client',
            rating: r.rating,
            text: r.text?.text || '',
            time: r.relativePublishTimeDescription || '',
          }))
          resolve(reviews.length ? reviews : DEMO_REVIEWS)
        } catch { resolve(DEMO_REVIEWS) }
      })
    })
    req.on('error', () => resolve(DEMO_REVIEWS))
    req.setTimeout(8000, () => { req.destroy(); resolve(DEMO_REVIEWS) })
    req.end()
  })
}

async function generateResponses(businessName, niche, reviews) {
  if (!ANTHROPIC_KEY) {
    // Réponses de démo
    return reviews.map(r => ({
      original: r,
      response: r.rating >= 4
        ? `Merci beaucoup ${r.author.split(' ')[0]} pour votre retour ! C'est exactement ce que nous visons chez ${businessName}. À bientôt ! 🙏`
        : `Bonjour ${r.author.split(' ')[0]}, nous sommes sincèrement désolés pour ce désagrément. Nous avons pris note de votre retour et avons mis en place des actions correctives. N'hésitez pas à nous recontacter directement.`
    }))
  }

  const prompt = `Tu es expert en gestion de réputation locale pour des ${niche}s en France.

Pour "${businessName}", génère des réponses courtes (2-3 phrases max) et naturelles aux avis suivants.
Les réponses doivent :
- Être chaleureuses et professionnelles
- Inclure le prénom du client
- Pour les avis négatifs : reconnaître, s'excuser, proposer une solution
- Pour les avis positifs : remercier, reinforcer un point précis, inviter à revenir
- Ne pas être génériques ou robotiques
- Inclure 1 emoji max

Avis à traiter :
${reviews.map((r, i) => `${i+1}. [${r.rating}⭐] ${r.author}: "${r.text}"`).join('\n')}

Réponds en JSON uniquement :
[{"index": 1, "response": "..."}, {"index": 2, "response": "..."}, ...]`

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })

    let raw = ''
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => {
        try {
          const d = JSON.parse(raw)
          const text = d.content?.[0]?.text || '[]'
          const responses = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]')
          resolve(reviews.map((r, i) => ({
            original: r,
            response: responses.find(x => x.index === i+1)?.response || `Merci ${r.author.split(' ')[0]} pour votre retour !`
          })))
        } catch { resolve(reviews.map(r => ({ original: r, response: `Merci pour votre retour !` }))) }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(15000, () => { req.destroy(); resolve([]) })
    req.write(body)
    req.end()
  })
}

function buildEmail(business, reviews, responses, competitor) {
  const issues = []
  if (!business.website) issues.push(`pas de site web`)
  if (business.reviews < 15) issues.push(`seulement ${business.reviews} avis`)
  if (business.photos < 3) issues.push(`${business.photos} photo(s)`)

  const competitorLine = competitor
    ? `J'ai remarqué que "${competitor}" (votre concurrent direct) répond systématiquement à ses avis et gagne du terrain sur Google. `
    : ''

  const negativeReview = responses.find(r => r.original.rating <= 3)
  const sampleResponse = negativeReview || responses[0]

  return `Objet : Votre fiche Google ${business.name} — j'ai déjà préparé quelque chose pour vous

Bonjour,

En analysant les fiches Google Maps de ${business.niche}s à ${business.city}, j'ai remarqué que ${business.name} a ${business.reviews} avis (note ${business.rating}/5)${business.website ? '' : ' et pas de site web'}.

${competitorLine}Voici une réponse que j'ai déjà rédigée pour votre avis de ${sampleResponse?.original.author?.split(' ')[0] || 'client'} :

---
💬 Avis original (${sampleResponse?.original.rating}⭐) : "${sampleResponse?.original.text?.slice(0, 80)}..."

✅ Réponse prête à poster :
"${sampleResponse?.response}"
---

${responses.length > 1 ? `J'ai préparé les mêmes pour vos ${responses.length} derniers avis.` : ''}

Pour 99€ flat je vous livre sous 48h :
→ Réponses optimisées pour tous vos avis
→ Description Google Maps avec mots-clés locaux
→ Guide "obtenir plus d'avis 5 étoiles"

Intéressé ? Je réponds aujourd'hui.

Safwane — zmimer.dev`
}

async function main() {
  const args = process.argv.slice(2)
  const business = {
    name: args[0] || 'GARAGE DE LÀ PAIX',
    niche: args[1] || 'garage automobile',
    city: args[2] || 'Tourcoing',
    rating: parseFloat(args[3]) || 4.8,
    reviews: parseInt(args[4]) || 49,
    website: args[5] === 'true' ? true : null,
    photos: parseInt(args[6]) || 2,
    id: args[7] || 'demo_garage',
  }
  const competitor = args[8] || 'Leader Auto Tourcoing'

  console.error(`\n✉️  Génération email pour : ${business.name}`)
  console.error('  → Récupération des avis...')
  const reviews = await getReviews(business.id)

  console.error(`  → ${reviews.length} avis trouvés — génération des réponses IA...`)
  const responses = await generateResponses(business.name, business.niche, reviews.slice(0, 3))

  const email = buildEmail(business, reviews, responses, competitor)

  console.log('\n' + '='.repeat(60))
  console.log(email)
  console.log('='.repeat(60))

  // Sauvegarder
  const fs = require('fs')
  const filename = `/home/openclaw/.openclaw/workspace/seogmaps/results/${business.name.replace(/[^a-z0-9]/gi,'_')}_email.txt`
  fs.writeFileSync(filename, email)
  console.error(`\n✅ Email sauvegardé : ${filename}`)
}

main().catch(console.error)
