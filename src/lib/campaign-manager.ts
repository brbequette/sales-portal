/**
 * campaign-manager.ts
 *
 * Module-level singleton that manages campaign job polling.
 * Lives in browser JS memory independently of React — survives navigation.
 * State is persisted in the DB, so refresh just reconnects via localStorage jobId.
 */

const STORAGE_KEY = "titan_active_campaign_job_id"
const POLL_INTERVAL_MS = 3000

export interface CampaignState {
  jobId: string | null
  status: "idle" | "running" | "done" | "cancelled" | "error"
  progress: number
  total: number
  sentCount: number
  failedCount: number
  name: string
  channel: string
  error: string | null
}

export interface CampaignStartConfig {
  accountIds: string[]
  channel: string
  text: string
  imageUrl: string
  campaignName: string
  fromNumber: string
  userId: string
  userEmail: string
}

export interface SampleSendConfig {
  testPhone: string
  channel: string
  text: string
  imageUrl: string
  fromNumber: string
  userId: string
  userEmail: string
}

const DEFAULT_STATE: CampaignState = {
  jobId: null,
  status: "idle",
  progress: 0,
  total: 0,
  sentCount: 0,
  failedCount: 0,
  name: "",
  channel: "SMS",
  error: null,
}

class CampaignManager {
  private state: CampaignState = { ...DEFAULT_STATE }
  private listeners: Set<(s: CampaignState) => void> = new Set()
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false

  /** Called once on app mount — reconnects to any in-progress job from localStorage */
  init() {
    if (this.initialized || typeof window === "undefined") return
    this.initialized = true

    const savedJobId = localStorage.getItem(STORAGE_KEY)
    if (savedJobId) {
      this.state = { ...DEFAULT_STATE, jobId: savedJobId, status: "running" }
      this.notify()
      this.schedulePoll()
    }
  }

  getState(): CampaignState {
    return { ...this.state }
  }

  subscribe(fn: (s: CampaignState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    const snap = this.getState()
    this.listeners.forEach((fn) => fn(snap))
  }

  private schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS)
  }

  private async poll() {
    if (!this.state.jobId || (this.state.status !== "running" && this.state.status !== "idle")) return

    try {
      const res = await fetch(`/api/campaign-job/status?jobId=${this.state.jobId}`)
      const data = await res.json()

      if (!data.success && res.status !== 200) {
        // Transient error — retry
        this.schedulePoll()
        return
      }

      const serverStatus = (data.status || "").toLowerCase()

      if (serverStatus === "done") {
        this.state = {
          ...this.state,
          status: "done",
          progress: data.total,
          total: data.total,
          sentCount: data.sentCount || 0,
          failedCount: data.failedCount || 0,
        }
        this.notify()
        // Clear after 6 seconds so the pill can show the done state
        setTimeout(() => this.clear(), 6000)
      } else if (serverStatus === "cancelled") {
        this.state = { ...this.state, status: "cancelled", progress: data.progress || this.state.progress }
        this.notify()
        setTimeout(() => this.clear(), 4000)
      } else if (serverStatus === "error") {
        this.state = { ...this.state, status: "error", error: data.error || "Unknown error" }
        this.notify()
        setTimeout(() => this.clear(), 6000)
      } else {
        // Still running
        this.state = {
          ...this.state,
          status: "running",
          progress: data.progress ?? this.state.progress,
          total: data.total ?? this.state.total,
          sentCount: data.sentCount ?? this.state.sentCount,
          failedCount: data.failedCount ?? this.state.failedCount,
          name: data.name || this.state.name,
        }
        this.notify()
        this.schedulePoll()
      }
    } catch (err) {
      console.error("[CampaignManager] Poll error:", err)
      // Network error — retry
      this.schedulePoll()
    }
  }

  /** Start a new campaign job */
  async start(config: CampaignStartConfig): Promise<{ success: boolean; error?: string }> {
    if (this.state.status === "running") {
      return { success: false, error: "A campaign is already running." }
    }

    try {
      const res = await fetch("/api/campaign-job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        return { success: false, error: data.message || "Failed to start campaign." }
      }

      const jobId = data.jobId
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, jobId)

      this.state = {
        jobId,
        status: data.progress >= data.total ? "done" : "running",
        progress: data.progress || 0,
        total: data.total || config.accountIds.length,
        sentCount: data.sentCount || 0,
        failedCount: data.failedCount || 0,
        name: config.campaignName,
        channel: config.channel,
        error: null,
      }
      this.notify()

      if (this.state.status === "running") {
        this.schedulePoll()
      } else {
        setTimeout(() => this.clear(), 6000)
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" }
    }
  }

  /** Cancel the current campaign */
  async cancel(): Promise<void> {
    if (!this.state.jobId) return
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null }

    try {
      await fetch("/api/campaign-job/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: this.state.jobId }),
      })
    } catch {}

    this.state = { ...this.state, status: "cancelled" }
    this.notify()
    setTimeout(() => this.clear(), 4000)
  }

  /** Send a single test message */
  async sendSample(config: SampleSendConfig): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch("/api/campaign-job/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      return { success: data.success, message: data.message }
    } catch (err: any) {
      return { success: false, message: err.message || "Network error" }
    }
  }

  private clear() {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null }
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY)
    this.state = { ...DEFAULT_STATE }
    this.notify()
  }
}

// Export as singleton
export const campaignManager = new CampaignManager()
