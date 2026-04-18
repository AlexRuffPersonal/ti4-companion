import { useNavigate } from 'react-router-dom'

const GROUPS = [
  {
    label: 'Map & Units',
    tables: [
      { name: 'Tiles', key: 'tiles' },
      { name: 'Units', key: 'units' },
      { name: 'Attachments', key: 'attachments' },
    ],
  },
  {
    label: 'Factions',
    tables: [
      { name: 'Factions', key: 'factions' },
      { name: 'Technologies', key: 'technologies' },
      { name: 'Promissory Notes', key: 'promissory-notes' },
    ],
  },
  {
    label: 'Cards & Agendas',
    tables: [
      { name: 'Agendas', key: 'agendas' },
      { name: 'Action Cards', key: 'action-cards' },
      { name: 'Exploration Cards', key: 'exploration-cards' },
      { name: 'Relics', key: 'relics' },
    ],
  },
  {
    label: 'Objectives',
    tables: [
      { name: 'Public Objectives', key: 'public-objectives' },
      { name: 'Secret Objectives', key: 'secret-objectives' },
    ],
  },
  {
    label: 'Abilities',
    tables: [
      { name: 'Ability Definitions', key: 'ability-definitions' },
      { name: 'Ability Sources', key: 'ability-sources' },
    ],
  },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-void p-8">
      <h1 className="font-display text-bright text-xl tracking-widest mb-8">
        REFERENCE DATA
      </h1>
      <div className="flex flex-col gap-8">
        {GROUPS.map(({ label, tables }) => (
          <div key={label}>
            <div className="label mb-3">{label}</div>
            <div className="flex flex-wrap gap-3">
              {tables.map(({ name, key }) => (
                <button
                  key={key}
                  className="btn-ghost"
                  onClick={() => navigate(`/admin/import/${key}`)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
