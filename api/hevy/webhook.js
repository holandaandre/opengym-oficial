// Hevy webhook → workout in this instance → Coach debrief.
//
// Hevy Pro can POST {workoutId} to a URL whenever a workout is saved (hevy.com/settings?developer).
// This route takes that id, pulls the workout from the Hevy API, converts it with the *same*
// importer the app's "Import from Hevy" screen uses — `frontend/src/lib/import-hevy.js`, whose
// exercise identity comes from the generated `hevy-id-map.js` table rather than from a localized
// title — writes it into the owner's state, and queues a `debrief` job so the Coach reads that one
// workout and comments on it.
//
// Configuration (all through the environment, none of it stored in ./data):
//   HEVY_WEBHOOK_SECRET  required. The exact string Hevy sends in its Authorization header.
//                        Absent ⇒ the route is off and answers 404 like any unknown path.
//   HEVY_WEBHOOK_API_KEY required. The Pro API key, used only to read the workout back.
//   HEVY_WEBHOOK_UID     the profile the workouts belong to. Optional while the instance has a
//                        single profile; required as soon as it has more than one.
//
// Hevy expects 200 within 5 seconds, so the answer goes out before the work starts. Failures land
// in the container log, never in the response — Hevy would only retry into the same failure.
import crypto from 'node:crypto';
import fs from 'node:fs';

import { parseHevyWorkouts, HEVY_ID_MAP, HEVY_API } from '../../frontend/src/lib/import-hevy.js';
import { mergeImport } from '../../frontend/src/lib/import-csv.js';
import * as jobs from '../coach/jobs.js';

const SECRET = process.env.HEVY_WEBHOOK_SECRET || '';
const API_KEY = process.env.HEVY_WEBHOOK_API_KEY || '';
const FIXED_UID = process.env.HEVY_WEBHOOK_UID || '';

/** Constant-time compare that does not leak the secret's length through an early return. */
const sha = v => crypto.createHash('sha256').update(String(v || '')).digest();
const SECRET_HASH = SECRET ? sha(SECRET) : null;
function secretMatches(given) {
  return !!SECRET_HASH && crypto.timingSafeEqual(sha(given), SECRET_HASH);
}

