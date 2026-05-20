-- 053_titans_ul_attachments.sql
-- Registers the Ul The Progenitor hero action in the ability system.
-- purges_source = false because the handler sets leaders.hero = 'attached' directly.

INSERT INTO ability_definitions (ability_key, ability_name, trigger, handler, exhausts_source, purges_source)
VALUES (
  'ul_progenitor_hero',
  'Ul The Progenitor',
  '{"timing":"action"}',
  'ul_progenitor_hero',
  false,
  false
);

INSERT INTO ability_sources (ability_id, source_type, source_id)
SELECT d.id, 'leader', l.id
FROM ability_definitions d, leaders l
WHERE d.ability_key = 'ul_progenitor_hero'
  AND l.name = 'Ul The Progenitor';
