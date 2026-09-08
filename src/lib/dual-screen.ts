export const DUAL_SCREEN_CHANNEL = "titan-diamond-dual-screen-v1"

export type DualScreenView = "dashboard" | "processing" | "operations" | "salesboard"

export type DualScreenState = {
  view: DualScreenView
  title: string
  controllerPath: string
  updatedAt: string
}

export type DualScreenMessage = {
  id: string
  sourceId: string
  sequence: number
  sentAt: string
  type: "CONTROLLER_STATE" | "CONTROLLER_PING" | "DISPLAY_READY" | "DISPLAY_HEARTBEAT" | "DISPLAY_CLOSING" | "DISPLAY_ACK"
  state?: DualScreenState
  displayId?: string
  controllerId?: string
  acknowledgedId?: string
}

export const DUAL_SCREEN_VIEWS: Array<{ id: DualScreenView; label: string; description: string }> = [
  { id: "dashboard", label: "Rep Dashboard", description: "Personal sales activity, goals and pipeline" },
  { id: "processing", label: "Order Processing", description: "Clean order workstation and fulfillment flow" },
  { id: "operations", label: "Operations Queue", description: "Company exceptions, handoffs and deadlines" },
  { id: "salesboard", label: "TV Salesboard", description: "Large-format sales performance display" },
]

export function isDualScreenMessage(value: unknown): value is DualScreenMessage {
  if (!value || typeof value !== "object") return false
  const message = value as Partial<DualScreenMessage>
  return typeof message.id === "string" && typeof message.sourceId === "string" && typeof message.sequence === "number" && typeof message.type === "string"
}
