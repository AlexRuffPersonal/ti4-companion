CREATE TABLE public.profiles (
  user_id          UUID        PRIMARY KEY,
  display_name     TEXT,
  preferred_colour TEXT,
  is_admin         BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
