/**
 * Plant photos live in Supabase Storage (Project B "platform", bucket
 * plantit-photos: public-read, 5 MB, image/* only), NOT in Firebase Storage,
 * which now needs the paid Blaze plan. The service-role key is only ever set
 * in Vercel's environment; the browser never sees it.
 */
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || 'plantit-photos';
let client = null;

function isConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient(env = process.env) {
  if (!client) {
    if (!isConfigured(env)) throw new Error('Supabase Storage is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

/** Upload a JPEG and return { path, publicUrl }. */
async function uploadPhoto({ buffer, path, contentType = 'image/jpeg' }) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function deletePhoto(path) {
  if (!path) return;
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

module.exports = { uploadPhoto, deletePhoto, isConfigured, BUCKET };
