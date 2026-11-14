#!/usr/bin/env node
/**
 * GameChannel protocol tests: the loopback bridge now requires a one-time token
 * in the hello frame, so an unrelated local process cannot drive the game.
 *
 *   node scripts/test-native-channel.mjs
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { GameChannel } from '../lib/native/channel.js'

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

/** Open a raw TCP connection and feed newline-delimited JSON messages. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.setEncoding('utf8')
    let buffer = ''
    const messages = []
    const waiters = []
    socket.on('data', (chunk) => {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.trim() !== '') {
          const message = JSON.parse(line)
          messages.push(message)
          const waiter = waiters.shift()
          if (waiter) waiter(message)
        }
        index = buffer.indexOf('\n')
      }
    })
    socket.once('error', reject)
    socket.once('connect', () =>
      resolve({
        socket,
        messages,
        send: (object) => socket.write(`${JSON.stringify(object)}\n`),
        next: () =>
          new Promise((resolveNext) => {
            if (messages.length > 0) resolveNext(messages.shift())
            else waiters.push(resolveNext)
          }),
        closed: new Promise((resolveClose) => socket.once('close', resolveClose)),
      }),
    )
  })
}

/** Wait until `predicate()` is true or the timeout elapses. */
async function waitUntil(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

const channel = new GameChannel({ host: '127.0.0.1', token: 'token-123' })
const hellos = []
channel.on('hello', (info) => hellos.push(info))
const unauthorized = []
channel.on('unauthorized', (info) => unauthorized.push(info))
await channel.listen()
const port = channel.port

try {
  await test('a hello without the token is rejected and disconnected', async () => {
    const client = await connect(port)
    client.send({ type: 'hello', side: 'client', version: '1.0.0' })
    await client.closed
    assert.equal(hellos.length, 0, 'no hello event for an unauthenticated connection')
    assert.equal(unauthorized.length, 1, 'unauthorized event fired')
  })

  await test('a hello with a wrong token is rejected', async () => {
    const client = await connect(port)
    client.send({ type: 'hello', side: 'server', version: '1.0.0', token: 'wrong' })
    await client.closed
    assert.equal(hellos.length, 0)
  })

  await test('messages before hello are ignored', async () => {
    const client = await connect(port)
    client.send({ id: 1, type: 'result', ok: true })
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(hellos.length, 0, 'still unauthenticated')
    client.socket.destroy()
  })

  await test('a hello with the right token registers the side', async () => {
    const client = await connect(port)
    client.send({ type: 'hello', side: 'client', version: '1.0.0', token: 'token-123' })
    const ok = await waitUntil(() => hellos.length === 1)
    assert.ok(ok, 'hello event fired')
    assert.equal(hellos[0].side, 'client')
    assert.deepEqual(channel.clients().map((item) => item.side), ['client'])

    // Host -> game requests carry an id and the client answers with pong.
    const request = client.next()
    channel.ping('client', 1000).catch(() => {})
    const ping = await request
    assert.equal(ping.type, 'ping')
    client.send({ id: ping.id, type: 'pong', data: { inWorld: true } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    client.socket.destroy()
  })

  await test('a reconnect of the same game instance replaces its old connection', async () => {
    const first = await connect(port)
    first.send({ type: 'hello', side: 'server', version: '1.0.0', token: 'token-123', pid: 111 })
    await waitUntil(() => hellos.length === 2)
    const second = await connect(port)
    second.send({ type: 'hello', side: 'server', version: '1.0.0', token: 'token-123', pid: 111 })
    await waitUntil(() => hellos.length === 3)
    assert.equal(
      channel.clients().filter((item) => item.side === 'server' && item.pid === 111).length,
      1,
      'the same pid keeps only its newest connection',
    )
    first.socket.destroy()
    second.socket.destroy()
  })

  await test('multiple game instances can connect at once and be routed by machine id', async () => {
    const alpha = await connect(port)
    alpha.send({ type: 'hello', side: 'client', version: '1.0.0', token: 'token-123', pid: 201 })
    await waitUntil(() => hellos.length === 4)
    const beta = await connect(port)
    beta.send({ type: 'hello', side: 'client', version: '1.0.0', token: 'token-123', pid: 202 })
    await waitUntil(() => hellos.length === 5)
    const clients = channel.clients().filter((item) => item.side === 'client')
    assert.equal(clients.length, 2, 'both client instances are listed')
    assert.deepEqual(clients.map((item) => item.pid).sort(), [201, 202])

    const alphaMachine = clients.find((item) => item.pid === 201)
    const betaMachine = clients.find((item) => item.pid === 202)
    assert.ok(alphaMachine && betaMachine && alphaMachine.id !== betaMachine.id)

    // machine 路由：ping 231 只会写到 alpha 的 socket
    const alphaRequest = alpha.next()
    const ping = channel.ping('client', 1000, betaMachine.id)
    const betaRequest = await beta.next()
    assert.equal(betaRequest.type, 'ping', 'beta received the ping')
    beta.send({ id: betaRequest.id, type: 'pong', data: { inWorld: true, pid: 202 } })
    const response = await ping
    assert.equal(response.pid, 202)
    alpha.socket.destroy()
    beta.socket.destroy()
    alphaRequest.catch(() => {})
  })

  await test('an unknown machine id fails with a readable error', async () => {
    await assert.rejects(
      () => channel.ping('client', 300, 'c-does-not-exist'),
      /已断开|重新选择/,
    )
  })
} finally {
  await channel.close()
}

console.log(`\n${passed} channel tests passed`)
