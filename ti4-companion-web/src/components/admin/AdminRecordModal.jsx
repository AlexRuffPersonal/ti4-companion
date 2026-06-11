import { useState, useEffect } from 'react'
import importSchemas from '../../lib/importSchemas.js'
import { updateRecord } from '../../lib/edgeFunctions.js'

const JSON_TYPES = ['JSONB', 'JSONB array', 'text array', 'TEXT array', 'object', 'array']

function initFields(schema, record) {
  const fields = {}
  for (const f of schema.fields) {
    if (JSON_TYPES.includes(f.type)) {
      fields[f.name] = record[f.name] != null ? JSON.stringify(record[f.name], null, 2) : ''
    } else if (f.type === 'boolean') {
      fields[f.name] = String(record[f.name] ?? '')
    } else {
      fields[f.name] = String(record[f.name] ?? '')
    }
  }
  return fields
}

export default function AdminRecordModal({ table, record, onClose, onSaved }) {
  const schema = importSchemas[table]
  const [fields, setFields] = useState(() => initFields(schema, record))
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function renderControl(f) {
    const val = fields[f.name] ?? ''
    const set = (v) => setFields(prev => ({ ...prev, [f.name]: v }))
    if (f.values) {
      return (
        <select className="input" value={val} onChange={e => set(e.target.value)}>
          {f.values.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )
    }
    if (f.type === 'boolean') {
      return (
        <select className="input" value={val} onChange={e => set(e.target.value)}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    }
    if (f.type === 'integer' || f.type === 'numeric') {
      return <input type="number" className="input" value={val} onChange={e => set(e.target.value)} />
    }
    if (JSON_TYPES.includes(f.type)) {
      return <textarea rows={4} className="input font-mono text-xs" value={val} onChange={e => set(e.target.value)} />
    }
    return <input type="text" className="input" value={val} onChange={e => set(e.target.value)} />
  }

  async function handleSave() {
    setSubmitting(true)
    setStatus(null)
    const payload = { id: record.id }
    for (const f of schema.fields) {
      try {
        if (JSON_TYPES.includes(f.type)) {
          payload[f.name] = JSON.parse(fields[f.name])
        } else if (f.type === 'integer' || f.type === 'numeric') {
          payload[f.name] = Number(fields[f.name])
        } else if (f.type === 'boolean') {
          payload[f.name] = fields[f.name] === 'true'
        } else {
          payload[f.name] = fields[f.name]
        }
      } catch {
        setStatus({ type: 'error', message: `Invalid JSON in field: ${f.name}` })
        setSubmitting(false)
        return
      }
    }
    try {
      await updateRecord(schema.pgTable, payload)
      setStatus({ type: 'success', message: 'Saved.' })
      onSaved()
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const firstField = schema.fields[0]

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="panel w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <p className="label">EDIT {firstField.name.toUpperCase()}: {record[firstField.name]}</p>
        <p className="text-dim text-xs mb-4">id: {record.id}</p>
        {schema.fields.map(f => (
          <div key={f.name} className="mb-3">
            <p className="label text-xs">{f.name}{f.required ? ' *' : ''}</p>
            {renderControl(f)}
            {f.description && <p className="text-dim text-xs mt-1">{f.description}</p>}
          </div>
        ))}
        {status && (
          <p className={status.type === 'success' ? 'text-success text-sm mb-2' : 'text-danger text-sm mb-2'}>
            {status.message}
          </p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
