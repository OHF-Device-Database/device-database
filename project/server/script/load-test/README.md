# load testing

1. start object store

   ```sh
   make service-object-store
   ```

   (needs [seaweedfs](https://github.com/seaweedfs/seaweedfs) installed)

2. start load test

   ```sh
   SNAPSHOT_DEFER_TARGET="object-store" node script/load-test/index.ts --database-template <template-path>
   ```

   submissions happen continuously (`--workers <count>` to control concurrency), and metric endpoints are periodically scraped

## inspection

load test starts the server with `INSPECT=true` → inspector on `127.0.0.1:9229`

```sh
# repl with top-level await
node script/inspect.ts [--address <host:port>]
```

```sh
# debugger (breakpoints, stepping)
node inspect 127.0.0.1:9229
```
