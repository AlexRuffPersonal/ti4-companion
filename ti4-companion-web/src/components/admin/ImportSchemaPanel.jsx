/**
 * ImportSchemaPanel
 *
 * Always-visible schema reference panel rendered on admin import pages.
 * Receives the schema entry for the current table from importSchemas.js,
 * or null/undefined if no schema exists for the table.
 */
export default function ImportSchemaPanel({ schema }) {
  if (!schema) return null

  return (
    <div className="mb-6">
      <p className="label mb-2">SCHEMA REFERENCE</p>
      <div className="panel-inset flex flex-col gap-3">
        {schema.fields.map(field => (
          <div key={field.name}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-bright text-sm">{field.name}</span>
              {field.required
                ? <span className="label text-warning text-xs">required</span>
                : <span className="label text-dim text-xs">optional</span>
              }
              <span className="text-dim text-xs">{field.type}</span>
              {field.default !== undefined && (
                <span className="text-dim text-xs">default: &quot;{field.default}&quot;</span>
              )}
              {field.values && (
                <span className="text-dim text-xs">{field.values.join(' | ')}</span>
              )}
            </div>
            <p className="text-dim text-xs mt-0.5">{field.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
