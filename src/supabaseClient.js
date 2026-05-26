import { createClient } from '@supabase/supabase-js'

// TODO: Nanti kita isi URL dan ANON KEY asli dari dashboard Supabase Profesor
const supabaseUrl = 'https://cfvbyvpvpqjsczfcsvke.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmdmJ5dnB2cHFqc2N6ZmNzdmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzA2NTYsImV4cCI6MjA5NTAwNjY1Nn0.TdVRJi7D8mAg7Nf2mXFJVDuXbWIdIl3SCCwOBw09LQ0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)