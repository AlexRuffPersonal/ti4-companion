import LeaderCard from './LeaderCard';

export default function LeaderPanel({ agent, commander, hero, factionMech, leaderStatus, onUseAbility, onUnlock }) {
  return (
    <div className="panel w-full max-w-lg flex flex-col gap-4">
      <p className="label">LEADERS</p>
      <div className="grid grid-cols-2 gap-3">
        <LeaderCard
          leader={agent}
          status={leaderStatus?.agent}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={commander}
          status={leaderStatus?.commander}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={hero}
          status={leaderStatus?.hero}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={factionMech}
          status="unlocked"
          isMech={true}
        />
      </div>
    </div>
  );
}
