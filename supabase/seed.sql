-- ============================================================
-- ZooMatch: Seed Data
-- File: supabase/seed.sql
-- ============================================================
-- Run AFTER migration 202610230001_multidimensional_v2.sql
-- This seed is IDEMPOTENT: uses INSERT ... ON CONFLICT DO UPDATE
-- so it can be run multiple times safely.
--
-- Data sources:
--   Animals & Colors: data/arquetipos.json (61 animals, 55 colors)
--   Quiz Items:       data/microtest.json (60 items)

BEGIN;

-- ─── 1. Seed Animals (61 entries) ─────────────────────────────

INSERT INTO public.animals (id, nombre_fuente, diminutivo_es, categoria_fauna, personality_affinity) VALUES
  ('ajolotito', 'Axolotl', 'ajolotito', 'anfibio', '{"personalidad_apertura":0.9,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.8}'),
  ('mantisita', 'Mantis', 'mantisita', 'insecto', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.2,"personalidad_responsabilidad":0.8,"personalidad_estabilidad_emocional":0.6}'),
  ('cuervito', 'Crow', 'cuervito', 'ave', '{"personalidad_apertura":0.95,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.7,"personalidad_estabilidad_emocional":0.6}'),
  ('colibrito', 'Hummingbird', 'colibrito', 'ave', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.9,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.5}'),
  ('erizito', 'Hedgehog', 'erizito', 'mamifero', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.7}'),
  ('mariposita', 'Butterfly', 'mariposita', 'insecto', '{"personalidad_apertura":0.85,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.5}'),
  ('caballito', 'Seahorse', 'caballito', 'pez', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.7}'),
  ('delfincito', 'Dolphin', 'delfincito', 'mamifero', '{"personalidad_apertura":0.85,"personalidad_extraversion":0.95,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.7}'),
  ('pulpito', 'Octopus', 'pulpito', 'molusco', '{"personalidad_apertura":0.95,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.5}'),
  ('buhito', 'Owl', 'buhito', 'ave', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.7,"personalidad_estabilidad_emocional":0.8}'),
  ('lobito', 'Wolf', 'lobito', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.8,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.7}'),
  ('zorrito', 'Fox', 'zorrito', 'mamifero', '{"personalidad_apertura":0.9,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.6}'),
  ('gatito', 'Cat', 'gatito', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.8}'),
  ('perrito', 'Dog', 'perrito', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.95,"personalidad_amabilidad":0.9,"personalidad_responsabilidad":0.7,"personalidad_estabilidad_emocional":0.7}'),
  ('leoncito', 'Lion', 'leoncito', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.85,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.8}'),
  ('tigrito', 'Tiger', 'tigrito', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.8}'),
  ('osito', 'Bear', 'osito', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.85}'),
  ('pandita', 'Panda', 'pandita', 'mamifero', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.9,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.9}'),
  ('koalita', 'Koala', 'koalita', 'mamifero', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.95}'),
  ('suricatita', 'Meerkat', 'suricatita', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.9,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.8,"personalidad_estabilidad_emocional":0.5}'),
  ('nutria', 'Otter', 'nutria', 'mamifero', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.9,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.6}'),
  ('castorcito', 'Beaver', 'castorcito', 'mamifero', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.95,"personalidad_estabilidad_emocional":0.7}'),
  ('ardillita', 'Squirrel', 'ardillita', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.8,"personalidad_estabilidad_emocional":0.5}'),
  ('conejito', 'Rabbit', 'conejito', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.4}'),
  ('venadito', 'Deer', 'venadito', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.6}'),
  ('jaguarito', 'Jaguar', 'jaguarito', 'mamifero', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.9}'),
  ('pumita', 'Puma', 'pumita', 'mamifero', '{"personalidad_apertura":0.75,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.85}'),
  ('guacamayito', 'Macaw', 'guacamayito', 'ave', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.9,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.5}'),
  ('tucancito', 'Toucan', 'tucancito', 'ave', '{"personalidad_apertura":0.75,"personalidad_extraversion":0.7,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.6}'),
  ('quetzalito', 'Quetzal', 'quetzalito', 'ave', '{"personalidad_apertura":0.85,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.7}'),
  ('pelicanito', 'Pelican', 'pelicanito', 'ave', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.7}'),
  ('flamenco', 'Flamingo', 'flamenco', 'ave', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.8,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.6}'),
  ('garcita', 'Heron', 'garcita', 'ave', '{"personalidad_apertura":0.65,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.8,"personalidad_estabilidad_emocional":0.85}'),
  ('patito', 'Duckling', 'patito', 'ave', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.7,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.6}'),
  ('cisnecito', 'Swan', 'cisnecito', 'ave', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.8}'),
  ('focita', 'Seal', 'focita', 'mamifero', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.7,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.7}'),
  ('morsita', 'Walrus', 'morsita', 'mamifero', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.8}'),
  ('ballenita', 'Whale', 'ballenita', 'mamifero', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.8,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.9}'),
  ('tiburoncito', 'Shark', 'tiburoncito', 'pez', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.2,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.9}'),
  ('medusita', 'Jellyfish', 'medusita', 'cnidario', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.2,"personalidad_estabilidad_emocional":0.9}'),
  ('estrellita', 'Starfish', 'estrellita', 'equinodermo', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.9}'),
  ('cangrejito', 'Crab', 'cangrejito', 'crustaceo', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.7}'),
  ('langostita', 'Lobster', 'langostita', 'crustaceo', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.7}'),
  ('caracolito', 'Snail', 'caracolito', 'molusco', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.95}'),
  ('luciernita', 'Firefly', 'luciernita', 'insecto', '{"personalidad_apertura":0.75,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.5}'),
  ('abejita', 'Bee', 'abejita', 'insecto', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.7,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.95,"personalidad_estabilidad_emocional":0.6}'),
  ('avispita', 'Wasp', 'avispita', 'insecto', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.2,"personalidad_responsabilidad":0.7,"personalidad_estabilidad_emocional":0.5}'),
  ('hormiguita', 'Ant', 'hormiguita', 'insecto', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.98,"personalidad_estabilidad_emocional":0.7}'),
  ('escarabajito', 'Beetle', 'escarabajito', 'insecto', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.7,"personalidad_estabilidad_emocional":0.8}'),
  ('libelula', 'Dragonfly', 'libelula', 'insecto', '{"personalidad_apertura":0.8,"personalidad_extraversion":0.7,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.6}'),
  ('polillita', 'Moth', 'polillita', 'insecto', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.5}'),
  ('grillito', 'Cricket', 'grillito', 'insecto', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.5,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.6}'),
  ('saltamontes', 'Grasshopper', 'saltamontes', 'insecto', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.5}'),
  ('camaleoncito', 'Chameleon', 'camaleoncito', 'reptil', '{"personalidad_apertura":0.9,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.3,"personalidad_responsabilidad":0.5,"personalidad_estabilidad_emocional":0.7}'),
  ('iguanita', 'Iguana', 'iguanita', 'reptil', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.85}'),
  ('lagartijita', 'Lizard', 'lagartijita', 'reptil', '{"personalidad_apertura":0.6,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.4,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.7}'),
  ('geckito', 'Gecko', 'geckito', 'reptil', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.4,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.7}'),
  ('tortuguita', 'Turtle', 'tortuguita', 'reptil', '{"personalidad_apertura":0.4,"personalidad_extraversion":0.2,"personalidad_amabilidad":0.7,"personalidad_responsabilidad":0.6,"personalidad_estabilidad_emocional":0.98}'),
  ('ranita', 'Frog', 'ranita', 'anfibio', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.6,"personalidad_amabilidad":0.6,"personalidad_responsabilidad":0.3,"personalidad_estabilidad_emocional":0.5}'),
  ('sapito', 'Toad', 'sapito', 'anfibio', '{"personalidad_apertura":0.5,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.8}'),
  ('salamandrita', 'Salamander', 'salamandrita', 'anfibio', '{"personalidad_apertura":0.7,"personalidad_extraversion":0.3,"personalidad_amabilidad":0.5,"personalidad_responsabilidad":0.4,"personalidad_estabilidad_emocional":0.7}')
