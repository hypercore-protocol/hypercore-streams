# hypercore-streams

Implementation of WriteStream and ReadStream for [hypercore](https://github.com/hypercore-protocol/hypercore).

```
npm install hypercore-streams
```

## Usage

``` js
const { WriteStream, ReadStream } = require('hypercore-streams')

const ws = new WriteStream(feed, [options])
const rs = new ReadStream(feed, [options])
```

Options for `WriteStream`:

```js
{
  maxBlockSize: Infinity // set this to auto chunk individual blocks if they are larger than this number
}
```

Options for `ReadStream`:

```js
{
  start: 0, // read from this index
  end: feed.length, // read until this index
  snapshot: true, // if set to false it will update `end` to `feed.length` on every read
  tail: false, // sets `start` to `feed.length`
  live: false, // set to true to keep reading forever
  timeout: 0, // timeout for each data event (0 means no timeout)
  wait: true, // wait for data to be downloaded
  batch: 1 // amount of messages to read in batch, increasing it (e.g. 100) can improve the performance reading
}
```

## License

MIT
