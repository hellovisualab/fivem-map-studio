import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/store/useAuth'

/** Sign-in + daily free quota check for tool exports. Returns false (with a toast) if blocked. */
export function canExportTool(): boolean {
  const { user, exportsRemaining } = useAuth.getState()
  if (!user) {
    toast.error('Sign in required', 'Create an account to export from this tool.')
    return false
  }
  const left = exportsRemaining()
  if (left !== null && left <= 0) {
    toast.error('Daily export limit reached', 'Upgrade to Supporter for unlimited exports, or try again tomorrow.')
    return false
  }
  return true
}

/** Counts a finished tool export toward the daily quota. */
export async function recordToolExport(toolLabel: string) {
  await useAuth.getState().recordExport()
  toast.success('Exported', `${toolLabel} counted toward your daily quota.`)
}

/** Guards tool exports behind auth + daily free quota. Returns false if blocked. */
export async function gateToolExport(toolLabel: string): Promise<boolean> {
  if (!canExportTool()) return false
  await recordToolExport(toolLabel)
  return true
}
