// Same role as ../../global.d.ts but scoped to the server tsconfig
// (`.nuxt/tsconfig.server.json`), whose include glob picks up
// `server/**/*` but NOT root-level `.d.ts` files. Without this shim,
// `bun-types` and `@types/node` symbols are invisible inside
// `server/utils/*.test.ts`.
/// <reference types="node" />
/// <reference types="bun-types" />
export {}