ON CONFLICT (id) DO UPDATE SET
  nombre_fuente = EXCLUDED.nombre_fuente,
  diminutivo_es = EXCLUDED.diminutivo_es,
  categoria_fauna = EXCLUDED.categoria_fauna,
  personality_affinity = EXCLUDED.personality_affinity;

-- ─── 2. Seed Colors (55 entries) ──────────────────────────────

INSERT INTO public.colors (id, nombre, hex, textura, temperatura) VALUES
  ('verde-esmeralda', 'Verde esmeralda', '#50C878', 'cristalina', 'frio'),
  ('rosa-pastel', 'Rosa pastel', '#FFB6C1', 'sedosa', 'calido'),
  ('negro-obsidiana', 'Negro obsidiana', '#0B1304', 'mate', 'neutro'),
  ('azul-zafiro', 'Azul zafiro', '#0F52BA', 'cristalina', 'frio'),
  ('rojo-rubi', 'Rojo rubí', '#E0115F', 'cristalina', 'calido'),
  ('morado-amatista', 'Morado amatista', '#9966CC', 'cristalina', 'frio'),
  ('naranja-ambar', 'Naranja ámbar', '#FFBF00', 'luminosa', 'calido'),
  ('amarillo-topacio', 'Amarillo topacio', '#FFC87C', 'luminosa', 'calido'),
  ('blanco-perla', 'Blanco perla', '#F5F5F5', 'sedosa', 'neutro'),
  ('gris-plata', 'Gris plata', '#C0C0C0', 'metalica', 'frio'),
  ('dorado-miel', 'Dorado miel', '#EB9605', 'metalica', 'calido'),
  ('plateado-lunar', 'Plateado lunar', '#D6D6D6', 'metalica', 'frio'),
  ('turquesa-oceano', 'Turquesa océano', '#40E0D0', 'acuosa', 'frio'),
  ('coral-sunset', 'Coral sunset', '#FF7F50', 'sedosa', 'calido'),
  ('lavanda-suave', 'Lavanda suave', '#E6E6FA', 'aterciopelada', 'frio'),
  ('lila-nebulosa', 'Lila nebulosa', '#C8A2C8', 'aterciopelada', 'frio'),
  ('indigo-profundo', 'Índigo profundo', '#4B0082', 'aterciopelada', 'frio'),
  ('violeta-cosmos', 'Violeta cosmos', '#7F00FF', 'luminosa', 'frio'),
  ('magenta-vibrante', 'Magenta vibrante', '#FF00FF', 'luminosa', 'calido'),
  ('fucsia-tropical', 'Fucsia tropical', '#FF77A9', 'sedosa', 'calido'),
  ('cereza-intenso', 'Cereza intenso', '#DE3163', 'aterciopelada', 'calido'),
  ('vino-tinto', 'Vino tinto', '#722F37', 'aterciopelada', 'calido'),
  ('terracota-calida', 'Terracota cálida', '#E2725B', 'terrosa', 'calido'),
  ('arena-dorada', 'Arena dorada', '#C2B280', 'terrosa', 'calido'),
  ('marfil-antiguo', 'Marfil antiguo', '#FFFFF0', 'sedosa', 'neutro'),
  ('jade-misterioso', 'Jade misterioso', '#00A86B', 'cristalina', 'frio'),
  ('esmeralda-bosque', 'Esmeralda bosque', '#046307', 'mate', 'frio'),
  ('zafiro-medianoche', 'Zafiro medianoche', '#191970', 'cristalina', 'frio'),
  ('rubi-pasion', 'Rubí pasión', '#9B111E', 'cristalina', 'calido'),
  ('ambar-solar', 'Ámbar solar', '#FF7E00', 'luminosa', 'calido'),
  ('citrino-brillante', 'Citrino brillante', '#E4D00A', 'cristalina', 'calido'),
  ('perla-iridiscente', 'Perla iridiscente', '#FDEEF4', 'sedosa', 'neutro'),
  ('opalo-multicolor', 'Ópalo multicolor', '#A8C3BC', 'cristalina', 'neutro'),
  ('onix-profundo', 'Ónix profundo', '#353839', 'mate', 'neutro'),
  ('cuarzo-rosa', 'Cuarzo rosa', '#F7CAC9', 'cristalina', 'calido'),
  ('aguamarina', 'Aguamarina', '#7FFFD4', 'acuosa', 'frio'),
  ('cian-electrico', 'Cian eléctrico', '#00FFFF', 'luminosa', 'frio'),
  ('chartreuse-luminoso', 'Chartreuse luminoso', '#7FFF00', 'luminosa', 'calido'),
  ('bermellon-fuego', 'Bermellón fuego', '#E34234', 'luminosa', 'calido'),
  ('carmesi-noble', 'Carmesí noble', '#DC143C', 'aterciopelada', 'calido'),
  ('malva-delicado', 'Malva delicado', '#E0B0FF', 'sedosa', 'frio'),
  ('salvia-serena', 'Salvia serena', '#BCB88A', 'mate', 'neutro'),
  ('musgo-profundo', 'Musgo profundo', '#8A9A5B', 'terrosa', 'frio'),
  ('oliva-dorado', 'Oliva dorado', '#808000', 'terrosa', 'calido'),
  ('canela-calida', 'Canela cálida', '#D2691E', 'terrosa', 'calido'),
  ('chocolate-rico', 'Chocolate rico', '#7B3F00', 'terrosa', 'calido'),
  ('cafe-suave', 'Café suave', '#C4A484', 'terrosa', 'calido'),
  ('bronce-antiguo', 'Bronce antiguo', '#CD7F32', 'metalica', 'calido'),
  ('cobre-brillante', 'Cobre brillante', '#B87333', 'metalica', 'calido'),
  ('oro-rosa', 'Oro rosa', '#B76E79', 'metalica', 'calido'),
  ('titanio-oscuro', 'Titanio oscuro', '#878681', 'metalica', 'frio'),
  ('acero-azul', 'Acero azul', '#4682B4', 'metalica', 'frio'),
  ('platino-frio', 'Platino frío', '#E5E4E2', 'metalica', 'frio'),
  ('iridio-raro', 'Iridio raro', '#5C5B57', 'metalica', 'neutro'),
  ('tungsteno-noble', 'Tungsteno noble', '#4A4A4A', 'metalica', 'neutro')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  hex = EXCLUDED.hex,
  textura = EXCLUDED.textura,
  temperatura = EXCLUDED.temperatura;

