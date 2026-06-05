-- supabase/migrations/20260605000002_add_display_name.sql
ALTER TABLE public.custom_cards
  ADD COLUMN IF NOT EXISTS display_name text;
