/**
 * Shared Zero context type used by `zero-schema.gen.ts` for typed query/mutator
 * registries. The actual `Zero` client lifecycle is managed by `ZeroProvider`
 * (see `./provider.tsx`), which uses the library's managed mode.
 */
export interface ZeroContext {
  userId: string;
}