-- ─── 3. Seed Quiz Items (60 entries) ───────────────────────

INSERT INTO public.quiz_items_v2 (id, categoria, subcategoria, prompt, tipo_respuesta, opciones, polarity, weights, track_romance, track_amistad, filtro_duro, campo_perfil, source_id) VALUES
  -- personalidad_bigfive (10 items)
  ('PB01', 'personalidad_bigfive', 'apertura', 'Disfruto explorar ideas abstractas y conceptos nuevos aunque no tengan aplicación inmediata.', 'likert_5', NULL, 'positiva', '{"personalidad_apertura":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB02', 'personalidad_bigfive', 'apertura', 'Prefiero mantener mis rutinas conocidas antes que experimentar actividades o perspectivas nuevas.', 'likert_5', NULL, 'negativa', '{"personalidad_apertura":-1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB03', 'personalidad_bigfive', 'responsabilidad', 'Organizo mi tiempo para entregar trabajos universitarios antes de la fecha límite.', 'likert_5', NULL, 'positiva', '{"personalidad_responsabilidad":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB04', 'personalidad_bigfive', 'responsabilidad', 'Me cuesta cumplir con mis compromisos académicos cuando tengo muchas actividades a la vez.', 'likert_5', NULL, 'negativa', '{"personalidad_responsabilidad":-1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB05', 'personalidad_bigfive', 'extraversion', 'Me energiza conocer gente nueva en eventos del campus o en grupos de estudio.', 'likert_5', NULL, 'positiva', '{"personalidad_extraversion":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB06', 'personalidad_bigfive', 'extraversion', 'En reuniones grandes prefiero quedarme en un rincón conversando con una o dos personas.', 'likert_5', NULL, 'negativa', '{"personalidad_extraversion":-1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB07', 'personalidad_bigfive', 'amabilidad', 'Me importa genuinamente cómo se sienten las personas a mi alrededor y lo demuestro.', 'likert_5', NULL, 'positiva', '{"personalidad_amabilidad":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB08', 'personalidad_bigfive', 'amabilidad', 'Cuando alguien de mi equipo tiene dificultades, ofrezco mi apoyo sin esperar que lo pidan.', 'likert_5', NULL, 'positiva', '{"personalidad_amabilidad":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB09', 'personalidad_bigfive', 'estabilidad_emocional', 'Manejo bien la presión durante períodos de exámenes sin sentir que pierdo el control emocional.', 'likert_5', NULL, 'positiva', '{"personalidad_estabilidad_emocional":1}', true, true, false, NULL, 'big-five-inventory'),
  ('PB10', 'personalidad_bigfive', 'estabilidad_emocional', 'Después de un conflicto interpersonal, recupero mi calma y claridad mental con relativa rapidez.', 'likert_5', NULL, 'positiva', '{"personalidad_estabilidad_emocional":1}', true, true, false, NULL, 'big-five-inventory'),
  -- personalidad_mbti (8 items)
  ('PM01', 'personalidad_mbti', 'extraversion', 'Después de una semana intensa de clases, prefiero salir con gente que quedarme en casa a solas.', 'likert_5', NULL, 'positiva', '{"mbti_extraversion":1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM02', 'personalidad_mbti', 'extraversion', 'Necesito tiempo a solas para recargar energía después de socializar varios días seguidos.', 'likert_5', NULL, 'negativa', '{"mbti_extraversion":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM03', 'personalidad_mbti', 'intuicion', 'Me emociona imaginar posibilidades futuras y conexiones entre ideas más que enfocarme solo en datos concretos.', 'likert_5', NULL, 'positiva', '{"mbti_intuicion":1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM04', 'personalidad_mbti', 'intuicion', 'Confío más en hechos verificables y experiencias concretas que en corazonadas o intuiciones.', 'likert_5', NULL, 'negativa', '{"mbti_intuicion":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM05', 'personalidad_mbti', 'pensamiento', 'Al tomar decisiones importantes, priorizo el análisis lógico sobre las consideraciones emocionales.', 'likert_5', NULL, 'positiva', '{"mbti_pensamiento":1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM06', 'personalidad_mbti', 'pensamiento', 'Cuando alguien cercano me cuenta un problema, mi primer impulso es proponer soluciones prácticas.', 'likert_5', NULL, 'positiva', '{"mbti_pensamiento":1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM07', 'personalidad_mbti', 'juicio', 'Prefiero tener planes definidos y una estructura clara antes de que llegue el fin de semana.', 'likert_5', NULL, 'positiva', '{"mbti_juicio":1}', true, true, false, NULL, 'zoomatch-original'),
  ('PM08', 'personalidad_mbti', 'juicio', 'Me siento más cómodx cuando sé qué esperar y puedo anticiparme a lo que viene.', 'likert_5', NULL, 'positiva', '{"mbti_juicio":1}', true, true, false, NULL, 'zoomatch-original'),
  -- identidad_filtros (8 items: 3 hard filters + 5 soft)
  ('IF01', 'identidad_filtros', 'orientacion', '¿Con qué género(s) te sientes atraídx romántica/sexualmente?', 'seleccion_multiple', '["hombres","mujeres","personas no binarias","todxs","demisexual","asexual","prefiero no decir"]', NULL, '{}', true, false, true, 'orientacion_sexual', 'zoomatch-original'),
  ('IF02', 'identidad_filtros', 'identidad_genero', '¿Cómo te identificas?', 'seleccion_multiple', '["mujer","hombre","no binario","género fluido","agenero","prefiero no decir"]', NULL, '{}', true, false, true, 'identidad_genero', 'zoomatch-original'),
  ('IF03', 'identidad_filtros', 'tipo_relacion', '¿Qué tipo de relación buscas?', 'seleccion_multiple', '["monogamia","no_monogamia_etica","poliamor","anarquia_relacional","sin_definir","solo_amistad"]', NULL, '{}', true, false, true, 'tipo_relacion_busca', 'zoomatch-original'),
  ('IF04', 'identidad_filtros', 'exclusividad', 'Me siento más segurx en un vínculo cuando hay acuerdos explícitos de exclusividad emocional o física.', 'likert_5', NULL, 'positiva', '{"identidad_exclusividad":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IF05', 'identidad_filtros', 'exclusividad', 'La idea de mantener vínculos afectivos con más de una persona simultáneamente me parece algo natural.', 'likert_5', NULL, 'negativa', '{"identidad_exclusividad":-1}', true, false, false, NULL, 'zoomatch-original'),
  ('IF06', 'identidad_filtros', 'comunicacion_afectiva', 'Expreso abiertamente lo que siento hacia las personas que me importan sin esperar un momento especial.', 'likert_5', NULL, 'positiva', '{"identidad_comunicacion_afectiva":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IF07', 'identidad_filtros', 'comunicacion_afectiva', 'Prefiero hablar directamente sobre mis necesidades afectivas antes que esperar que la otra persona las adivine.', 'likert_5', NULL, 'positiva', '{"identidad_comunicacion_afectiva":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IF08', 'identidad_filtros', 'comunicacion_afectiva', 'Me resulta cómodo iniciar conversaciones sobre cómo nos sentimos en la relación, aunque sean incómodas.', 'likert_5', NULL, 'positiva', '{"identidad_comunicacion_afectiva":1}', true, false, false, NULL, 'zoomatch-original'),
  -- afinidad_cultural (12 items)
  ('AC01', 'afinidad_cultural', 'musica', 'Busco activamente géneros musicales nuevos más allá de lo que está en tendencia.', 'likert_5', NULL, 'positiva', '{"cultural_musica_exploracion":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC02', 'afinidad_cultural', 'musica', 'Me gusta compartir descubrimientos musicales con mis amistades o pareja y escuchar lo que ellos me recomiendan.', 'likert_5', NULL, 'positiva', '{"cultural_musica_exploracion":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC03', 'afinidad_cultural', 'estetica', 'Disfruto visitar exposiciones de arte, galerías o murales aunque no me considere experto en el tema.', 'likert_5', NULL, 'positiva', '{"cultural_estetica_visual":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC04', 'afinidad_cultural', 'estetica', 'El arte contemporáneo o experimental me parece innecesario; prefiero lo clásico y convencional.', 'likert_5', NULL, 'negativa', '{"cultural_estetica_visual":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC05', 'afinidad_cultural', 'hobbies_creativos', 'Dedico tiempo libre a proyectos creativos como dibujar, escribir, tejer, cocinar o producir contenido.', 'likert_5', NULL, 'positiva', '{"cultural_hobbies_creativos":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC06', 'afinidad_cultural', 'hobbies_creativos', 'Me gustaría tener un pasatiempo creativo compartido con mi pareja o amistades cercanas.', 'likert_5', NULL, 'positiva', '{"cultural_hobbies_creativos":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC07', 'afinidad_cultural', 'hobbies_creativos', 'Mi tiempo libre se va principalmente en consumo pasivo: series, redes sociales o videojuegos sin crear nada.', 'likert_5', NULL, 'negativa', '{"cultural_hobbies_creativos":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC08', 'afinidad_cultural', 'vida_universitaria', 'Participo en actividades del campus como clubes, voluntariados, ferias o eventos culturales.', 'likert_5', NULL, 'positiva', '{"cultural_vida_universitaria":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC09', 'afinidad_cultural', 'vida_universitaria', 'Disfruto las fiestas, posadas o reuniones universitarias como forma de convivencia y desestrés.', 'likert_5', NULL, 'positiva', '{"cultural_vida_universitaria":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC10', 'afinidad_cultural', 'vida_universitaria', 'Fuera del horario de clases, rara vez me involucro en la vida social de la universidad.', 'likert_5', NULL, 'negativa', '{"cultural_vida_universitaria":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC11', 'afinidad_cultural', 'humor', 'Me río con humor absurdo, memes poco convencionales o comedias que no todos entienden.', 'likert_5', NULL, 'positiva', '{"cultural_humor":1}', true, true, false, NULL, 'zoomatch-original'),
  ('AC12', 'afinidad_cultural', 'humor', 'Para mí es importante que mi pareja o amistades compartan un sentido del humor compatible con el mío.', 'likert_5', NULL, 'positiva', '{"cultural_humor":1}', true, true, false, NULL, 'zoomatch-original'),
  -- intimidad_afecto (12 items)
  ('IA01', 'intimidad_afecto', 'palabras_afirmacion', 'Me siento valoradx cuando alguien me expresa con palabras lo que significo en su vida.', 'likert_5', NULL, 'positiva', '{"intimidad_palabras_afirmacion":1}', true, false, false, NULL, 'love-languages'),
  ('IA02', 'intimidad_afecto', 'palabras_afirmacion', 'Puedo sentirme cercanx a alguien aunque no intercambiemos cumplidos o palabras afectuosas frecuentemente.', 'likert_5', NULL, 'negativa', '{"intimidad_palabras_afirmacion":-1}', true, false, false, NULL, 'love-languages'),
  ('IA03', 'intimidad_afecto', 'tiempo_calidad', 'Prefiero una conversación profunda sin distracciones antes que un plan grande con mucha gente.', 'likert_5', NULL, 'positiva', '{"intimidad_tiempo_calidad":1}', true, false, false, NULL, 'love-languages'),
  ('IA04', 'intimidad_afecto', 'tiempo_calidad', 'Cuando estoy con alguien que me importa, dejo el teléfono a un lado para estar realmente presente.', 'likert_5', NULL, 'positiva', '{"intimidad_tiempo_calidad":1}', true, false, false, NULL, 'love-languages'),
  ('IA05', 'intimidad_afecto', 'regalos_detalle', 'Los pequeños detalles inesperados (una nota, un dulce, un recuerdo de algún lugar) me hacen sentir pensadx.', 'likert_5', NULL, 'positiva', '{"intimidad_regalos_detalle":1}', true, false, false, NULL, 'love-languages'),
  ('IA06', 'intimidad_afecto', 'contacto_fisico', 'El contacto físico afectivo (abrazos, tomar la mano, recargarme en alguien) es importante para sentir cercanía emocional.', 'likert_5', NULL, 'positiva', '{"intimidad_contacto_fisico":1}', true, false, false, NULL, 'love-languages'),
  ('IA07', 'intimidad_afecto', 'actos_servicio', 'No necesito que me ayuden con tareas prácticas para sentirme queridx; puedo resolverlas por mi cuenta.', 'likert_5', NULL, 'negativa', '{"intimidad_actos_servicio":-1}', true, false, false, NULL, 'love-languages'),
  ('IA08', 'intimidad_afecto', 'apertura_emocional', 'Puedo compartir mis inseguridades y miedos con las personas en las que confío sin sentirme vulnerable en exceso.', 'likert_5', NULL, 'positiva', '{"intimidad_apertura_emocional":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IA09', 'intimidad_afecto', 'apertura_emocional', 'Me cuesta expresar lo que siento por miedo a que me juzguen, me rechacen o no me entiendan.', 'likert_5', NULL, 'negativa', '{"intimidad_apertura_emocional":-1}', true, false, false, NULL, 'zoomatch-original'),
  ('IA10', 'intimidad_afecto', 'comunicacion_deseos', 'Hablo abiertamente sobre lo que necesito y deseo en una relación sin sentir vergüenza o culpa.', 'likert_5', NULL, 'positiva', '{"intimidad_comunicacion_deseos":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IA11', 'intimidad_afecto', 'limites_respeto', 'Respeto cuando alguien establece un límite personal, aunque no comparta la razón detrás de él.', 'likert_5', NULL, 'positiva', '{"intimidad_limites_respeto":1}', true, false, false, NULL, 'zoomatch-original'),
  ('IA12', 'intimidad_afecto', 'limites_respeto', 'Me cuesta aceptar los límites de otras personas cuando no entiendo la razón detrás de ellos.', 'likert_5', NULL, 'negativa', '{"intimidad_limites_respeto":-1}', true, false, false, NULL, 'zoomatch-original'),
  -- valores_relacionales (10 items)
  ('VR01', 'valores_relacionales', 'empatia', 'Antes de juzgar las decisiones de alguien, intento entender su contexto y sus razones.', 'likert_5', NULL, 'positiva', '{"valores_empatia":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR02', 'valores_relacionales', 'empatia', 'Me resulta difícil conectar emocionalmente con personas que viven realidades muy distintas a la mía.', 'likert_5', NULL, 'negativa', '{"valores_empatia":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR03', 'valores_relacionales', 'confianza', 'La honestidad es la base de cualquier relación significativa; prefiero una verdad incómoda a una mentira piadosa.', 'likert_5', NULL, 'positiva', '{"valores_confianza":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR04', 'valores_relacionales', 'confianza', 'Confío en que mis amistades y parejas respetarán lo que les comparto en privado.', 'likert_5', NULL, 'positiva', '{"valores_confianza":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR05', 'valores_relacionales', 'gestion_conflicto', 'Cuando hay un desacuerdo, busco entender el punto de vista de la otra persona antes de defender el mío.', 'likert_5', NULL, 'positiva', '{"valores_gestion_conflicto":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR06', 'valores_relacionales', 'gestion_conflicto', 'Evito los conflictos aunque eso signifique guardarme cosas que me molestan por dentro.', 'likert_5', NULL, 'negativa', '{"valores_gestion_conflicto":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR07', 'valores_relacionales', 'igualdad_genero', 'Creo que las responsabilidades emocionales y prácticas deben repartirse equitativamente sin importar el género.', 'likert_5', NULL, 'positiva', '{"valores_igualdad_genero":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR08', 'valores_relacionales', 'corresponsabilidad', 'En mis relaciones, propongo y participo activamente en la organización de planes y pendientes compartidos.', 'likert_5', NULL, 'positiva', '{"valores_corresponsabilidad":1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR09', 'valores_relacionales', 'corresponsabilidad', 'Siento que casi siempre soy yo quien propone planes o resuelve problemas logísticos en mis relaciones.', 'likert_5', NULL, 'negativa', '{"valores_corresponsabilidad":-1}', true, true, false, NULL, 'zoomatch-original'),
  ('VR10', 'valores_relacionales', 'respeto_diversidad', 'Celebro que las personas tengan identidades, orientaciones y formas de vivir distintas a la mía.', 'likert_5', NULL, 'positiva', '{"valores_respeto_diversidad":1}', true, true, false, NULL, 'zoomatch-original')
ON CONFLICT (id) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  subcategoria = EXCLUDED.subcategoria,
  prompt = EXCLUDED.prompt,
  tipo_respuesta = EXCLUDED.tipo_respuesta,
  opciones = EXCLUDED.opciones,
  polarity = EXCLUDED.polarity,
  weights = EXCLUDED.weights,
  track_romance = EXCLUDED.track_romance,
  track_amistad = EXCLUDED.track_amistad,
  filtro_duro = EXCLUDED.filtro_duro,
  campo_perfil = EXCLUDED.campo_perfil,
  source_id = EXCLUDED.source_id;

COMMIT;

-- ============================================================
-- Seed complete. Summary:
--   61 animals inserted/updated
--   55 colors inserted/updated
--   60 quiz items inserted/updated
-- ============================================================
