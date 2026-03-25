#!/usr/bin/env node
/**
 * Extracteur de leads Google Maps
 * Trouve les commerces + emails via site web scraping
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY

const NICHES = [
  'restaurant', 'garage automobile', 'plombier', 'électricien',
  'coiffeur', 'boulangerie', 'pharmacie', 'dentiste', 'artisan',
  'menuisier', 'peintre', 'maçon', 'serrurier', 'fleuriste'
]

function httpsGet(url, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? https : http
      let raw = ''
      const req = mod.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/json',
        },
        timeout,
      }, (res) => {
        // Suivre les redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpsGet(res.headers.location, timeout))
          return
        }
        res.on('data', c => raw += c)
        res.on('end', () => resolve(raw))
      })
      req.on('error', () => resolve(''))
      req.on('timeout', () => { req.destroy(); resolve('') })
    } catch { resolve('') }
  })
}

async function searchPlaces(query, city, pageToken = null) {
  const body = JSON.stringify({
    textQuery: `${query} ${city} France`,
    languageCode: 'fr',
    maxResultCount: 20,
    ...(pageToken && { pageToken })
  })

  return new Promise((resolve) => {
    let raw = ''
    const req = https.request({
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': [
          'places.id', 'places.displayName', 'places.formattedAddress',
          'places.rating', 'places.userRatingCount', 'places.websiteUri',
          'places.nationalPhoneNumber', 'places.photos',
          'places.regularOpeningHours', 'nextPageToken'
        ].join(','),
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => {
        try {
          const d = JSON.parse(raw)
          resolve(d)
        } catch { resolve({ places: [] }) }
      })
    })
    req.on('error', () => resolve({ places: [] }))
    req.setTimeout(12000, () => { req.destroy(); resolve({ places: [] }) })
    req.write(body)
    req.end()
  })
}

function extractEmailsFromHtml(html) {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const matches = html.match(emailRegex) || []
  return [...new Set(matches)].filter(e =>
    !e.includes('example') &&
    !e.includes('wixpress') &&
    !e.includes('sentry') &&
    !e.includes('@2x') &&
    !e.endsWith('.png') &&
    !e.endsWith('.jpg') &&
    e.length < 60
  ).slice(0, 3)
}

async function findEmailFromWebsite(websiteUrl) {
  if (!websiteUrl) return []
  try {
    const html = await httpsGet(websiteUrl, 6000)
    let emails = extractEmailsFromHtml(html)
    if (emails.length === 0) {
      // Essayer page contact
      const base = new URL(websiteUrl)
      for (const path of ['/contact', '/contact-us', '/nous-contacter', '/contactez-nous']) {
        const contactUrl = `${base.origin}${path}`
        const contactHtml = await httpsGet(contactUrl, 5000)
        emails = extractEmailsFromHtml(contactHtml)
        if (emails.length > 0) break
      }
    }
    return emails
  } catch { return [] }
}

function analyzePlace(place) {
  let score = 100
  const issues = []
  if (!place.websiteUri) { score -= 25; issues.push('Pas de site web') }
  if ((place.userRatingCount || 0) < 15) { score -= 20; issues.push(`${place.userRatingCount || 0} avis seulement`) }
  if (place.rating && place.rating < 4.2) { score -= 15; issues.push(`Note ${place.rating}/5`) }
  if (!place.photos || place.photos.length < 3) { score -= 15; issues.push(`${place.photos?.length || 0} photo(s)`) }
  if (!place.nationalPhoneNumber) { score -= 10; issues.push('Pas de téléphone') }
  return { score: Math.max(0, score), issues }
}

async function extractLeads(city, niche, maxPlaces = 20) {
  console.error(`  🔍 ${niche} à ${city}...`)
  const result = await searchPlaces(niche, city)
  const places = result.places || []
  const leads = []

  for (const p of places.slice(0, maxPlaces)) {
    const { score, issues } = analyzePlace(p)
    if (score >= 85) continue // Skip les bien optimisés

    let emails = []
    if (p.websiteUri) {
      emails = await findEmailFromWebsite(p.websiteUri)
      await new Promise(r => setTimeout(r, 300))
    }

    leads.push({
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      city,
      niche,
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      website: p.websiteUri || null,
      phone: p.nationalPhoneNumber || null,
      photos: p.photos?.length || 0,
      emails,
      hasEmail: emails.length > 0,
      score,
      issues,
      id: p.id || '',
    })
  }

  return leads
}

async function main() {
  const city = process.argv[2] || 'Tourcoing'
  const niche = process.argv[3] || null
  const nichesToScan = niche ? [niche] : NICHES.slice(0, 5)

  console.error(`\n🎯 Extraction leads — ${city}`)
  console.error('='.repeat(50))

  const allLeads = []
  const seen = new Set()

  for (const n of nichesToScan) {
    const leads = await extractLeads(city, n, 10)
    for (const l of leads) {
      if (!seen.has(l.name)) {
        seen.add(l.name)
        allLeads.push(l)
      }
    }
    await new Promise(r => setTimeout(r, 500))
  }

  allLeads.sort((a, b) => {
    // Priorité : avec email > sans email, puis score croissant
    if (a.hasEmail && !b.hasEmail) return -1
    if (!a.hasEmail && b.hasEmail) return 1
    return a.score - b.score
  })

  const output = {
    city,
    niches: nichesToScan,
    scannedAt: new Date().toISOString(),
    total: allLeads.length,
    withEmail: allLeads.filter(l => l.hasEmail).length,
    withPhone: allLeads.filter(l => l.phone).length,
    leads: allLeads
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(console.error)
