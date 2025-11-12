# server

## decisions
### libraries
* data validation: [`effect` schema](https://effect.website/docs/schema/introduction/)

  spiritual successor to [`io-ts`](https://gcanti.github.io/io-ts/). like [`io-ts`](https://gcanti.github.io/io-ts/) before it, [`effect`](https://effect.website/)'s schema seperates validation from decoding. it exposes [type guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates), which are cheap to run in hot loops. none of the examined alternatives ([Zod](https://zod.dev/), [ArkType](https://arktype.io/)) support these

* web server: [`hono`](https://hono.dev)

  desire for more type-safety over [`express`](https://expressjs.com/)

* testing: node.js's built-in test runner

  `tap` was used previously, but was replaced because the built-in alternative is good enough

* dependency injection: [@lppedd/di-wise-neo](https://github.com/lppedd/di-wise-neo)

  desire for a solution that uses ECMAScript decorators, and therefor does not require a reflect polyfill

* building: [`esbuild`](https://esbuild.github.io/)

  previous experience of building out bespoke server side rendering