async function hevyGet(path) {
  // Without a deadline a stalled Hevy hangs this ingest forever: the 200 has already gone out,
  // Hevy will not retry, and the workout is simply lost with the request still pending.
  const res = await fetch(`${HEVY_API}${path}`, {
    headers: { 'api-key': API_KEY },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Hevy ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* The importer only needs templates for exercises the generated map does not cover — it reads a
   title and a muscle group off them to invent a custom exercise. Everything else resolves from
   the map, so the catalogue fetch is skipped on the ordinary workout. */
async function templatesFor(workout) {
  const unknown = (workout.exercises || [])
    .map(e => e.exercise_template_id)
    .filter(id => id && !HEVY_ID_MAP[id]);
  if (!unknown.length) return [];
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { exercise_templates: lote = [] } = await hevyGet(`/v1/exercise_templates?page=${page}&pageSize=100`);
    if (!lote.length) break;
    out.push(...lote);
    if (lote.length < 100) break;
  }
  return out;
}

function resolveUid(users) {
  if (FIXED_UID) return FIXED_UID;
  const ids = (users || []).map(u => u.id);
  if (ids.length === 1) return ids[0];
  throw new Error(
    ids.length
      ? 'this instance has more than one profile: set HEVY_WEBHOOK_UID to the one that logs in Hevy'
      : 'no profile exists on this instance yet'
  );
}

/* An exercise Hevy knows and the catalogue does not becomes a custom one, with a fresh id every
   time it is parsed. Left alone, the same lift would pile up a new entry per workout — the
   duplicates this instance has had to merge by hand before. An existing custom with the same name
   wins, and the parsed entries are pointed at it.

   mergeHevyRoutines matches on name *and* body part; this matches on name alone, because the body
   part is the field most likely to differ for the same lift — an earlier import here left "single
   arm tricep extension (dumbbell)" filed under upper legs, and a name+bp rule would have answered
   that by adding a second copy rather than reusing the one already in the log. */
export function reuseCustoms(S, parsed) {
  const key = c => (c.n || '').trim().toLowerCase();
  // Hevy's own id first: it survives a rename, which the name obviously does not. Renaming the
  // 45 imported exercises into Portuguese was enough to make the next import recreate two of
  // them in English. Name matching stays as the fallback for anything imported before ids were
  // recorded, and for exercises the user typed by hand.
  const porHevy = new Map((S.customEx || []).filter(c => c.hevyId).map(c => [c.hevyId, c.id]));
  const porNome = new Map((S.customEx || []).map(c => [key(c), c.id]));
  const rename = new Map();
  parsed.customEx = (parsed.customEx || []).filter(c => {
    const hit = (c.hevyId && porHevy.get(c.hevyId)) || porNome.get(key(c));
    if (!hit) return true;
    rename.set(c.id, hit);
    return false;
  });
  if (!rename.size) return;
  for (const w of parsed.workouts) {
    for (const e of w.entries) if (rename.has(e.id)) e.id = rename.get(e.id);
  }
}

/** Fetch → convert → store → queue. Exported so the route stays a thin shell around it. */
export async function ingest({ workoutId, users, stateFile, atomicWrite }) {
  const uid = resolveUid(users);
  // The single-workout endpoint answers with the workout itself, not the {workouts:[…]} envelope
  // the list endpoint uses. Both shapes are accepted so a change on either does not go silent.
  const got = await hevyGet(`/v1/workouts/${encodeURIComponent(workoutId)}`);
  const workout = got?.exercises ? got : (got?.workout || got?.workouts?.[0]);
  if (!workout?.exercises) throw new Error(`Hevy returned no usable workout for ${workoutId}`);

  const parsed = parseHevyWorkouts([workout], await templatesFor(workout));
  if (!parsed.workouts.length) throw new Error(`nothing importable in workout ${workoutId}`);

  /* Two deliveries that overlap do not race, and the reason is load-bearing: everything from the
     read to the write below is synchronous, so Node runs it to completion without yielding. Swap
     any of it for fs.promises and that guarantee is gone — a lost workout, silently. */
  {
    let S;
    try { S = JSON.parse(fs.readFileSync(stateFile(uid), 'utf8')); }
    catch { throw new Error(`no state file for profile ${uid} — open the app once before wiring the webhook`); }
    S.workouts = S.workouts || [];
    S.customEx = S.customEx || [];
    S.exWeights = S.exWeights || {};
    S.bodyweight = S.bodyweight || [];

    reuseCustoms(S, parsed);

    // mergeImport skips a day already logged, which is what makes a repeated delivery harmless.
    const { added } = mergeImport(S, { kind: 'workouts', workouts: parsed.workouts, customEx: parsed.customEx });
    if (!added) return { uid, added: 0, queued: false };

    S._ts = Date.now();
    atomicWrite(stateFile(uid), JSON.stringify(S));

    // The workout is already saved by here. A Coach that is off, busy or over its cap is an
    // ordinary outcome and must not read as a failed import — the log has to say which half worked.
    const local = parsed.workouts[parsed.workouts.length - 1];
    try {
      jobs.enqueue(uid, { kind: 'debrief', workoutId: local.id });
      return { uid, added, queued: true, workoutId: local.id, day: local.d };
    } catch (e) {
      if (!(e instanceof jobs.CoachError)) throw e;
      return { uid, added, queued: false, why: e.message, workoutId: local.id, day: local.d };
    }
  }
}

export function hevyRoutes({ json, readBody, users, stateFile, atomicWrite }) {
  if (!SECRET || !API_KEY) return {};      // not configured ⇒ the path does not exist
  return {
    'POST /api/hevy/webhook': async (req, res) => {
      if (!secretMatches(req.headers.authorization)) return json(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const raw = body?.workoutId;
      const workoutId = (typeof raw === 'string' || typeof raw === 'number') && String(raw).trim()
        ? String(raw).trim().slice(0, 64)
        : null;
      if (!workoutId) return json(res, 400, { error: 'workoutId required' });

      json(res, 200, { ok: true });        // answered first: Hevy gives up after 5s
      ingest({ workoutId, users: users(), stateFile, atomicWrite })
        .then(r => console.log('hevy webhook:', workoutId,
          !r.added ? 'already logged, nothing to do'
            : r.queued ? `imported ${r.day}, debrief queued`
              : `imported ${r.day}, but no debrief: ${r.why}`))
        .catch(e => console.error('hevy webhook failed for', workoutId, e.message));
    },
  };
}
