import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export function parseLrr(text) {
  const lines = text.split('\n')
  const sections = []
  let current = null
  const headerRe = /^## ([\d.]+) (.+)$/

  for (const line of lines) {
    const match = line.match(headerRe)
    if (match) {
      if (current) {
        current.body = current.body.trim()
        sections.push(current)
      }
      current = { number: match[1], title: match[2].trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) {
    current.body = current.body.trim()
    sections.push(current)
  }

  return sections
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

if (process.argv[1] === __filename) {
  const lrrPath = join(__dirname, '..', 'docs', 'ti4-lrr.md')
  const outPath = join(__dirname, '..', 'src', 'data', 'lrr-sections.json')
  const text = readFileSync(lrrPath, 'utf8')
  const sections = parseLrr(text)
  writeFileSync(outPath, JSON.stringify(sections, null, 2))
  console.log(`Wrote ${sections.length} sections`)
}
