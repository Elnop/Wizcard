-- Classe les profils publics par nombre de decks PUBLICS (source='user'),
-- décroissant. Alimente le tri par défaut de la section "Joueurs" de la landing
-- /search quand aucun terme n'est saisi. user_usage.deck_count ne convient pas :
-- il compte aussi les decks privés et ne filtre pas is_public.
--
-- security_invoker : la vue s'exécute avec les droits de l'appelant, donc les RLS
-- de profiles/decks s'appliquent (un anon ne voit que le public). SANS ça la vue
-- tournerait avec les droits du créateur et fuiterait profils/decks privés.
--
-- LEFT JOIN : tous les profils nommés apparaissent, ceux à 0 deck public en bas.
-- Tri secondaire nickname pour un ordre total déterministe (sinon pagination par
-- offset instable sur les ex æquo).
create or replace view public.profiles_by_public_deck_count
with (security_invoker = true) as
select
  p.id,
  p.nickname,
  p.description,
  p.avatar_url,
  count(d.id) as public_deck_count
from public.profiles p
left join public.decks d
  on d.owner_id = p.id
  and d.is_public = true
  and d.source = 'user'
where p.nickname is not null
group by p.id, p.nickname, p.description, p.avatar_url
order by public_deck_count desc, p.nickname asc;

grant select on public.profiles_by_public_deck_count to anon, authenticated;
