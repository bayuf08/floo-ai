/**
 * Type augmentation for the auth/session pieces.
 *
 * - `event.context.user` is populated by server/middleware/auth.ts
 *   from the nuxt-auth-utils session. Routes call `requireUser(event)`
 *   from server/utils/supabase.ts to read it.
 * - The nuxt-auth-utils `User` and `UserSession` interfaces are widened
 *   so `setUserSession` / `getUserSession` are typed end-to-end.
 */
import 'h3'

declare module 'h3' {
  interface H3EventContext {
    user?: {
      id: string
      email: string
      name: string
      avatar_url: string | null
      role: string
    }
  }
}

declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatar_url: string | null
    role: string
  }
  interface UserSession {
    /** Google `sub` claim — handy for debugging and re-issuing tokens. */
    googleSub?: string
    /** Epoch ms timestamp of the most recent successful login. */
    loggedInAt?: number
  }
}

export {}
