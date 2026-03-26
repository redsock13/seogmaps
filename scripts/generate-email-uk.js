#!/usr/bin/env node
/**
 * SEO Maps UK/US — English "Trojan Horse" email generator
 * Reads uk-leads.json or us-leads.json, generates cold emails
 */

const fs = require('fs')

const MARKET = process.argv[2] === 'us' ? 'US' : 'UK'
const CURRENCY = MARKET === 'US' ? '$' : '£'
const PRICE = MARKET === 'US' ? '$199' : '£199'
const SENDER_NAME = 'Sam — mindforge-ia.com'

const leadsFile = `/home/openclaw/.openclaw/workspace/seogmaps/results/${MARKET.toLowerCase()}-leads.json`
const leads = JSON.parse(fs.readFileSync(leadsFile))

// Blacklist generic emails
const BLACKLIST_DOMAINS = ['wix.com', 'webador.fr', 'example.com', 'noreply', 'support@', 'hello@wix']
const BLACKLIST_EMAILS = ['john.doe@', 'user@', 'test@', 'admin@example']

// Demo reviews by niche (English)
const DEMO_REVIEWS = {
  'plumber': {
    neg: { author: 'Mark T.', text: 'Turned up 2 hours late and left a mess behind. Work was fine but communication was poor.', rating: 2 },
    pos: { author: 'Sarah L.', text: 'Excellent service, fixed our boiler in under an hour. Highly recommend!' }
  },
  'electrician': {
    neg: { author: 'James R.', text: 'Had to call back twice as the issue wasn\'t fully resolved first time.', rating: 2 },
    pos: { author: 'Emma W.', text: 'Very professional, neat work and explained everything clearly. 5 stars!' }
  },
  'roofer': {
    neg: { author: 'David H.', text: 'Started the job then disappeared for a week without any update.', rating: 2 },
    pos: { author: 'Claire B.', text: 'Great work on our roof, finished on time and cleaned up perfectly.' }
  },
  'carpenter': {
    neg: { author: 'Paul M.', text: 'Measurements were slightly off, had to adjust afterwards. Disappointing.', rating: 2 },
    pos: { author: 'Lucy K.', text: 'Beautiful fitted wardrobe, exactly what we wanted. Skilled craftsman!' }
  },
  'locksmith': {
    neg: { author: 'Tom F.', text: 'Price quoted over phone was much lower than what was charged.', rating: 2 },
    pos: { author: 'Anna G.', text: 'Arrived within 20 minutes at midnight. Real lifesaver, thank you!' }
  },
  'general contractor': {
    neg: { author: 'Mike D.', text: 'Project ran 3 weeks over schedule with no explanation given.', rating: 2 },
    pos: { author: 'Jennifer S.', text: 'Transformed our kitchen completely. Professional team, great result!' }
  },
  'default': {
    neg: { author: 'John D.', text: 'Service was slow and communication could have been much better.', rating: 2 },
    pos: { author: 'Rachel M.', text: 'Excellent work, very professional and great value. Would use again!' }
  }
}

function getReviews(niche) {
  return DEMO_REVIEWS[niche] || DEMO_REVIEWS['default']
}

function buildEmail(lead, email) {
  const r = getReviews(lead.niche)
  const competitor = `a competitor ${lead.niche} in ${lead.city}`

  const issues = []
  if (lead.reviews < 15) issues.push(`only ${lead.reviews} reviews`)
  if (lead.rating && lead.rating < 4.2) issues.push(`${lead.rating}/5 rating`)
  const issueText = issues.length > 0 ? ` (${issues.join(', ')})` : ''

  const negResponse = `Hi ${r.neg.author.split(' ')[0]}, thank you for your honest feedback. We're sorry to hear about your experience — this isn't the standard we hold ourselves to. We've looked into this and made changes to ensure it doesn't happen again. Please don't hesitate to reach out directly if you'd like to discuss further. 🙏`

  const subject = `Your Google listing ${lead.name} — I've already prepared something for you`

  const html = `<p>Hi,</p>

<p>I was looking at Google Maps listings for ${lead.niche}s in ${lead.city} and noticed that <strong>${lead.name}</strong> has ${lead.reviews} reviews (${lead.rating || '?'}/5)${issueText}.</p>

<p>I noticed that <em>${competitor}</em> is responding to every single review and climbing the Google rankings fast. Here's a response I've already written for your review from ${r.neg.author.split(' ')[0]}:</p>

<hr>
<p>💬 <strong>Original review (${r.neg.rating}⭐):</strong> "${r.neg.text}"</p>
<p>✅ <strong>Ready-to-post reply:</strong><br>"${negResponse}"</p>
<hr>

<p>I've prepared similar responses for your last 3 reviews.</p>

<p><strong>For ${PRICE} flat, delivered in 48 hours:</strong></p>
<ul>
<li>Optimised responses to all your reviews</li>
<li>Google Maps description with local keywords</li>
<li>Guide: "How to get more 5-star reviews"</li>
</ul>

<p>Interested? I reply same day.</p>

<p>${SENDER_NAME} | <a href="https://mindforge-ia.com">mindforge-ia.com</a></p>`

  return { to: email, businessName: lead.name, niche: lead.niche, city: lead.city, country: lead.country, subject, html }
}

// Filter valid leads
const validLeads = leads.filter(l => {
  const email = l.emails[0]
  if (!email) return false
  if (BLACKLIST_DOMAINS.some(d => email.includes(d))) return false
  if (BLACKLIST_EMAILS.some(b => email.startsWith(b))) return false
  return true
}).slice(0, 20)

console.error(`\n✅ ${validLeads.length} valid ${MARKET} prospects\n`)

const batch = validLeads.map(l => buildEmail(l, l.emails[0]))

const outFile = `/home/openclaw/.openclaw/workspace/seogmaps/results/batch-emails-${MARKET.toLowerCase()}.json`
fs.writeFileSync(outFile, JSON.stringify(batch, null, 2))
console.error(`💾 Saved: results/batch-emails-${MARKET.toLowerCase()}.json`)

// Preview
console.error('\n--- FIRST 3 EMAILS PREVIEW ---\n')
batch.slice(0, 3).forEach((e, i) => {
  console.error(`[${i+1}] To: ${e.to}`)
  console.error(`    Business: ${e.businessName} (${e.niche}, ${e.city})`)
  console.error(`    Subject: ${e.subject}`)
  console.error('')
})
