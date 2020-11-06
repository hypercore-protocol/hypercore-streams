const tape = require('tape')
const { WriteStream, ReadStream } = require('..')
const ram = require('random-access-memory')
const collect = require('stream-collector')
const hypercore = require('hypercore')
const createTrackingRam = require('./helpers/create-tracking-ram')

const create = (key, opts) => hypercore(ram, key, opts)

tape('basic readstream', function (t) {
  const feed = create()

  feed.append(['a', 'b', 'c'], function () {
    const rs = new ReadStream(feed)
    const expected = ['a', 'b', 'c']

    rs.on('data', function (data) {
      t.same(data, Buffer.from(expected.shift()))
    })
    rs.on('end', function () {
      t.end()
    })
  })
})

tape('tail reading stream', function (t) {
  const feed = create()
  t.plan(2)

  feed.append(['a', 'b', 'c'], function () {
    const rs = new ReadStream(feed, { tail: true, live: true })
    const expected = ['d', 'e']

    rs.on('data', function (data) {
      t.same(data, Buffer.from(expected.shift()))
    })

    feed.ready(function () {
      feed.append(['d', 'e'])
    })

    rs.on('end', function () {
      t.fail('should not end')
    })
  })
})

tape('live readstream', function (t) {
  t.plan(2)

  const feed = create()

  feed.append(['a', 'b', 'c'], function () {
    const rs = new ReadStream(feed, { start: 1, live: true })
    const expected = ['b', 'c']

    rs.on('data', function (data) {
      t.same(data, Buffer.from(expected.shift()))
    })
    rs.on('end', function () {
      t.fail('should not end')
    })
  })
})

tape('basic writestream', function (t) {
  t.plan(1 + 2 * 3)

  const feed = create()

  const ws = new WriteStream(feed)

  ws.write(Buffer.from('a'))
  ws.write(Buffer.from('b'))
  ws.write(Buffer.from('c'))

  ws.end()

  ws.on('finish', function () {
    t.same(feed.length, 3)

    feed.get(0, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('a'))
    })

    feed.get(1, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('b'))
    })

    feed.get(2, function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('c'))
    })
  })
})

tape('valueEncoding test', function (t) {
  const feed = create({ valueEncoding: 'json' })

  feed.append(['a', 'b', 'c'], function () {
    const rs = new ReadStream(feed, { valueEncoding: 'buffer' })
    const expected = ['a', 'b', 'c']

    rs.on('data', function (data) {
      t.same(data, Buffer.from('"' + expected.shift() + '"\n'))
    })
    rs.on('end', function () {
      t.end()
    })
  })
})

tape('append and WriteStreams preserve seq', function (t) {
  const feed = create()

  const ws = new WriteStream(feed)

  ws.write('a')
  ws.write('b')
  ws.write('c')
  ws.end(function () {
    t.same(feed.length, 3)
    feed.append('d', function (err, seq) {
      t.error(err)
      t.same(seq, 3)
      t.same(feed.length, 4)

      const ws1 = new WriteStream(feed)

      ws1.write('e')
      ws1.write('f')
      ws1.end(function () {
        feed.append('g', function (err, seq) {
          t.error(err)
          t.same(seq, 6)
          t.same(feed.length, 7)
          t.end()
        })
      })
    })
  })
})

tape('close calls pending callbacks', function (t) {
  t.plan(5)

  const feed = create()

  ;(new ReadStream(feed, { live: true }))
    .once('error', function (err) {
      t.ok(err, 'read stream errors')
    })
    .resume()

  feed.get(0, function (err) {
    t.ok(err, 'get errors')
  })

  feed.once('close', function () {
    t.pass('close emitted')
  })

  feed.ready(function () {
    feed.close(function () {
      (new ReadStream(feed, { live: true }))
        .once('error', function (err) {
          t.ok(err, 'read stream still errors')
        })
        .resume()

      feed.get(0, function (err) {
        t.ok(err, 'get still errors')
      })
    })
  })
})

tape('closing all streams on close', function (t) {
  var memories = {}
  var feed = hypercore(function (filename) {
    var memory = memories[filename]
    if (!memory) {
      memory = ram()
      memories[filename] = memory
    }
    return memory
  })
  var expectedFiles = ['key', 'secret_key', 'tree', 'data', 'bitfield', 'signatures']
  feed.ready(function () {
    t.deepEquals(Object.keys(memories), expectedFiles, 'all files are open')
    feed.close(function () {
      expectedFiles.forEach(function (filename) {
        var memory = memories[filename]
        t.ok(memory.closed, filename + ' is closed')
      })
      t.end()
    })
  })
})

tape('writes are batched', function (t) {
  var trackingRam = createTrackingRam()
  var feed = hypercore(trackingRam)
  var ws = new WriteStream(feed)

  ws.write('ab')
  ws.write('cd')
  setImmediate(function () {
    ws.write('ef')
    ws.write('gh')
    ws.end(function () {
      t.deepEquals(trackingRam.log.data, [
        { write: [0, Buffer.from('abcd')] },
        { write: [4, Buffer.from('efgh')] }
      ])
      feed.close(function () {
        t.end()
      })
    })
  })
})

