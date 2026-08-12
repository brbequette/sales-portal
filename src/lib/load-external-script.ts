const pendingScripts = new Map<string, Promise<void>>()

export function loadExternalScript(src: string, id: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Scripts can only be loaded in the browser"))
  }

  const existing = document.getElementById(id) as HTMLScriptElement | null
  if (existing?.dataset.loaded === "true") return Promise.resolve()

  const pending = pendingScripts.get(id)
  if (pending) return pending

  const promise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script")
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = "true"
      resolve()
    }
    script.onerror = () => {
      pendingScripts.delete(id)
      reject(new Error("Unable to load the secure payment processor"))
    }
    if (!existing) document.head.appendChild(script)
  })

  pendingScripts.set(id, promise)
  return promise
}

export const loadAcceptJs = () =>
  loadExternalScript("https://js.authorize.net/v1/Accept.js", "authorize-net-accept-js")
