import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { importTable } from '../../lib/edgeFunctions.js'
import importSchemas from '../../lib/importSchemas.js'
import ImportSchemaPanel from './ImportSchemaPanel.jsx'

const TABLE_LABELS = {
  'tiles':             'Tiles',
  'factions':          'Factions',
  'agendas':           'Agendas',
  'action-cards':      'Action Cards',
  'technologies':      'Technologies',
  'units':             'Units',
  'public-objectives': 'Public Objectives',
  'secret-objectives': 'Secret Objectives',
  'relics':            'Relics',
  'exploration-cards': 'Exploration Cards',
  'attachments':       'Attachments',
  'promissory-notes':  'Promissory Notes',
}

export default function AdminImportPage() {
  const { table } = useParams()
  const [json, setJson]             = useState('')
  const [status, setStatus]         = useState(null) // null | { type: 'success'|'error', message: string }
  const [submitting, setSubmitting] = useState(false)

  const label = TABLE_LABELS[table] ?? table

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    let records
    try {
      records = JSON.parse(json)
      if (!Array.isArray(records)) throw new Error('Expected a JSON array')
    } catch (err) {
      setStatus({ type: 'error', message: `Invalid JSON: ${err.message}` })
      return
    }

    setSubmitting(true)
    try {
      const { imported } = await importTable(table, records)
      setJson('')
      setStatus({
        type: 'success',
        message: `${imported} records imported. All existing ${label} records replaced.`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: `Import failed: ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-void p-8 max-w-2xl">
      <Link to="/admin" className="label text-muted hover:text-text mb-6 inline-block">
        ← Back to Reference Data
      </Link>
      <h1 className="font-display text-bright text-xl tracking-widest mb-2">
        IMPORT {label.toUpperCase()}
      </h1>
      <p className="text-dim text-sm mb-6">
        Replaces all existing {label} records.
      </p>

      <ImportSchemaPanel schema={importSchemas[table]} />

      {status && (
        <div
          className={`panel-inset mb-6 text-sm ${
            status.type === 'success' ? 'text-success' : 'text-danger'
          }`}
        >
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          className="input font-mono text-xs h-48 resize-y"
          placeholder={`[{"name": "...", ...}, ...]`}
          value={json}
          onChange={e => setJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Importing...' : `Import ${label}`}
          </button>
        </div>
      </form>
    </div>
  )
}
