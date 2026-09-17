-- ============================================================================
-- GET SERVICE — 0008  Reference data: catalogue + platform settings
-- This is configuration, not demo data. Every row here is editable from the
-- admin panel; nothing in the app hard-codes a category, service or fee.
-- ============================================================================

insert into public.categories (slug, name, name_en, icon, description, sort_order) values
  ('plumbing',     'אינסטלציה',   'Plumbing',      'wrench',        'סתימות, נזילות, ברזים וצנרת',            10),
  ('electricity',  'חשמל',        'Electricity',   'zap',           'תקלות חשמל, נקודות, לוחות ותאורה',        20),
  ('pest-control', 'הדברות',      'Pest control',  'bug',           'הדברת מזיקים בבית ובעסק',                 30),
  ('gardening',    'גינון',       'Gardening',     'trees',         'גיזום, כיסוח, השקיה ועיצוב גינה',         40),
  ('hvac',         'מיזוג אוויר', 'HVAC',          'air-vent',      'התקנה, ניקוי ותיקון מזגנים',              50),
  ('renovations',  'שיפוצים',     'Renovations',   'hammer',        'שיפוץ כללי, ריצוף, גבס ובנייה',           60),
  ('cleaning',     'ניקיון',      'Cleaning',      'sparkles',      'ניקיון דירות, משרדים ולאחר שיפוץ',        70),
  ('locksmith',    'מנעולן',      'Locksmith',     'key-round',     'פריצת דלתות, החלפת צילינדר ומנעולים',     80),
  ('moving',       'הובלות',      'Moving',        'truck',         'הובלות דירה, משרד ופריט בודד',            90),
  ('painting',     'צביעה',       'Painting',      'paint-roller',  'צביעת דירות, קירות וחוץ',                100),
  ('carpentry',    'נגרות',       'Carpentry',     'ruler',         'ארונות, מטבחים, דלתות ורהיטים',          110),
  ('aluminum',     'אלומיניום',   'Aluminum',      'panels-top-left','חלונות, תריסים ומסגרות אלומיניום',      120),
  ('glazing',      'זגגות',       'Glazing',       'square',        'החלפת זכוכית, מקלחונים ומראות',          130),
  ('sealing',      'איטום',       'Sealing',       'shield',        'איטום גגות, מרפסות ורטיבות',             140),
  ('sewage',       'ביוב',        'Sewage',        'waves',         'פתיחת ביוב, שאיבות ואיתור תקלות',        150),
  ('maintenance',  'תחזוקה',      'Maintenance',   'settings',      'תחזוקת מבנה, טיפולים תקופתיים ותיקונים', 160),
  ('other',        'אחר',         'Other',         'circle-help',   'כל עבודה אחרת שלא מופיעה ברשימה',        999)
on conflict (slug) do update
  set name = excluded.name,
      name_en = excluded.name_en,
      icon = excluded.icon,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- ── Services per category ───────────────────────────────────────────────────
