import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/store/useAuth'

/** Guards tool exports behind auth + daily free quota. Returns false if blocked. */
export async function gateToolExport(toolLabel: string): Promise<boolean> {
  const { user, exportsRemaining, recordExport } = useAuth.getState()
  if (!user) {
    toast.error('Sign in required', 'Create an account to export from this tool.')
    return false
  }
  const left = exportsRemaining()
  if (left !== null && left <= 0) {
    toast.error('Daily export limit reached', 'Upgrade to Supporter for unlimited exports, or try again tomorrow.')
    return false
  }
  await recordExport()
  toast.success('Exported', `${toolLabel} counted toward your daily quota.`)
  return true
}
