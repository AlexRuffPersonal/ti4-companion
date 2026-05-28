import GameIcon from '../shared/GameIcon.jsx'

export default function LeaderCard({ leader, status, onUseAbility, onUnlock, isMech = false, onDeploy, onUseMechAbility }) {
  if (!leader) return null;

  const abilityText = leader.ability_text || leader.text;
  const isPurged = status === 'purged';

  const typeBadge = leader.leader_type && (
    <span className="label uppercase text-xs px-1 py-0.5 border border-border rounded flex items-center gap-1">
      <GameIcon category="leaders" name={leader.leader_type} size={12} alt={leader.leader_type} />
      {leader.leader_type}
    </span>
  );

  const statusChip = status && (
    <span
      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
        status === 'unlocked'
          ? 'bg-success/20 text-success'
          : status === 'exhausted'
          ? 'bg-warning/20 text-warning'
          : status === 'attached'
          ? 'bg-gold/20 text-gold'
          : status === 'purged'
          ? 'bg-danger/20 text-danger'
          : 'bg-muted/20 text-muted'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );

  let actionButton = null;
  if (isMech) {
    const hasDeploy = !!leader.deploy_trigger;
    const hasActiveEffect = Array.isArray(leader.effects) && leader.effects.length > 0;
    if (hasDeploy || hasActiveEffect) {
      actionButton = (
        <div className="mt-auto pt-1 flex gap-2">
          {hasDeploy && (
            <button className="btn-ghost text-xs" onClick={onDeploy}>DEPLOY</button>
          )}
          {hasActiveEffect && (
            <button className="btn-primary text-xs" onClick={onUseMechAbility}>USE ABILITY</button>
          )}
        </div>
      );
    }
  } else if (leader.leader_type === 'agent') {
    if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" onClick={() => onUseAbility(leader)}>
            USE ABILITY
          </button>
        </div>
      );
    } else if (status === 'exhausted') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" disabled>
            USE ABILITY
          </button>
        </div>
      );
    }
  } else if (leader.leader_type === 'commander') {
    if (status === 'locked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-ghost text-xs" onClick={() => onUnlock(leader)}>
            CHECK UNLOCK
          </button>
        </div>
      );
    } else if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <p className="text-xs italic text-muted">Passive — always active</p>
        </div>
      );
    }
  } else if (leader.leader_type === 'hero') {
    if (status === 'locked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-ghost text-xs" onClick={() => onUnlock(leader)}>
            CHECK UNLOCK
          </button>
        </div>
      );
    } else if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" onClick={() => onUseAbility(leader)}>
            USE ABILITY
          </button>
        </div>
      );
    }
  }

  return (
    <div className={`panel-inset flex flex-col gap-2 p-3 ${isPurged ? 'opacity-40' : ''}`}>
      {!isMech && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-sm text-bright">{leader.name}</span>
          {typeBadge}
          {statusChip}
        </div>
      )}
      {isMech && (
        <span className="font-display text-sm text-bright">{leader.name}</span>
      )}
      {abilityText && (
        <p className="text-xs text-dim leading-relaxed">{abilityText}</p>
      )}
      {isMech && (
        <div className="flex items-center gap-3 text-xs font-mono text-muted">
          {leader.cost !== undefined && (
            <span>COST {leader.cost}</span>
          )}
          {leader.combat !== undefined && (
            <span>COMBAT {leader.combat}</span>
          )}
          <span>SUSTAIN</span>
        </div>
      )}
      {!isMech && status === 'locked' && leader.unlock_criteria && (
        <p className="text-xs text-muted italic">{leader.unlock_criteria}</p>
      )}
      {!isPurged && actionButton}
    </div>
  );
}