with catalogue(category_slug, slug, name, name_en, sort_order) as (values
  ('plumbing', 'blockage',         'סתימה',                  'Blockage',            10),
  ('plumbing', 'leak',             'נזילה',                  'Leak',                20),
  ('plumbing', 'leak-detection',   'איתור נזילה',            'Leak detection',      30),
  ('plumbing', 'faucet-replace',   'החלפת ברז',              'Faucet replacement',  40),
  ('plumbing', 'toilet-repair',    'תיקון אסלה',             'Toilet repair',       50),
  ('plumbing', 'boiler',           'דוד חשמל / שמש',         'Water heater',        60),

  ('electricity', 'short-circuit',  'קצר חשמלי',             'Short circuit',       10),
  ('electricity', 'new-point',      'נקודת חשמל חדשה',       'New outlet',          20),
  ('electricity', 'panel-upgrade',  'שדרוג לוח חשמל',        'Panel upgrade',       30),
  ('electricity', 'lighting',       'התקנת תאורה',           'Lighting install',    40),
  ('electricity', 'appliance-hook', 'חיבור מכשיר חשמלי',     'Appliance hookup',    50),

  ('pest-control', 'cockroaches',   'הדברת תיקנים',          'Cockroaches',         10),
  ('pest-control', 'ants',          'הדברת נמלים',           'Ants',                20),
  ('pest-control', 'mice',          'הדברת עכברים',          'Mice',                30),
  ('pest-control', 'rats',          'הדברת חולדות',          'Rats',                40),
  ('pest-control', 'fleas',         'הדברת פרעושים',         'Fleas',               50),
  ('pest-control', 'bedbugs',       'הדברת פשפשים',          'Bed bugs',            60),
  ('pest-control', 'termites',      'הדברת טרמיטים',         'Termites',            70),

  ('gardening', 'mowing',           'כיסוח דשא',             'Lawn mowing',         10),
  ('gardening', 'pruning',          'גיזום עצים',            'Tree pruning',        20),
  ('gardening', 'irrigation',       'מערכת השקיה',           'Irrigation',          30),
  ('gardening', 'garden-design',    'עיצוב גינה',            'Garden design',       40),
  ('gardening', 'synthetic-grass',  'דשא סינתטי',            'Synthetic grass',     50),

  ('hvac', 'ac-install',            'התקנת מזגן',            'AC installation',     10),
  ('hvac', 'ac-service',            'ניקוי וטיפול',          'AC service',          20),
  ('hvac', 'ac-repair',             'תיקון מזגן',            'AC repair',           30),
  ('hvac', 'ac-gas',                'מילוי גז',              'Refrigerant refill',  40),

  ('renovations', 'full-renovation','שיפוץ כללי',            'Full renovation',     10),
  ('renovations', 'tiling',         'ריצוף וחיפוי',          'Tiling',              20),
  ('renovations', 'drywall',        'עבודות גבס',            'Drywall',             30),
  ('renovations', 'bathroom',       'שיפוץ חדר רחצה',        'Bathroom remodel',    40),
  ('renovations', 'kitchen',        'שיפוץ מטבח',            'Kitchen remodel',     50),

  ('cleaning', 'apartment',         'ניקיון דירה',           'Apartment cleaning',  10),
  ('cleaning', 'post-renovation',   'ניקיון לאחר שיפוץ',     'Post-renovation',     20),
  ('cleaning', 'office',            'ניקיון משרד',           'Office cleaning',     30),
  ('cleaning', 'sofa-carpet',       'ניקוי ספות ושטיחים',    'Upholstery cleaning', 40),
  ('cleaning', 'windows',           'ניקוי חלונות',          'Window cleaning',     50),

  ('locksmith', 'lockout',          'פריצת דלת',             'Lockout',             10),
  ('locksmith', 'cylinder',         'החלפת צילינדר',         'Cylinder replacement',20),
  ('locksmith', 'lock-install',     'התקנת מנעול',           'Lock installation',   30),
  ('locksmith', 'car-lockout',      'פתיחת רכב',             'Car lockout',         40),

  ('moving', 'apartment-move',      'הובלת דירה',            'Apartment move',      10),
  ('moving', 'office-move',         'הובלת משרד',            'Office move',         20),
  ('moving', 'single-item',         'הובלת פריט בודד',       'Single item',         30),
  ('moving', 'crane',               'הובלה עם מנוף',         'Crane lift',          40),

  ('painting', 'apartment-paint',   'צביעת דירה',            'Apartment painting',  10),
  ('painting', 'exterior-paint',    'צביעה חיצונית',         'Exterior painting',   20),
  ('painting', 'decorative',        'צביעה דקורטיבית',       'Decorative finish',   30),

  ('carpentry', 'kitchen-cabinets', 'ארונות מטבח',           'Kitchen cabinets',    10),
  ('carpentry', 'closet',           'ארון קיר',              'Closets',             20),
  ('carpentry', 'door-repair',      'תיקון דלתות',           'Door repair',         30),
  ('carpentry', 'furniture-assembly','הרכבת רהיטים',         'Furniture assembly',  40),

  ('aluminum', 'windows',           'חלונות אלומיניום',      'Aluminum windows',    10),
  ('aluminum', 'shutters',          'תריסים',                'Shutters',            20),
  ('aluminum', 'screens',           'רשתות נגד יתושים',      'Insect screens',      30),
  ('aluminum', 'balcony-closure',   'סגירת מרפסת',           'Balcony enclosure',   40),

  ('glazing', 'glass-replace',      'החלפת זכוכית',          'Glass replacement',   10),
  ('glazing', 'shower-cabin',       'מקלחון',                'Shower cabin',        20),
  ('glazing', 'mirrors',            'מראות',                 'Mirrors',             30),

  ('sealing', 'roof-sealing',       'איטום גג',              'Roof sealing',        10),
  ('sealing', 'balcony-sealing',    'איטום מרפסת',           'Balcony sealing',     20),
  ('sealing', 'damp-treatment',     'טיפול ברטיבות',         'Damp treatment',      30),

  ('sewage', 'sewer-opening',       'פתיחת ביוב',            'Sewer unblocking',    10),
  ('sewage', 'pumping',             'שאיבת בור',             'Pit pumping',         20),
  ('sewage', 'camera-inspection',   'בדיקת מצלמה',           'Camera inspection',   30),

  ('maintenance', 'handyman',       'הנדימן',                'Handyman',            10),
  ('maintenance', 'periodic',       'תחזוקה תקופתית',        'Periodic maintenance',20),
  ('maintenance', 'building',       'תחזוקת בניין',          'Building maintenance',30),

  ('other', 'custom',               'עבודה מותאמת',          'Custom job',          10)
)
insert into public.services (category_id, slug, name, name_en, sort_order)
select c.id, s.slug, s.name, s.name_en, s.sort_order
from catalogue s
join public.categories c on c.slug = s.category_slug
on conflict (category_id, slug) do update
  set name = excluded.name, name_en = excluded.name_en, sort_order = excluded.sort_order;

