#!/usr/bin/env node
/**
 * SEO Local — Scanner Google Maps (Places API v1)
 * Trouve les commerces avec fiches mal optimisées
 */

const https = require('https')
const API_KEY = process.env.GOOGLE_PLACES_API_KEY || null

const NICHES = ['restaurant', 'garage automobile', 'dentiste', 'coiffeur', 'boulangerie', 'plombier', 'électricien', 'pharmacie']

if (!API_KEY) {
  console.error('⚠️  Pas de GOOGLE_PLACES_API_KEY — mode démo')
} else {
  console.error('✓ Google Places API active')
}

async function searchPlaces(query, city) {
  if (!API_KEY) return getDemoResults(query, city)

  const body = JSON.stringify({
    textQuery: `${query} ${city} France`,
    languageCode: 'fr',
    maxResultCount: 10,
    rankPreference: 'RELEVANCE',
  })

  return new Promise((resolve) => {
    let raw = ''
    const req = https.request({
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.rating',
          'places.userRatingCount',
          'places.websiteUri',
          'places.nationalPhoneNumber',
          'places.photos',
        ].join(','),
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => {
        try {
          const d = JSON.parse(raw)
          if (d.error) { console.error('API Error:', d.error.message); resolve([]); return }
          resolve((d.places || []).map(p => ({
            name: p.displayName?.text || '',
            address: p.formattedAddress || '',
            rating: p.rating ?? null,
            reviews: p.userRatingCount ?? 0,
            website: p.websiteUri ?? null,
            phone: p.nationalPhoneNumber ?? null,
            photos: Array.isArray(p.photos) ? p.photos.length : 0,
            id: p.id || '',
          })))
        } catch(e) { console.error('Parse error:', e.message); resolve([]) }
      })
    })
    req.on('error', (e) => { console.error('Request error:', e.message); resolve([]) })
    req.setTimeout(12000, () => { req.destroy(); resolve([]) })
    req.write(body)
    req.end()
  })
}

function getDemoResults(niche, city) {
  return [
    { name: `${niche} Demo 1 — ${city}`, address: `12 Rue de la Paix, ${city}`, rating: 3.8, reviews: 7, photos: 1, website: null, phone: null, id: 'demo_1' },
    { name: `${niche} Demo 2 — ${city}`, address: `45 Avenue Victor Hugo, ${city}`, rating: 4.2, reviews: 23, photos: 2, website: 'https://example.com', phone: '+33600000000', id: 'demo_2' },
    { name: `${niche} Demo 3 — ${city}`, address: `8 Rue du Commerce, ${city}`, rating: 2.9, reviews: 4, photos: 0, website: null, phone: null, id: 'demo_3' },
  ]
}

function analyzePlace(place) {
  const issues = []
  let score = 100

  if (!place.website) {
    score -= 25
    issues.push({ type: 'no_website', label: 'Pas de site web', severity: 'high' })
  }
  if (place.reviews < 15) {
    score -= 20
    issues.push({ type: 'few_reviews', label: `${place.reviews} avis seulement (< 15)`, severity: 'high' })
  }
  if (place.rating !== null && place.rating < 4.2) {
    score -= 15
    issues.push({ type: 'low_rating', label: `Note ${place.rating}/5 — sous la moyenne`, severity: 'medium' })
  }
  if (place.photos < 3) {
    score -= 15
    issues.push({ type: 'few_photos', label: `${place.photos} photo(s) seulement`, severity: 'medium' })
  }
  if (!place.phone) {
    score -= 10
    issues.push({ type: 'no_phone', label: 'Numéro de téléphone absent', severity: 'medium' })
  }

  return { score: Math.max(0, score), issues }
}

async function main() {
  const city = process.argv[2] || 'Tourcoing'
  const niche = process.argv[3] || null
  const nichesToScan = niche ? [niche] : NICHES.slice(0, 4)

  console.error(`\n🗺️  SEO Local Scanner — ${city}`)
  console.error('='.repeat(50))

  const opportunities = []

  for (const n of nichesToScan) {
    console.error(`  🔍 ${n}...`)
    const places = await searchPlaces(n, city)
    for (const p of places) {
      const { score, issues } = analyzePlace(p)
      if (score < 85 && issues.length > 0) {
        opportunities.push({ ...p, niche: n, city, score, issues })
      }
    }
    await new Promise(r => setTimeout(r, 300))
  }

  opportunities.sort((a, b) => a.score - b.score)

  console.log(JSON.stringify({
    scannedAt: new Date().toISOString(),
    city, niches: nichesToScan,
    total: opportunities.length,
    opportunities,
    summary: {
      noWebsite: opportunities.filter(o => !o.website).length,
      fewReviews: opportunities.filter(o => o.reviews < 15).length,
      lowRating: opportunities.filter(o => o.rating < 4.2).length,
    }
  }, null, 2))
}

main().catch(console.error)
