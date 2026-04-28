// Ambient type references picked up by both the app and node tsconfigs
// generated under .nuxt/. The Nuxt-generated tsconfigs use `types: []` to
// opt out of automatic type discovery, so any @types/* package we want
// globally available must be referenced explicitly.
//
// - `node` makes Node built-ins (e.g. `node:url`, `node:fs`) typed inside
//   `nuxt.config.ts` and any other root-level `.ts` files.
// - `bun-types` exposes `bun:test`'s `describe / test / expect` symbols so
//   the *.test.ts files (which run via `bun test`) don't break vue-tsc.
//
// This file lives at the project root so the app tsconfig's include glob
// `"../*.d.ts"` picks it up. Server tests have a sibling shim under
// `server/types/global.d.ts`.
/// <reference types="node" />
/// <reference types="bun-types" />
export {}
