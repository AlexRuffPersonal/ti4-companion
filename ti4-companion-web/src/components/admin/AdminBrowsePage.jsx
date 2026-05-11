import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import importSchemas from '../../lib/importSchemas.js'
import AdminRecordModal from './AdminRecordModal.jsx'

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str
}

export default function AdminBrowsePage() {
  const { table } = useParams()
  const schema = importSchemas[table]
  const [records, setRecords] = useState([])
  const [filterText, setFilterText] = useState('')
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const filterField = schema?.fields?.[0]?.name

  async function fetchRecords() {
    setLoading(true)
    const { data, error: err } = await supabase.from(schema.pgTable).select('*').order(filterField)
    if (err) { setError(err.message); setLoading(false); return }
    setRecords(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (schema) fetchRecords() }, [table])

  if (!schema) return <div className="p-4 text-danger">Unknown table: {table}</div>

  const filtered = records.filter(r =>
    String(r[filterField] ?? '').toLowerCase().includes(filterText.toLowerCase())
  )

  return (
    <div className="p-4">
      <Link to="/admin" className="text-dim text-sm">← Back to Reference Data</Link>
      <h1 className="label mt-2">BROWSE {table.toUpperCase()}</h1>
      {loading && <p className="text-dim">Loading...</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && (
        <>
          <input
            className="input mb-4"
            placeholder={`Filter by ${filterField}`}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          <table className="w-full text-sm">
            <thead>
              <tr>{schema.fields.map(f => <th key={f.name} className="text-left label px-2 py-1">{f.name}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="cursor-pointer hover:bg-panel-inset" onClick={() => setSelectedRecord(r)}>
                  {schema.fields.map(f => (
                    <td key={f.name} className="px-2 py-1 text-dim">
                      {truncate(String(r[f.name] ?? ''), 40)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {selectedRecord && (
        <AdminRecordModal
          table={table}
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onSaved={() => { setSelectedRecord(null); fetchRecords() }}
        />
      )}
    </div>
  )
}
