#!/usr/bin/env node
/**
 * Envoi batch universel avec replyTo → contact.zmimax@gmail.com
 * Usage: node send-batch.js <fichier-json>
 * Ex: node send-batch.js results/batch-emails-uk.json
 */

const https = require('https')
const fs = require('fs')

const BREVO_KEY = process.env.BREVO_API_KEY

function sendEmail({ to, subject, html, senderName }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender: {
        name: senderName || 'Safwane — zmimer.dev',
        email: 'contact@mindforge-ia.com'
      },
      replyTo: {
        email: 'contact.zmimax@gmail.com',
        name: 'Safwane'
      },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node send-batch.js <fichier.json>')
    process.exit(1)
  }

  const batch = JSON.parse(fs.readFileSync(file))
  console.log(`📤 Envoi de ${batch.length} emails depuis ${file}`)
  console.log(`📨 Réponses → contact.zmimax@gmail.com\n`)

  let ok = 0, fail = 0
  for (const e of batch) {
    const res = await sendEmail(e)
    const success = res.status >= 200 && res.status < 300
    console.log(`${success ? '✅' : '❌'} [${res.status}] ${e.to} — ${e.businessName || ''}`)
    if (success) ok++; else fail++
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log(`\n📊 Résultat : ${ok} envoyés, ${fail} échecs`)
  console.log(`📨 Toutes les réponses arrivent dans contact.zmimax@gmail.com`)
}

main().catch(console.error)
