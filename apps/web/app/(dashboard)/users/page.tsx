'use client'

import { useEffect, useState } from 'react'
import { usersApi, type User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Plus, Search, ToggleLeft, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react'
import { useLocale } from '@/store/locale'
import { RoleGuard } from '@/components/RoleGuard'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export default function UsersPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <UsersPageInner />
    </RoleGuard>
  )
}

function UsersPageInner() {
  const { t } = useLocale()
  const [users, setUsers]       = useState<User[]>([])
  const [loading, setLoading]   = useState(true)
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounced(searchInput, 350)
  const [role, setRole]         = useState('ALL')
  const [open, setOpen]         = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmUser, setConfirmUser] = useState<User | null>(null)
  const [toggling, setToggling] = useState(false)
  const [form, setForm]         = useState<{ email: string; firstName: string; lastName: string; role: UserRole; password: string }>({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = async () => {
    setLoading(true)
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (role !== 'ALL') q.set('role', role)
    q.set('page', String(page))
    q.set('limit', String(PAGE_SIZE))
    const res = await usersApi.list(q.toString()).catch(e => { toast.error(e.message); return null })
    if (res) {
      setUsers(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    }
    setLoading(false)
  }

  // Filtr o'zgarsa birinchi sahifaga qaytiladi — aks holda 3-sahifada
  // qidirilsa, natija yo'q bo'lib ko'rinishi mumkin edi.
  useEffect(() => { setPage(1) }, [search, role])
  useEffect(() => { load() }, [search, role, page]) // eslint-disable-line

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error("Parol kamida 8 belgidan iborat bo'lishi kerak")
      return
    }
    setCreating(true)
    try {
      await usersApi.create(form)
      toast.success("Foydalanuvchi yaratildi")
      setOpen(false)
      setForm({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' })
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  const confirmToggle = async () => {
    if (!confirmUser) return
    setToggling(true)
    try {
      await usersApi.toggleStatus(confirmUser.id)
      toast.success(
        confirmUser.isActive
          ? `${confirmUser.firstName} faolsizlantirildi`
          : `${confirmUser.firstName} faollashtirildi`,
      )
      setConfirmUser(null)
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-[18px]" /> {t('users.new')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Yangi foydalanuvchi yaratish</DialogTitle></DialogHeader>
            <form onSubmit={createUser} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Ism</Label>
                  <Input value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Familiya</Label>
                  <Input value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Parol</Label>
                <Input
                  type="password" value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))}
                  required minLength={8}
                />
                <p className="text-[11px] text-muted-foreground">Kamida 8 belgi</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Rol</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: (v ?? 'TEACHER') as UserRole}))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="TEACHER">O'qituvchi</SelectItem>
                    <SelectItem value="STUDENT">Talaba</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Yaratilmoqda...' : 'Yaratish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
          <Input className="pl-8" placeholder={t('users.search')} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </div>
        <Select value={role} onValueChange={v => setRole(v ?? 'ALL')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Barcha rollar</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="TEACHER">O'qituvchi</SelectItem>
            <SelectItem value="STUDENT">Talaba</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ism</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Holat</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={`sk-${i}`}>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-40" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
            </TableRow>
          ))}
          {!loading && users.map(u => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
              <TableCell>
                <Badge variant={u.isActive ? 'default' : 'outline'}>
                  {u.isActive ? 'Faol' : 'Nofaol'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" onClick={() => setConfirmUser(u)} title="Holatni o'zgartirish">
                  <ToggleLeft className="size-[18px]" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && users.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <UsersIcon className="size-7 opacity-50" />
                  <p className="text-sm">Foydalanuvchi topilmadi</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {total} tadan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs px-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!confirmUser} onOpenChange={(v) => { if (!v) setConfirmUser(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmUser?.isActive ? 'Foydalanuvchini faolsizlantirish' : 'Foydalanuvchini faollashtirish'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmUser?.firstName} {confirmUser?.lastName} ({confirmUser?.email})
            {confirmUser?.isActive
              ? ' tizimga kira olmay qoladi. Davom etasizmi?'
              : ' tizimga qayta kira oladi. Davom etasizmi?'}
          </p>
          <DialogFooter showCloseButton>
            <Button
              variant={confirmUser?.isActive ? 'destructive' : 'default'}
              disabled={toggling}
              onClick={confirmToggle}
            >
              {toggling ? 'Bajarilmoqda...' : 'Tasdiqlash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
