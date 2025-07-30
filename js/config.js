// Conexión a Supabase. Intenta leer las claves desde variables de entorno
// (por ejemplo, inyectadas en el build). Si no existen, usa las de respaldo.
const DEFAULT_SUPABASE_URL = 'https://eflaynhqmzxchqhkcnzp.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbGF5bmhxbXp4Y2hxaGtjbnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MDQxODQsImV4cCI6MjA2ODk4MDE4NH0.7t0LNLiv5zNB36SIt7sFhv3GftQ2XqD6L_eKK2rr3NI';

const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

const SUPABASE_URL = env.SUPABASE_URL || window.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_KEY || window.SUPABASE_KEY || DEFAULT_SUPABASE_KEY;

if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
  console.warn(
    'SUPABASE_URL o SUPABASE_KEY no se encontraron en las variables de entorno. ' +
    'Se usarán las credenciales predeterminadas definidas en config.js.'
  );
}

// Se exporta el cliente para que esté disponible en otros archivos
export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);