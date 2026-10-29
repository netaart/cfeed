export type Auth =
  | { kind: 'admin' }
  | { kind: 'key'; id: string; name: string; app: string | null; scope: 'read' | 'write' }

export type Bindings = CloudflareBindings & { ADMIN_TOKEN?: string; IP_SALT?: string }

export type AppEnv = { Bindings: Bindings; Variables: { auth: Auth } }
