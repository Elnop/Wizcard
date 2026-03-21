-- Rename table `collections` → `cards` and columns `row_id` → `id`, `card_id` → `scryfall_id`
ALTER TABLE public.collections RENAME TO cards;
ALTER TABLE public.cards RENAME COLUMN row_id TO id;
ALTER TABLE public.cards RENAME COLUMN card_id TO scryfall_id;

-- Recréer les RLS policies avec le bon nom
DROP POLICY "Users can view their own collection" ON public.cards;
DROP POLICY "Users can insert into their own collection" ON public.cards;
DROP POLICY "Users can update their own collection" ON public.cards;
DROP POLICY "Users can delete from their own collection" ON public.cards;

CREATE POLICY "Users can view their own cards" ON public.cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own cards" ON public.cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cards" ON public.cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cards" ON public.cards FOR DELETE USING (auth.uid() = user_id);

-- Renommer les constraints
ALTER TABLE public.cards RENAME CONSTRAINT collections_foil_type_check TO cards_foil_type_check;
ALTER TABLE public.cards RENAME CONSTRAINT collections_condition_check TO cards_condition_check;