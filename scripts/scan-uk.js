#!/usr/bin/env node
/**
 * SEO Maps UK/US — Scanner Google Maps anglophone
 * Cibles avec site web + email extractable
 * Prix : £199 ou $199
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')
const fs = require('fs')

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY

// UK cities (large + medium)
const UK_CITIES = [
  'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Sheffield',
  'Liverpool', 'Leicester', 'Nottingham', 'Southampton', 'Brighton',
  'Newcastle', 'Cardiff', 'Edinburgh', 'Glasgow', 'Belfast',
  'Coventry', 'Bradford', 'Stoke-on-Trent', 'Derby', 'Plymouth',
  'Reading', 'Wolverhampton', 'Norwich', 'Swansea', 'Milton Keynes'
]

// US cities (mid-size = less competition, good prices)
const US_CITIES = [
  'Austin Texas', 'Phoenix Arizona', 'Charlotte North Carolina',
  'Nashville Tennessee', 'Denver Colorado', 'Portland Oregon',
  'Las Vegas Nevada', 'Memphis Tennessee', 'Louisville Kentucky',
  'Baltimore Maryland', 'Milwaukee Wisconsin', 'Albuquerque New Mexico',
  'Tucson Arizona', 'Fresno California', 'Sacramento California'
]

// Niches tradesman (same as France but English)
const NICHES_UK = [
  'plumber', 'electrician', 'roofer', 'carpenter',
  'locksmith', 'painter decorator', 'plasterer',
  'builder', 'heating engineer', 'drainage'
]

const NICHES_US = [
  'plumber', 'electrician', 'roofer', 'HVAC contractor',
  'locksmith', 'painter', 'handyman',
  'general contractor', 'landscaper', 'pest control'
]

const MARKET = process.argv[2] === 'us' ? 'US' : 'UK'
const CITIES = MARKET === 'US' ? US_CITIES : UK_CITIES
const NICHES = MARKET === 'US' ? NICHES_US : NICHES_UK
const CURRENCY = MARKET === 'US' ? '$' : '£'

function httpsGet(url, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? https : http
      let raw = ''
      const req = mod.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
        timeout,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpsGet(res.headers.location, timeout))
          return
        }
        res.on('data', c => { if (raw.length < 100000) raw += c })
        res.on('end', () => resolve(raw))
      })
      req.on('error', () => resolve(''))
      req.on('timeout', () => { req.destroy(); resolve('') })
    } catch { resolve('') }
  })
}

async function searchPlaces(query, city) {
  const body = JSON.stringify({
    textQuery: `${query} ${city}`,
    languageCode: 'en',
    maxResultCount: 20,
    regionCode: MARKET === 'US' ? 'US' : 'GB',
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
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.photos',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({ places: [] }) } })
    })
    req.on('error', () => resolve({ places: [] }))
    req.setTimeout(12000, () => { req.destroy(); resolve({ places: [] }) })
    req.write(body)
    req.end()
  })
}

function extractEmails(html) {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const matches = html.match(emailRegex) || []
  return [...new Set(matches)].filter(e =>
    !e.includes('example') && !e.includes('wixpress') && !e.includes('sentry') &&
    !e.includes('@2x') && !e.endsWith('.png') && !e.endsWith('.jpg') &&
    !e.includes('schema.org') && !e.includes('jquery') &&
    !e.includes('support@wix') && !e.includes('noreply') &&
    e.length < 60
  ).slice(0, 2)
}

async function findEmail(websiteUrl) {
  if (!websiteUrl) return []
  try {
    const html = await httpsGet(websiteUrl, 6000)
    let emails = extractEmails(html)
    if (emails.length === 0) {
      const base = new URL(websiteUrl)
      for (const path of ['/contact', '/contact-us', '/get-in-touch']) {
        const contactHtml = await httpsGet(`${base.origin}${path}`, 5000)
        emails = extractEmails(contactHtml)
        if (emails.length > 0) break
      }
    }
    return emails
  } catch { return [] }
}

function score(place) {
  let s = 100
  if (!place.websiteUri) s -= 25
  if ((place.userRatingCount || 0) < 15) s -= 20
  if (place.rating && place.rating < 4.2) s -= 15
  if (!place.photos || place.photos.length < 3) s -= 15
  if (!place.nationalPhoneNumber) s -= 10
  return Math.max(0, s)
}

async function main() {
  console.error(`\n🌍 SCAN ${MARKET} — Tradesmen with email (${CURRENCY}199/client)`)
  console.error('='.repeat(55))

  const results = []
  const seen = new Set()
  let scanned = 0
  let withEmail = 0

  const cities = CITIES.sort(() => Math.random() - 0.5).slice(0, 12)
  const niches = NICHES.slice(0, 6)

  for (const city of cities) {
    for (const niche of niches) {
      scanned++
      process.stderr.write(`  [${scanned}/${cities.length * niches.length}] ${niche} — ${city}... `)

      const result = await searchPlaces(niche, city)
      const places = result.places || []
      let found = 0

      for (const p of places) {
        const name = p.displayName?.text || ''
        if (!name || seen.has(name)) continue
        if (!p.websiteUri) continue

        const s = score(p)
        if (s >= 85) continue

        const emails = await findEmail(p.websiteUri)
        if (emails.length === 0) continue

        seen.add(name)
        withEmail++
        found++
        results.push({
          name,
          niche,
          city,
          country: MARKET,
          currency: CURRENCY,
          address: p.formattedAddress || '',
          rating: p.rating || null,
          reviews: p.userRatingCount || 0,
          website: p.websiteUri,
          phone: p.nationalPhoneNumber || null,
          emails,
          score: s,
          id: p.id || '',
        })

        process.stderr.write(`✅ ${name} — ${emails[0]}\n`)

        if (withEmail >= 50) break
        await new Promise(r => setTimeout(r, 400))
      }

      if (found === 0) process.stderr.write('—\n')
      if (withEmail >= 50) break
      await new Promise(r => setTimeout(r, 600))
    }
    if (withEmail >= 50) break
  }

  console.error(`\n✅ ${withEmail} prospects with email found`)

  results.sort((a, b) => a.score - b.score)

  const outFile = `/home/openclaw/.openclaw/workspace/seogmaps/results/${MARKET.toLowerCase()}-leads.json`
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2))
  console.error(`💾 Saved: results/${MARKET.toLowerCase()}-leads.json`)
}

main().catch(console.error)
