CREATE TABLE public.tiles (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_number    TEXT    NOT NULL,
  type           TEXT    NOT NULL,
  expansion      TEXT    NOT NULL DEFAULT 'base',
  planets        JSONB   NOT NULL DEFAULT '[]',
  wormholes      TEXT[]  NOT NULL DEFAULT '{}',
  anomalies      TEXT[]  NOT NULL DEFAULT '{}',
  starts_off_board BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiles_select"      ON public.tiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tiles_admin_write" ON public.tiles FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
