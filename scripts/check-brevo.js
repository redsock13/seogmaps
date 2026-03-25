#!/usr/bin/env node
/**
 * Brevo tracker — vérifie les ouvertures et réponses
 * Lance chaque matin pour avoir les stats de la veille
 */

const https = require('https')
const BREVO_KEY = process.env.BREVO_API_KEY

function brevoGet(path) {
  return new Promise((resolve) => {
    let raw = ''
    https.get({
      hostname: 'api.brevo.com',
      path,
      headers: { 'api-key': BREVO_KEY, 'Accept': 'application/json' }
    }, (res) => {
      res.on('data', c => raw += c)
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
    }).on('error', () => resolve({}))
  })
}

async function main() {
  console.log('\n📊 RAPPORT BREVO — ' + new Date().toLocaleDateString('fr-FR'))
  console.log('='.repeat(50))

  // Stats transactionnels (emails individuels)
  const stats = await brevoGet('/v3/smtp/statistics/aggregatedReport?days=1')
  console.log('\n📧 Emails hier :')
  console.log(`  Envoyés    : ${stats.delivered || 0}`)
  console.log(`  Ouverts    : ${stats.uniqueOpens || 0}`)
  console.log(`  Cliqués    : ${stats.uniqueClicks || 0}`)
  console.log(`  Bounces    : ${stats.hardBounces || 0 + stats.softBounces || 0}`)
  console.log(`  Spam       : ${stats.spamReports || 0}`)

  // Taux
  const sent = stats.delivered || 1
  const openRate = ((stats.uniqueOpens || 0) / sent * 100).toFixed(1)
  const clickRate = ((stats.uniqueClicks || 0) / sent * 100).toFixed(1)
  console.log(`\n  Taux ouverture : ${openRate}%`)
  console.log(`  Taux clic      : ${clickRate}%`)

  // Alerte si spam > 0
  if (stats.spamReports > 0) {
    console.log(`\n  ⚠️  ALERTE : ${stats.spamReports} signalement(s) spam — réduire le volume !`)
  }

  // Events récents (qui a cliqué)
  const events = await brevoGet('/v3/smtp/statistics/events?limit=10&event=clicks&days=1')
  const clicks = events.events || []
  if (clicks.length > 0) {
    console.log('\n🔥 Clics récents (prospects chauds) :')
    clicks.forEach(e => {
      console.log(`  → ${e.email} a cliqué à ${e.date}`)
    })
  }

  // Bounces à nettoyer
  const bounces = await brevoGet('/v3/smtp/statistics/events?limit=10&event=hardBounces&days=7')
  const hardBounces = (bounces.events || []).map(e => e.email)
  if (hardBounces.length > 0) {
    console.log('\n❌ Emails invalides à supprimer :')
    hardBounces.forEach(e => console.log(`  → ${e}`))
  }

  console.log('\n' + '='.repeat(50))
}

main().catch(console.error)
