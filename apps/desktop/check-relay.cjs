// Exercises the relay the way the phone will: a rejected token, a ping, a
// snapshot, and a clean stop. The token is the only access control there is,
// so the refusals matter more than the happy path.
const assert = require('node:assert/strict')
const R = require(process.argv[2])

const PORT = 7401
;(async () => {
  const st = await R.startRelay({ savePath: () => null, teamId: () => 7 }, PORT)
  assert.equal(st.running, true, 'the relay should report running once it is listening')
  assert.equal(st.port, PORT)
  assert.match(st.token, /^[0-9a-f]{32}$/, 'a fresh token should be generated')
  const base = `http://127.0.0.1:${PORT}`
  // Keep-alive would reuse a socket across the restart below and fail for a
  // reason that has nothing to do with the relay, so every request is its own.
  const get = (p, token) => fetch(base + p, {
    headers: { connection: 'close', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })

  assert.equal((await get('/ping')).status, 401, 'no token must be refused')
  assert.equal((await get('/ping', 'wrong')).status, 401, 'a wrong token must be refused')
  assert.equal((await get('/ping', st.token.slice(0, -1))).status, 401, 'a short token must be refused')

  const ping = await get('/ping', st.token)
  assert.equal(ping.status, 200)
  assert.deepEqual(await ping.json(), { ok: true, save: false, teamId: 7 })

  // With no save open, everything but ping should say so rather than fail oddly.
  assert.equal((await get('/snapshot', st.token)).status, 409)
  assert.equal((await get('/nope', st.token)).status, 404, 'an unknown endpoint is a 404')

  // The token may also arrive as a query parameter, for a phone opening a link.
  assert.equal((await get(`/ping?token=${st.token}`)).status, 200)

  const second = await R.startRelay({ savePath: () => null, teamId: () => 7 }, PORT)
  assert.notEqual(second.token, st.token, 'restarting must invalidate the old token')
  assert.equal((await get('/ping', st.token)).status, 401, 'the old token must stop working')

  const stopped = R.stopRelay()
  assert.equal(stopped.running, false)
  assert.equal(stopped.token, '', 'stopping must clear the token')
  let refused = false
  await get('/ping', second.token).catch(() => { refused = true })
  assert.equal(refused, true, 'the port should be closed after stopping')

  console.log('check-relay: refuses bad tokens, serves with a good one, rotates on restart, closes on stop')
})().catch((e) => { console.error(e); process.exit(1) })
