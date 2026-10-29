import { createContext, useContext } from 'react'

export type Me = { kind: 'admin' } | { kind: 'key'; name: string; app: string | null; scope: 'read' | 'write' }

export const MeContext = createContext<Me>({ kind: 'admin' })
export const useMe = () => useContext(MeContext)
export const canWrite = (me: Me) => me.kind === 'admin' || me.scope === 'write'
