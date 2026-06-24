import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { iam, type Me } from '../lib/iam'

interface SessionApi {
  me: Me | null
  refresh: () => Promise<Me | null>
  signOut: () => Promise<void>
  setMe: (me: Me | null) => void
}

const Ctx = createContext<SessionApi>({
  me: null,
  refresh: async () => null,
  signOut: async () => {},
  setMe: () => {},
})
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(async () => {
    try {
      const m = await iam.me()
      setMe(m)
      return m
    } catch {
      setMe(null)
      return null
    }
  }, [])

  const signOut = useCallback(async () => {
    await iam.logout()
    setMe(null)
  }, [])

  return <Ctx.Provider value={{ me, refresh, signOut, setMe }}>{children}</Ctx.Provider>
}