tape('reads are batched', function (t) {
  const feed = hypercore(ram)
  const _getBatch = feed.getBatch
  const batchCalls = []
  feed.getBatch = function (start, end, opts) {
    batchCalls.push({ start, end, opts })
    return _getBatch.apply(feed, arguments)
  }

  feed.append(['a', 'b', 'c'], function () {
    const rs = new ReadStream(feed, { batch: 2 })
    const expected = ['a', 'b', 'c']

    rs.on('data', function (data) {
      t.same(data, Buffer.from(expected.shift()))
    })
    rs.on('end', function () {
      t.deepEquals(batchCalls, [
        { start: 0, end: 2, opts: { wait: true, ifAvailable: false, valueEncoding: undefined } },
        { start: 2, end: 3, opts: { wait: true, ifAvailable: false, valueEncoding: undefined } }
      ])
      t.end()
    })
  })
})

tape('value encoding read-stream', function (t) {
  const feed = hypercore(ram, { valueEncoding: 'json' })

  feed.append({ hello: 'world' }, function () {
    (new ReadStream(feed))
      .on('data', function (data) {
        t.same(data, { hello: 'world' })
      })
      .on('end', function () {
        (new ReadStream(feed, { valueEncoding: 'utf-8' }))
          .on('data', function (data) {
            t.same(data, '{"hello":"world"}\n')
            t.end()
          })
      })
  })
})

tape('value encoding write-stream', function (t) {
  const feed = hypercore(ram, { valueEncoding: 'json' })

  const ws = new WriteStream(feed)
  ws.write([1, 2, 3])
  ws.end(function () {
    feed.get(0, function (err, val) {
      t.error(err, 'no error')
      t.same(val, [1, 2, 3])
      t.end()
    })
  })
})

function test (batch = 1) {
  tape('ReadStream to WriteStream', function (t) {
    var feed1 = create()
    var feed2 = create()

    feed1.append(['hello', 'world'], function () {
      var r = new ReadStream(feed1, { batch })
      var w = new WriteStream(feed2)

      r.pipe(w).on('finish', function () {
        collect(new ReadStream(feed2, { batch }), function (err, data) {
          t.error(err, 'no error')
          t.same(data, [Buffer.from('hello'), Buffer.from('world')])
          t.end()
        })
      })
    })
  })

  tape('ReadStream with start, end', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })

    feed.append(['hello', 'multiple', 'worlds'], function () {
      collect(new ReadStream(feed, { start: 1, end: 2, batch }), function (err, data) {
        t.error(err, 'no error')
        t.same(data, ['multiple'])
        t.end()
      })
    })
  })

  tape('ReadStream with start, no end', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })

    feed.append(['hello', 'multiple', 'worlds'], function () {
      collect(new ReadStream(feed, { start: 1, batch }), function (err, data) {
        t.error(err, 'no error')
        t.same(data, ['multiple', 'worlds'])
        t.end()
      })
    })
  })

  tape('ReadStream with no start, end', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })

    feed.append(['hello', 'multiple', 'worlds'], function () {
      collect(new ReadStream(feed, { end: 2, batch }), function (err, data) {
        t.error(err, 'no error')
        t.same(data, ['hello', 'multiple'])
        t.end()
      })
    })
  })

  tape('ReadStream with live: true', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })
    var expected = ['a', 'b', 'c', 'd', 'e']

    t.plan(expected.length)

    var rs = new ReadStream(feed, { live: true, batch })

    rs.on('data', function (data) {
      t.same(data, expected.shift())
    })

    rs.on('end', function () {
      t.fail('should never end')
    })

    feed.append('a', function () {
      feed.append('b', function () {
        feed.append(['c', 'd', 'e'])
      })
    })
  })

  tape('ReadStream with live: true after append', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })
    var expected = ['a', 'b', 'c', 'd', 'e']

    t.plan(expected.length)

    feed.append(['a', 'b'], function () {
      var rs = new ReadStream(feed, { live: true, batch })

      rs.on('data', function (data) {
        t.same(data, expected.shift())
      })

      rs.on('end', function () {
        t.fail('should never end')
      })

      feed.append(['c', 'd', 'e'])
    })
  })

  tape('ReadStream with live: true and tail: true', function (t) {
    var feed = create({ valueEncoding: 'utf-8' })
    var expected = ['c', 'd', 'e']

    t.plan(expected.length)

    feed.append(['a', 'b'], function () {
      var rs = new ReadStream(feed, { live: true, tail: true, batch })

      rs.on('data', function (data) {
        t.same(data, expected.shift())
      })

      rs.on('end', function () {
        t.fail('should never end')
      })

      setImmediate(function () {
        feed.append(['c', 'd', 'e'])
      })
    })
  })
}

tape('WriteStream with maxBlockSize', function (t) {
  t.plan(11 * 2 + 1)

  var feed = create()

  var ws = new WriteStream(feed, { maxBlockSize: 100 * 1024 })

  ws.write(Buffer.alloc(1024 * 1024))
  ws.end(function () {
    t.same(feed.length, 11)

    sameSize(0, 100 * 1024)
    sameSize(1, 100 * 1024)
    sameSize(2, 100 * 1024)
    sameSize(3, 100 * 1024)
    sameSize(4, 100 * 1024)
    sameSize(5, 100 * 1024)
    sameSize(6, 100 * 1024)
    sameSize(7, 100 * 1024)
    sameSize(8, 100 * 1024)
    sameSize(9, 100 * 1024)
    sameSize(10, 1024 * 1024 - 10 * 100 * 1024)

    function sameSize (idx, size) {
      feed.get(idx, function (err, blk) {
        t.error(err, 'no error')
        t.same(blk.length, size)
      })
    }
  })
})

test()
test(10)
