-- Facettes légères d'un lot de prints, pour l'index de collection côté client
-- (tri, filtres, regroupement par oracle_id) sans charger les cartes complètes.
--
-- Lit uniquement le catalogue public (card_prints + card_definitions, RLS
-- « select using (true) ») : security invoker suffit, aucune donnée utilisateur.
-- Appelée en POST par PostgREST (/rpc/card_facets), donc aucune limite d'URL
-- quelle que soit la taille de la collection.
--
-- Les colonnes reproduisent exactement ce que rowsToCard (catalog-db/assembler)
-- met dans une Card : nom/type/texte/couleurs de la définition, set/rareté/
-- artiste/date du print. Un id absent du catalogue ne renvoie simplement pas de
-- ligne ; le client le résout alors via Scryfall.
--
-- Idempotent : create or replace + grant.
create or replace function public.card_facets(p_ids uuid[])
returns table (
  id uuid,
  oracle_id uuid,
  name text,
  lang text,
  layout text,
  "set" text,
  collector_number text,
  rarity text,
  released_at date,
  artist text,
  promo boolean,
  digital boolean,
  cmc numeric,
  colors text[],
  color_identity text[],
  type_line text,
  oracle_text text,
  power text,
  toughness text,
  edhrec_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.oracle_id, d.name, p.lang, d.layout, p.set, p.collector_number,
         p.rarity, p.released_at, p.artist, p.promo, p.digital,
         d.cmc, d.colors, d.color_identity, d.type_line, d.oracle_text,
         d.power, d.toughness, d.edhrec_rank
  from public.card_prints p
  join public.card_definitions d on d.oracle_id = p.oracle_id
  where p.id = any(p_ids);
$$;

grant execute on function public.card_facets(uuid[]) to anon, authenticated;
