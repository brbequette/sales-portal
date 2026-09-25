import { requireAdministrator } from "@/lib/auth-helpers"
import VoiceCallReconciliation from "./voice-call-reconciliation"

export default async function Page() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return <p>Administrator access required.</p>
  return <VoiceCallReconciliation />
}
