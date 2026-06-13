-- Add home_tile_number to factions (was in original schema design, omitted from initial migration)
ALTER TABLE public.factions
  ADD COLUMN IF NOT EXISTS home_tile_number TEXT;

-- Base game backfill (tile_number values match zero-padded format in the tiles table)
UPDATE public.factions SET home_tile_number = '01' WHERE name = 'The Federation Of Sol';
UPDATE public.factions SET home_tile_number = '02' WHERE name = 'The Mentak Coalition';
UPDATE public.factions SET home_tile_number = '03' WHERE name = 'The Yin Brotherhood';
UPDATE public.factions SET home_tile_number = '04' WHERE name = 'The Embers Of Muaat';
UPDATE public.factions SET home_tile_number = '05' WHERE name = 'The Arborec';
UPDATE public.factions SET home_tile_number = '06' WHERE name = 'The L1Z1X Mindnet';
UPDATE public.factions SET home_tile_number = '07' WHERE name = 'The Winnu';
UPDATE public.factions SET home_tile_number = '08' WHERE name = 'The Nekro Virus';
UPDATE public.factions SET home_tile_number = '09' WHERE name = 'The Naalu Collective';
UPDATE public.factions SET home_tile_number = '10' WHERE name = 'The Barony Of Letnev';
UPDATE public.factions SET home_tile_number = '11' WHERE name = 'The Clan Of Saar';
UPDATE public.factions SET home_tile_number = '12' WHERE name = 'The Universities Of Jol-Nar';
UPDATE public.factions SET home_tile_number = '13' WHERE name = 'Sardakk N''orr';
UPDATE public.factions SET home_tile_number = '14' WHERE name = 'The Xxcha Kingdom';
UPDATE public.factions SET home_tile_number = '15' WHERE name = 'The Yssaril Tribes';
UPDATE public.factions SET home_tile_number = '16' WHERE name = 'The Emirates Of Hacan';
-- Creuss: tile 51 (the planet tile) assigned so players receive their home planet at game start;
-- tile 17 (the gate tile) has no planets and represents a mechanic for later implementation.
UPDATE public.factions SET home_tile_number = '51' WHERE name = 'The Ghosts Of Creuss';

-- PoK backfill
UPDATE public.factions SET home_tile_number = '52' WHERE name = 'The Mahact Gene-Sorcerers';
UPDATE public.factions SET home_tile_number = '53' WHERE name = 'The Nomad';
UPDATE public.factions SET home_tile_number = '54' WHERE name = 'The Vuil''raith Cabal';
UPDATE public.factions SET home_tile_number = '55' WHERE name = 'The Titans Of Ul';
UPDATE public.factions SET home_tile_number = '56' WHERE name = 'The Empyrean';
UPDATE public.factions SET home_tile_number = '57' WHERE name = 'The Naaz-Rokha Alliance';
UPDATE public.factions SET home_tile_number = '58' WHERE name = 'The Argent Flight';
