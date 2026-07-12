-- Normaliza toda a taxonomia de afinidade para 6 grupos únicos:
-- bodybuilding, hyrox, lutas, corrida, triathlon e saude.
-- Também regrava as RPCs do feed para usar creator_profiles.sports como
-- fonte de afinidade e aceitar filtros antigos/novos via normalização.

CREATE OR REPLACE FUNCTION public.normalize_affinity_sport(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  WITH prepared AS (
    SELECT regexp_replace(
      translate(
        lower(trim(COALESCE(raw, ''))),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) AS key
  )
  SELECT CASE
    WHEN key = '' THEN NULL
    WHEN key IN ('bodybuilding', 'musculacao', 'fisiculturismo', 'hipertrofia') THEN 'bodybuilding'
    WHEN key IN ('hyrox', 'crossfit', 'crosstraining', 'funcional', 'wod') THEN 'hyrox'
    WHEN key IN ('lutas', 'luta', 'martialarts', 'jiujitsu', 'boxe', 'muaythai', 'mma', 'karate', 'judo', 'taekwondo')
      THEN 'lutas'
    WHEN key IN ('corrida', 'running', 'runner', 'maratona', 'meiamaratona', '5k', '10k') THEN 'corrida'
    WHEN key IN ('triathlon', 'triatlo', 'ironman', 'cycling', 'ciclismo', 'pedal', 'bike', 'bicicleta', 'spinning', 'swimming', 'natacao', 'nado', 'swim')
      THEN 'triathlon'
    WHEN key IN ('saude', 'nutricao', 'nutrition', 'dieta', 'diet', 'alimentacao', 'wellness', 'health')
      THEN 'saude'
    WHEN key LIKE '%bodybuild%' OR key LIKE '%muscul%' OR key LIKE '%hipertrof%' OR key LIKE '%fisicultur%' THEN 'bodybuilding'
    WHEN key LIKE '%hyrox%' OR key LIKE '%cross%' OR key LIKE '%funcional%' OR key LIKE '%wod%' THEN 'hyrox'
    WHEN key LIKE '%luta%' OR key LIKE '%fight%' OR key LIKE '%martial%' OR key LIKE '%jiu%' OR key LIKE '%box%' OR key LIKE '%muay%' THEN 'lutas'
    WHEN key LIKE '%corr%' OR key LIKE '%run%' OR key LIKE '%maraton%' OR key LIKE '%runner%' THEN 'corrida'
    WHEN key LIKE '%tri%' OR key LIKE '%ironman%' OR key LIKE '%cicl%' OR key LIKE '%cycl%' OR key LIKE '%bike%' OR key LIKE '%pedal%' OR key LIKE '%nat%' OR key LIKE '%swim%' THEN 'triathlon'
    WHEN key LIKE '%saud%' OR key LIKE '%nutri%' OR key LIKE '%diet%' OR key LIKE '%aliment%' OR key LIKE '%wellness%' OR key LIKE '%health%' THEN 'saude'
    ELSE NULL
  END
  FROM prepared;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_affinity_sports(raw text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  WITH taxonomy AS (
    SELECT sport, position
    FROM unnest(ARRAY[
      'bodybuilding',
      'hyrox',
      'lutas',
      'corrida',
      'triathlon',
      'saude'
    ]::text[]) WITH ORDINALITY AS known_sports(sport, position)
  ),
  mapped AS (
    SELECT DISTINCT public.normalize_affinity_sport(sport) AS sport
    FROM unnest(COALESCE(raw, '{}'::text[])) AS values(sport)
  )
  SELECT COALESCE(array_agg(taxonomy.sport ORDER BY taxonomy.position), '{}'::text[])
  FROM taxonomy
  JOIN mapped USING (sport);
$function$;

UPDATE public.creator_profiles
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

UPDATE public.posts
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

UPDATE public.communities
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

UPDATE public.organizations
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

UPDATE public.places
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

UPDATE public.user_preferences
SET sports = public.normalize_affinity_sports(sports)
WHERE sports IS NOT NULL
  AND sports IS DISTINCT FROM public.normalize_affinity_sports(sports);

CREATE OR REPLACE FUNCTION public.feed_home_available_sports()
RETURNS TABLE(sport text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  taxonomy AS (
    SELECT sport, position
    FROM unnest(ARRAY[
      'bodybuilding',
      'hyrox',
      'lutas',
      'corrida',
      'triathlon',
      'saude'
    ]::text[]) WITH ORDINALITY AS known_sports(sport, position)
  ),
  taxonomy_array AS (
    SELECT array_agg(sport ORDER BY position) AS sports
    FROM taxonomy
  ),
  followed_creators AS (
    SELECT cf.creator_id
    FROM public.creator_follows cf, me
    WHERE cf.follower_id = me.uid
      AND cf.status = 'active'
  ),
  prefs AS (
    SELECT DISTINCT unnest(cp.sports) AS sport
    FROM (
      SELECT cf.creator_id
      FROM public.creator_follows cf, me
      WHERE cf.follower_id = me.uid
        AND cf.status = 'active'

      UNION

      SELECT p.creator_id
      FROM public.post_likes pl
      JOIN public.posts p ON p.id = pl.post_id, me
      WHERE pl.user_id = me.uid

      UNION

      SELECT p.creator_id
      FROM public.video_views vv
      JOIN public.posts p ON p.id = vv.post_id, me
      WHERE vv.user_id = me.uid
    ) eng
    JOIN public.creator_profiles cp ON cp.id = eng.creator_id
    WHERE cp.sports IS NOT NULL
  ),
  prefs_sports AS (
    SELECT COALESCE(array_agg(sport), '{}'::text[]) AS sports
    FROM prefs
  ),
  eligible_sports AS (
    SELECT CASE
      WHEN cardinality(COALESCE(p.sports, '{}')) > 0 THEN p.sports
      ELSE COALESCE(cp.sports, '{}')
    END AS sports
    FROM public.posts p
    LEFT JOIN public.creator_profiles cp ON cp.id = p.creator_id,
         me,
         taxonomy_array tx
    WHERE (
        p.creator_id = me.uid
        OR EXISTS (
          SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
        )
      )
      AND (
        p.sports && tx.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cp.sports && tx.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )

    UNION ALL

    SELECT CASE
      WHEN cardinality(COALESCE(p.sports, '{}')) > 0 THEN p.sports
      ELSE COALESCE(cp.sports, '{}')
    END AS sports
    FROM public.posts p
    JOIN public.profiles pf ON pf.id = p.creator_id AND pf.is_creator = true
    JOIN public.creator_profiles cp ON cp.id = p.creator_id
    CROSS JOIN prefs_sports preference,
         me,
         taxonomy_array tx
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND cp.sports && preference.sports
      AND NOT EXISTS (
        SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
      )
      AND (
        p.sports && tx.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cp.sports && tx.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )
  ),
  available AS (
    SELECT DISTINCT value AS sport
    FROM eligible_sports
    CROSS JOIN LATERAL unnest(eligible_sports.sports) AS values(value)
  )
  SELECT taxonomy.sport
  FROM taxonomy
  JOIN available USING (sport)
  ORDER BY taxonomy.position;
$function$;

REVOKE ALL ON FUNCTION public.feed_home_available_sports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_home_available_sports() TO authenticated;

COMMENT ON FUNCTION public.feed_home_available_sports() IS
  'Retorna, em ordem da taxonomia, apenas esportes com conteúdo elegível no feed do usuário autenticado.';

CREATE OR REPLACE FUNCTION public.feed_home_posts_page(
  p_limit integer,
  p_offset integer,
  p_sports text[] DEFAULT NULL::text[]
)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  flt AS (
    SELECT cardinality(sports) > 0 AS active, sports
    FROM (
      SELECT public.normalize_affinity_sports(p_sports) AS sports
    ) normalized
  ),
  followed_creators AS (
    SELECT cf.creator_id
    FROM creator_follows cf, me
    WHERE cf.follower_id = me.uid
      AND cf.status = 'active'
  ),
  prefs AS (
    SELECT pref_sport.sport, SUM(eng.w)::numeric AS weight
    FROM (
      SELECT cf.creator_id, 1.0::numeric AS w
      FROM creator_follows cf, me
      WHERE cf.follower_id = me.uid
        AND cf.status = 'active'

      UNION ALL

      SELECT p.creator_id, 1.5::numeric
      FROM post_likes pl
      JOIN posts p ON p.id = pl.post_id, me
      WHERE pl.user_id = me.uid

      UNION ALL

      SELECT p.creator_id, (0.5 + COALESCE(vv.percentage_watched, 0) / 100.0)::numeric
      FROM video_views vv
      JOIN posts p ON p.id = vv.post_id, me
      WHERE vv.user_id = me.uid
    ) eng
    JOIN creator_profiles cp ON cp.id = eng.creator_id
    CROSS JOIN LATERAL unnest(COALESCE(cp.sports, '{}'::text[])) AS pref_sport(sport)
    GROUP BY pref_sport.sport
  ),
  followed AS (
    SELECT p.id AS post_id,
           p.published_at,
           ROW_NUMBER() OVER (ORDER BY p.published_at DESC NULLS LAST, p.id DESC) AS rn
    FROM public.posts p
    LEFT JOIN creator_profiles cpf ON cpf.id = p.creator_id,
         me,
         flt
    WHERE (
        p.creator_id = me.uid
        OR EXISTS (
          SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
        )
      )
      AND (
        NOT flt.active
        OR p.sports && flt.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cpf.sports && flt.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )
  ),
  recommended AS (
    SELECT p.id AS post_id,
           p.published_at,
           ROW_NUMBER() OVER (
             ORDER BY (
               COALESCE(affinity.weight, 0)
               + LN(1 + COALESCE(p.likes, 0))
               - EXTRACT(EPOCH FROM (now() - COALESCE(p.published_at, now()))) / (60 * 60 * 24 * 30)
             ) DESC,
             p.published_at DESC NULLS LAST,
             p.id DESC
           ) AS rn
    FROM public.posts p
    JOIN profiles pf ON pf.id = p.creator_id AND pf.is_creator = true
    JOIN creator_profiles cp ON cp.id = p.creator_id
    LEFT JOIN LATERAL (
      SELECT SUM(pr.weight) AS weight
      FROM prefs pr
      WHERE pr.sport = ANY(COALESCE(cp.sports, '{}'::text[]))
    ) affinity ON TRUE,
         me,
         flt
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND COALESCE(affinity.weight, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
      )
      AND (
        NOT flt.active
        OR p.sports && flt.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cp.sports && flt.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )
  ),
  combined AS (
    SELECT post_id, (rn + (rn - 1) / 5) AS slot, published_at, 0 AS src
    FROM followed

    UNION ALL

    SELECT post_id, (rn * 6) AS slot, published_at, 1 AS src
    FROM recommended
  )
  SELECT post_id
  FROM combined
  ORDER BY slot, src, published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) TO authenticated;

COMMENT ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) IS
  'Ordena o feed misturando creators seguidos com recomendados por interseção de sports.';

NOTIFY pgrst, 'reload schema';
