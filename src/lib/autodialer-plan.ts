export type AutodialerPlan = {
  contactMode: "PRIMARY" | "ALL"
  callScriptId: string
  callScript: string
  smsEnabled: boolean
  smsDelayHours: number
  smsBody: string
  emailEnabled: boolean
  emailDelayHours: number
  emailSubject: string
  emailBody: string
}
