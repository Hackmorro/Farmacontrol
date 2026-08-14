// =============================================================================
// FarmaControl — Conexión a Supabase
// =============================================================================
// 1. Ve a tu proyecto en https://app.supabase.com → Project Settings → API
// 2. Copia "Project URL" y pégala en SUPABASE_URL
// 3. Copia la clave "anon public" y pégala en SUPABASE_ANON_KEY
//    (la "anon key" es segura de exponer en el frontend: RLS protege los datos)
// =============================================================================

const SUPABASE_URL = "https://svceeghcplhfrntcjcra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2Y2VlZ2hjcGxoZnJudGNqY3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDAyNTcsImV4cCI6MjEwMjMxNjI1N30.-pxLpZaQuhMRhB17SDrcav6j6d3H0Z_n1qbUmJUTAMM";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
