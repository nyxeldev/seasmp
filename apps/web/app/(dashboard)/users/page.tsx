'use client'

import { useEffect, useState } from 'react'
import { usersApi, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Search, ToggleLeft } from 'lucide-react'
import { useLocale } from '@/store/locale'

export default function UsersPage() {
  const { user: me } = useAuth()
  const { t } = useLocale()
  const [users, setUsers]     = useState<User[]>([])
  const [search, setSearch]   = useState('')
  const [role, setRole]       = useState('ALL')
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState<{ email: string; firstName: string; lastName: string; role: UserRole; password: string }>({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' })

  const load = async () => {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (role !== 'ALL') q.set('role', role)
    const res = await usersApi.list(q.toString()).catch(e => { toast.error(e.message); return null })
    if (res) setUsers(res.data)
  }

  useEffect(() => { load() }, [search, role]) // eslint-disable-line

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await usersApi.create(form)
      toast.success('User created')
      setOpen(false)
      setForm({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' })
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  const toggle = async (u: User) => {
    try {
      await usersApi.toggleStatus(u.id)
      toast.success(`${u.firstName} ${u.isActive ? 'deactivated' : 'activated'}`)
      load()
    } catch (err: any) { toast.error(err.message) }
  }

  if (me?.role !== 'ADMIN') return <p className="text-muted-foreground">Kirish taqiqlangan.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('students.title')}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" /> {t('students.new')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            <form onSubmit={createUser} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>First name</Label>
                  <Input value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Last name</Label>
                  <Input value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: (v ?? 'TEACHER') as UserRole}))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="TEACHER">Teacher</SelectItem>
                    <SelectItem value="STUDENT">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('students.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={role} onValueChange={v => setRole(v ?? 'ALL')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="TEACHER">Teacher</SelectItem>
            <SelectItem value="STUDENT">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
              <TableCell>
                <Badge variant={u.isActive ? 'default' : 'outline'}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" onClick={() => toggle(u)} title="Toggle status">
                  <ToggleLeft className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No users found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
