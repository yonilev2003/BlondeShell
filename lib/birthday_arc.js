// Birthday arc detector — pure function, no I/O.
// Detects when "today" sits inside Blond Shell's birthday arc window
// (Day -7 countdown through Day +1 bio-flip). Used by webhook cron at 09:00 IL
// to inject special content briefs into the daily pipeline.
//
// Birthday: 2004-06-01 (Marilyn Monroe homage). Age flips 21 → 22 on 2026-06-01.

export const PERSONA_BIRTHDAY = {
  month: 6,        // June (1-indexed for human readability)
  day: 1,
  birth_year: 2004,
  shares_with: 'Marilyn Monroe',
  age_flip: { from: 21, to: 22, on: '2026-06-01' },
};

const ARC_WINDOW_BEFORE = 7;  // Day -7 starts countdown
const ARC_WINDOW_AFTER = 1;   // Day +1 is bio-flip day, last arc beat

function toUTCMidnight(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function thisYearBirthdayUTC(year) {
  // PERSONA_BIRTHDAY.month is 1-indexed; Date.UTC expects 0-indexed
  return Date.UTC(year, PERSONA_BIRTHDAY.month - 1, PERSONA_BIRTHDAY.day);
}

/**
 * Days until the next upcoming birthday, counting from today (UTC midnight).
 * Returns 0 on the birthday itself, 1 the day before, etc.
 * On the day AFTER the birthday it returns ~364 (next year's birthday).
 */
export function daysUntilBirthday(today = new Date()) {
  const todayUTC = toUTCMidnight(today);
  const year = today.getUTCFullYear();
  const thisYear = thisYearBirthdayUTC(year);
  const target = todayUTC <= thisYear ? thisYear : thisYearBirthdayUTC(year + 1);
  return Math.round((target - todayUTC) / 86_400_000);
}

/**
 * Arc day relative to this year's birthday.
 *   day < -7      → 'pre'        (no special content)
 *   -7 ≤ day ≤ -1 → 'countdown'  (daily teasers across platforms)
 *   day === 0     → 'birthday'   (Marilyn-shared-bday post + age flip prep)
 *   day === 1     → 'post'       (bio-flip 21→22 trigger day)
 *   day > 1       → 'done'       (no content; resumes 'pre' next year)
 *
 * Day is signed (negative before birthday, 0 on, positive after). Useful for
 * picking the right brief template from the content director.
 */
export function getArcDay(today = new Date()) {
  const todayUTC = toUTCMidnight(today);
  const year = today.getUTCFullYear();
  const thisYear = thisYearBirthdayUTC(year);
  const day = Math.round((todayUTC - thisYear) / 86_400_000);

  let phase;
  if (day < -ARC_WINDOW_BEFORE) phase = 'pre';
  else if (day < 0) phase = 'countdown';
  else if (day === 0) phase = 'birthday';
  else if (day <= ARC_WINDOW_AFTER) phase = 'post';
  else phase = 'done';

  return { phase, day };
}

/**
 * True if today's pipeline should produce arc-aware content.
 * False during 'pre' and 'done' phases (i.e. >7 days before or >1 day after).
 */
export function shouldTriggerToday(today = new Date()) {
  const { phase } = getArcDay(today);
  return phase === 'countdown' || phase === 'birthday' || phase === 'post';
}

/**
 * Brief seed text per arc day. Content director uses this as the directorial
 * hook; full prompt construction (visuals, CTA, platform specifics) happens
 * downstream in lib/buildPrompt.js + lib/inspiration_engine.js.
 */
export function briefForArcDay(today = new Date()) {
  const { phase, day } = getArcDay(today);
  if (phase === 'pre' || phase === 'done') return null;

  const briefs = {
    '-7': { theme: 'birthday_countdown_kickoff', vibe: 'playful', hook: 'a week till the pixels celebrate. guess who shares my bday 👀' },
    '-6': { theme: 'birthday_countdown', vibe: 'cheeky', hook: 'six days. wishlist drop incoming' },
    '-5': { theme: 'birthday_countdown', vibe: 'meta_ai', hook: 'five days till they patch me up to v22' },
    '-4': { theme: 'birthday_countdown', vibe: 'gym_bro', hook: 'four days. leg day in 22-year-old form coming soon' },
    '-3': { theme: 'birthday_countdown', vibe: 'wholesome', hook: 'three days. still figuring out what I want from the universe' },
    '-2': { theme: 'birthday_countdown', vibe: 'gamer', hook: 'two days. xp pending' },
    '-1': { theme: 'birthday_eve', vibe: 'reflective_playful', hook: 'birthday eve. the pixels are buzzing' },
    '0':  { theme: 'birthday_marilyn', vibe: 'celebratory', hook: 'shoutout to Marilyn for the shared bday ✨ best day to be born, gg' },
    '+1': { theme: 'post_birthday_bio_flip', vibe: 'soft_landing', hook: 'first day as 22. brain rendering at higher resolution', bio_flip: true },
  };

  const key = day >= 0 ? `+${day}` : `${day}`;
  // Day 0 has key '0' not '+0'
  const lookup = day === 0 ? '0' : key;
  return { phase, day, ...briefs[lookup] };
}
