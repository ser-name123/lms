/*
 * The API used to die whenever the pooled Postgres connection was dropped.
 *
 * The drop lands inside Prisma's own rollback path, so the rejection escapes
 * every request handler and Node's default kills the process — the whole API
 * went down twice in one afternoon for a blip that cost a single request.
 *
 *   node scripts/smoke-dropped-connection.cjs
 *
 * Two things have to hold, and the second matters as much as the first: a
 * guard that swallows everything would "pass" the survival check while hiding
 * every real bug in the codebase.
 *
 * Runs against the compiled build, so it tests the code that actually ships.
 * No server or database needed.
 */

const path = require('path');

const BUILT = path.join(__dirname, '..', 'build', 'src', 'common', 'dropped-connection.js');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let isDroppedConnection;
try {
  ({ isDroppedConnection } = require(BUILT));
} catch (e) {
  console.error(`Cannot load ${BUILT}. Build the API first (npm run build).`);
  console.error(e.message);
  process.exit(1);
}

console.log('\nSurvivable — a dropped connection');

// The exact shape seen in production: pg rejects out of Prisma's rollback.
const real = new Error('Connection terminated unexpectedly');
check('the error that took the API down is recognised', isDroppedConnection(real));

check('a reset socket', isDroppedConnection(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })));
check('a broken pipe', isDroppedConnection(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })));
check('a timed-out socket', isDroppedConnection(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
check(
  'a code carried on cause, as undici nests it',
  isDroppedConnection({ message: 'fetch failed', cause: { code: 'ECONNRESET' } }),
);
check(
  'the pg pool error wording',
  isDroppedConnection(new Error('Client has encountered a connection error and is not queryable')),
);

console.log('\nNot survivable — everything else must still crash');

check('a plain bug', !isDroppedConnection(new TypeError("Cannot read properties of undefined (reading 'id')")));
check('a unique constraint violation', !isDroppedConnection(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })));
check('a validation error', !isDroppedConnection(new Error('teacherId should not be empty')));
check('a rejection with no message at all', !isDroppedConnection(undefined));
check('a rejected string', !isDroppedConnection('something went wrong'));
check('a null rejection', !isDroppedConnection(null));
check(
  'an unrelated error that merely mentions a connection',
  !isDroppedConnection(new Error('Zoom connection settings are invalid')),
);

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
