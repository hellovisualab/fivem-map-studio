import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { create } from 'zustand'
import { uid } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  description?: string
}

interface ToastState {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = uid(6)
    set((s) => ({ items: [...s.items, { ...t, id }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), t.kind === 'error' ? 6000 : 3500)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  success: (title: string, description?: string) => useToast.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useToast.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) => useToast.getState().push({ kind: 'info', title, description }),
}

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  error: <AlertTriangle className="h-4 w-4 text-red-400" />,
  info: <Info className="h-4 w-4 text-brand-400" />,
}

export function Toaster() {
  const { items, dismiss } = useToast()
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="panel pointer-events-auto flex items-start gap-3 px-4 py-3"
          >
            <div className="mt-0.5">{icons[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-100">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-ink-400">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-ink-500 hover:text-ink-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