-- ── Platform settings ───────────────────────────────────────────────────────
insert into public.settings (key, value, description) values
  ('platform_fee_rules', jsonb_build_object(
      'currency', 'ILS',
      'default_percentage', 0.15,
      'minimum_fee', 15,
      'maximum_fee', 400,
      'tiers', jsonb_build_array(
        jsonb_build_object('label', 'עד ₪999',  'min_amount', 0,    'max_amount', 999,  'percentage', 0.15),
        jsonb_build_object('label', '₪1,000 ומעלה', 'min_amount', 1000, 'max_amount', null, 'percentage', 0.10)
      ),
      'category_overrides', '{}'::jsonb,
      'provider_overrides', '{}'::jsonb
    ), 'Commission rules. Tiers are matched by job amount; overrides are keyed by category slug / provider id.'),

  ('match_weights', jsonb_build_object(
      'distance', 0.30,
      'rating', 0.20,
      'availability', 0.15,
      'category_match', 0.15,
      'response_speed', 0.10,
      'completed_jobs', 0.10
    ), 'Match engine weights. Must sum to 1. Never exposed to customers.'),

  ('matching', jsonb_build_object(
      'radius_steps_km', jsonb_build_array(5, 10, 20),
      'minimum_providers', 3,
      'max_providers_per_job', 10,
      'max_distance_km', 60,
      'prefer_favorites', true,
      'favorite_bonus', 0.05,
      'verified_only', true
    ), 'Provider discovery: progressive radius expansion and shortlist size.'),

  ('timeouts', jsonb_build_object(
      'job_search_minutes', 30,
      'provider_response_minutes', 15,
      'offer_validity_minutes', 120,
      'auto_cancel_unmatched_minutes', 120
    ), 'Job and offer lifecycle timeouts, in minutes.'),

  ('cancellation', jsonb_build_object(
      'free_window_minutes', 15,
      'customer_fee_percentage', 0.05,
      'provider_penalty_points', 5,
      'require_reason', true
    ), 'Cancellation policy. Fees are calculated server-side only.'),

  ('reviews', jsonb_build_object(
      'window_days', 14,
      'min_comment_length', 0,
      'auto_flag_below', 2,
      'criteria', jsonb_build_array('professionalism', 'price', 'punctuality', 'service')
    ), 'Review rules and the criteria shown to the customer.'),

  ('notifications', jsonb_build_object(
      'channels', jsonb_build_object('in_app', true, 'push', true, 'sms', true, 'email', true, 'whatsapp', false),
      'quiet_hours', jsonb_build_object('enabled', true, 'from', '22:00', 'to', '07:00'),
      'events', jsonb_build_object(
        'job_created', jsonb_build_array('in_app'),
        'new_job_for_provider', jsonb_build_array('in_app', 'push'),
        'new_offer', jsonb_build_array('in_app', 'push'),
        'offer_accepted', jsonb_build_array('in_app', 'push', 'sms'),
        'provider_on_the_way', jsonb_build_array('in_app', 'push'),
        'provider_arrived', jsonb_build_array('in_app', 'push'),
        'job_completed', jsonb_build_array('in_app', 'push', 'email'),
        'payment_completed', jsonb_build_array('in_app', 'email'),
        'new_message', jsonb_build_array('in_app', 'push'),
        'new_review', jsonb_build_array('in_app')
      )
    ), 'Which channels fire for which events, plus quiet hours.'),

  ('anti_fraud', jsonb_build_object(
      'duplicate_job_window_minutes', 10,
      'max_jobs_per_hour', 5,
      'max_offers_per_hour', 30,
      'review_burst_threshold', 5,
      'flag_new_account_days', 3
    ), 'Basic abuse thresholds enforced server-side.')
on conflict (key) do nothing;
