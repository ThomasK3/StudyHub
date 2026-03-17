/* ==========================================================================
   StudyHub — Supabase client (optional shared database)
   ========================================================================== */

const SUPABASE_URL = 'https://tdyqnpzslalaxvxmngyz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkeXFucHpzbGFsYXh2eG1uZ3l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTUzMDUsImV4cCI6MjA4OTMzMTMwNX0.weZLMYT_h6-nJWNTeThrz81QxjKFt2bD1KG8YKKfuIc';

/**
 * Check if Supabase is configured (not placeholder values).
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return SUPABASE_URL !== 'https://xxx.supabase.co'
    && SUPABASE_ANON_KEY !== 'xxx'
    && SUPABASE_URL.startsWith('https://')
    && SUPABASE_ANON_KEY.length > 10;
}

/**
 * Make a request to Supabase REST API.
 * @param {string} path - e.g. '/rest/v1/shared_courses'
 * @param {object} [options]
 * @returns {Promise<any>}
 */
async function supabaseRequest(path, options = {}) {
  const { method = 'GET', body, headers = {} } = options;

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': '',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Fetch all validated shared courses, optionally filtered by semester.
 * @param {string} [semester] - e.g. 'LS 2025/26'
 * @returns {Promise<Array>}
 */
export async function fetchSharedCourses(semester) {
  if (!isSupabaseConfigured()) return [];

  try {
    let path = '/rest/v1/shared_courses?status=eq.validated&select=*&order=code.asc';
    if (semester) {
      path += `&semester=eq.${encodeURIComponent(semester)}`;
    }
    return await supabaseRequest(path);
  } catch {
    return [];
  }
}

/**
 * Fetch a single shared course by code and semester.
 * @param {string} code
 * @param {string} semester
 * @returns {Promise<object|null>}
 */
export async function fetchSharedCourse(code, semester) {
  if (!isSupabaseConfigured()) return null;

  try {
    const path = `/rest/v1/shared_courses?code=eq.${encodeURIComponent(code)}&semester=eq.${encodeURIComponent(semester)}&status=eq.validated&select=*&limit=1`;
    const rows = await supabaseRequest(path);
    return rows && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Submit a course to the shared database (pending review).
 * @param {object} courseData - The course object to share
 * @returns {Promise<object|null>}
 */
export async function submitSharedCourse(courseData) {
  if (!isSupabaseConfigured()) return null;

  const row = {
    code: courseData.code,
    semester: courseData.semester,
    data: courseData,
    ai_summary: courseData.aiSummary || '',
    status: 'pending',
    submitted_by: generateAnonHash(),
  };

  await supabaseRequest('/rest/v1/shared_courses', {
    method: 'POST',
    body: row,
  });
  return true;
}

/**
 * Generate a simple anonymous hash for submission tracking.
 * @returns {string}
 */
function generateAnonHash() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}
