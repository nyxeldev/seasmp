'use client'

/**
 * Real vaqt ulanishi — bitta soket butun ilova uchun.
 *
 * Nega kontekst: har bir sahifa o'zi ulansa, bir nechta soket ochilib, server
 * tomonda ham, brauzerda ham bekorga resurs ketadi. Bu yerda bitta ulanish
 * saqlanadi, sahifalar esa faqat hodisaga obuna bo'ladi.
 *
 * Token handshake da yuboriladi: server uni tekshiradi va xonalarni AYNAN
 * tokendan oladi (apps/api/src/realtime/gateway.ts). Mijoz o'zi xona nomini
 * tanlay olmaydi.
 */
import {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './auth-context'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export interface AttendanceMarkedEvent {
  attendanceId: string
  courseId:     string
  enrollmentId: string
  studentId:    string
  lessonDate:   string
  status:       string
  markedBy:     string
}

export interface SecurityAlertEvent {
  id:        string
  type:      string
  severity:  string
  layer:     string | null
  score:     number | null
  userId:    string | null
  createdAt: string
}

interface RealtimeContextValue {
  connected: boolean
  socket:    Socket | null
}

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false, socket: null })

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)

  // Ulanish AUTENTIFIKATSIYA HOLATIGA bog'lanadi, localStorage ga emas.
  //
  // Ilgari token faqat mount paytida o'qilardi. Kirish sahifasi mount
  // bo'lganda token hali yo'q edi, shuning uchun effekt darhol chiqib
  // ketardi va kirgandan keyin HECH QACHON qayta ulanmasdi: brauzerda
  // birorta /ws so'rovi ko'rinmasdi va jonli yangilanish jimgina ishlamasdi.
  // Chiqib qayta kirganda ham xuddi shunday.
  const { user } = useAuth()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) { setSocket(null); setConnected(false); return }
    const token = typeof window === 'undefined' ? null : localStorage.getItem('accessToken')
    if (!token) return

    const s = io(API, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      // Token eskirganda cheksiz qayta urinish loglarni to'ldiradi.
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    s.on('connect',       () => setConnected(true))
    s.on('disconnect',    () => setConnected(false))
    s.on('connect_error', () => setConnected(false))
    setSocket(s)

    return () => {
      s.removeAllListeners()
      s.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [userId])

  return (
    <RealtimeContext.Provider value={{ connected, socket }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext)
}

/**
 * Bitta hodisaga obuna bo'ladi va komponent yo'q bo'lganda o'zi uziladi.
 * Ishlovchi ref orqali saqlanadi — har renderda qayta obuna bo'lmaydi.
 */
export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void): void {
  const { socket } = useRealtime()
  const ref = useRef(handler)
  ref.current = handler

  const stable = useCallback((payload: T) => ref.current(payload), [])

  useEffect(() => {
    if (!socket) return
    socket.on(event, stable)
    return () => { socket.off(event, stable) }
  }, [socket, event, stable])
}
