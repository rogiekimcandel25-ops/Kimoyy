// Fill in from Supabase > Project Settings > API
window.CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',
  // Grading scale used by the institution (documented rule; see README).
  GWA_BEST: 1.0,
  GWA_WORST: 5.0,
  LOWER_IS_BETTER: true   // true: 1.0 is best (compliant if GWA <= required). false: 4.0 is best (GWA >= required)
};
