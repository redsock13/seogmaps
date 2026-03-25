#!/usr/bin/env node
/**
 * SEO Local — Scanner Google Maps
 * Trouve les commerces avec fiches mal optimisées
 * Sources : Google Places API (gratuit jusqu'à 200$/mois de crédit)
 */

const https = require('https')

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || null

// Villes et niches cibles
const CITIES = ['Tourcoing', 'Roubaix', 'Lille', 'Mouvaux', 'Wattrelos', 'Villeneuve-d\'Ascq']
const NICHES = ['restaurant', 'garage automobile', 'dentiste', 'coiffeur', 'boulangerie', 'pharmacie', 'plombier', 'électricien']

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve(data) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function analyzePlace(place) {
  const issues = []
  const score = {
    total: 0,
    max: 100,
    issues: [],
    opportunities: []
  }

  // Pas de site web
  if (!place.website) {
    issues.push({ type: 'no_website', severity: 'high', label: 'Pas de site web', points: 25 })
    score.opportunities.push('Création/refonte site web')
  }

  // Peu d'avis
  if (!place.user_ratings_total || place.user_ratings_total < 10) {
    issues.push({ type: 'few_reviews', severity: 'high', label: `Seulement ${place.user_ratings_total || 0} avis`, points: 20 })
    score.opportunities.push('Stratégie d\'acquisition avis')
  }

  // Note basse
  if (place.rating && place.rating < 4.0) {
    issues.push({ type: 'low_rating', severity: 'medium', label: `Note ${place.rating}/5 — sous la moyenne`, points: 15 })
    score.opportunities.push('Gestion réputation + réponses avis')
  }

  // Peu de photos
  if (!place.photos || place.photos.length < 3) {
    issues.push({ type: 'few_photos', severity: 'medium', label: `${place.photos?.length || 0} photo(s) seulement`, points: 15 })
    score.opportunities.push('Ajout photos professionnelles')
  }

  // Pas de numéro de téléphone
  if (!place.formatted_phone_number && !place.international_phone_number) {
    issues.push({ type: 'no_phone', severity: 'medium', label: 'Numéro de téléphone absent', points: 10 })
  }

  // Calcul score (inversé — plus c'est bas, plus y'a de boulot)
  const totalPoints = issues.reduce((sum, i) => sum + i.points, 0)
  score.total = Math.max(0, 100 - totalPoints)
  score.issues = issues

  return score
}

async function searchPlaces(query, city) {
  if (!API_KEY) {
    // Mode démo sans API key
    return getDemoResults(query, city)
  }

  const encodedQuery = encodeURIComponent(`${query} ${city} France`)
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&language=fr&key=${API_KEY}`

  try {
    const data = await httpsGet(url)
    return data.results || []
  } catch (e) {
    console.error(`Erreur recherche: ${e.message}`)
    return []
  }
}

function getDemoResults(niche, city) {
  // Résultats de démo pour tester sans API key
  return [
    {
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Demo 1 — ${city}`,
      formatted_address: `12 Rue de la Paix, ${city}`,
      rating: 3.8,
      user_ratings_total: 7,
      photos: [{ photo_reference: 'demo' }],
      website: null,
      place_id: 'demo_1',
      _demo: true
    },
    {
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Demo 2 — ${city}`,
      formatted_address: `45 Avenue Victor Hugo, ${city}`,
      rating: 4.2,
      user_ratings_total: 23,
      photos: [{ photo_reference: 'demo' }, { photo_reference: 'demo2' }],
      website: 'https://example.com',
      place_id: 'demo_2',
      _demo: true
    },
    {
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Demo 3 — ${city}`,
      formatted_address: `8 Rue du Commerce, ${city}`,
      rating: 2.9,
      user_ratings_total: 4,
      photos: [],
      website: null,
      place_id: 'demo_3',
      _demo: true
    }
  ]
}

async function scanCity(city, niche) {
  console.error(`  🔍 Scan: ${niche} à ${city}`)
  const places = await searchPlaces(niche, city)
  const results = []

  for (const place of places.slice(0, 5)) {
    const analysis = analyzePlace(place)

    // Ne garder que les fiches mal optimisées (score < 65)
    if (analysis.total < 65) {
      results.push({
        name: place.name,
        address: place.formatted_address,
        rating: place.rating || 'N/A',
        reviews: place.user_ratings_total || 0,
        photos: place.photos?.length || 0,
        website: place.website || null,
        phone: place.formatted_phone_number || null,
        place_id: place.place_id,
        score: analysis.total,
        issues: analysis.issues,
        opportunities: analysis.opportunities,
        niche,
        city,
        demo: place._demo || false
      })
    }
  }

  return results
}

async function main() {
  const targetCity = process.argv[2] || 'Tourcoing'
  const targetNiche = process.argv[3] || null

  console.error(`\n🗺️  SEO Local Scanner — ${targetCity}`)
  console.error(`API Key: ${API_KEY ? '✅ Active' : '⚠️  Absente — mode démo'}`)
  console.error('='  .repeat(50))

  const nichesToScan = targetNiche ? [targetNiche] : NICHES.slice(0, 4)
  const allResults = []

  for (const niche of nichesToScan) {
    const results = await scanCity(targetCity, niche)
    allResults.push(...results)
    await new Promise(r => setTimeout(r, 500)) // rate limit
  }

  // Trier par score (les pires en premier = meilleures opportunités)
  allResults.sort((a, b) => a.score - b.score)

  const output = {
    scannedAt: new Date().toISOString(),
    city: targetCity,
    niches: nichesToScan,
    totalScanned: allResults.length,
    opportunities: allResults,
    summary: {
      noWebsite: allResults.filter(r => !r.website).length,
      fewReviews: allResults.filter(r => r.reviews < 10).length,
      lowRating: allResults.filter(r => r.rating < 4.0 && r.rating !== 'N/A').length,
    }
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(console.error)
