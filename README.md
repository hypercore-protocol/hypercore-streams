[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/mafintosh/hypercore-streams)

# hypercore-streams

External implementation of a WriteStream and ReadStream for Hypercore

```
npm install hypercore-streams
```

## Usage

``` js
const { WriteStream, ReadStream } = require('hypercore-streams')

const ws = new WriteStream(feed)
const rs = new ReadStream(feed, {
  start: 0,
  live: true
})
```

## License

MIT
