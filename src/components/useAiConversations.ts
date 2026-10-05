"use client"

import { useCallback, useEffect, useState, type SetStateAction } from 'react'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  logId?: string
  feedback?: boolean | null
  pendingActions?: Array<{ toolName: string; summary: string; confirmationToken: string }>
  verified?: boolean
  sourceCount?: number
  suggestedReplies?: string[]
}
export interface AiConversation {
  id: string
  title: string
  archived: boolean
  messages: AiMessage[]
  draft: string
  updatedAt: string
}
type Store = { owner: string; activeId: string; conversations: AiConversation[] }
const key = (owner: string) => `titan-ai-conversations:v2:${owner}`
const fresh = (): AiConversation => ({ id: crypto.randomUUID(), title: 'New chat', archived: false, messages: [], draft: '', updatedAt: new Date().toISOString() })
const empty = (owner: string): Store => { const chat = fresh(); return { owner, activeId: chat.id, conversations: [chat] } }
const apply = <T,>(action: SetStateAction<T>, value: T): T => typeof action === 'function' ? (action as (previous: T) => T)(value) : action

function readChats(value: unknown): AiConversation[] {
  if (!Array.isArray(value)) throw new Error('Invalid chat history')
  return value.filter((c: AiConversation) => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages)).map((c: AiConversation) => ({
    ...c, archived: c.archived === true, draft: typeof c.draft === 'string' ? c.draft : '', updatedAt: c.updatedAt || '',
    messages: c.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-50).map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
  }))
}
function mergeChats(current: AiConversation[], incoming: AiConversation[]) {
  const merged = new Map(current.map(c => [c.id, c]))
  for (const chat of incoming) {
    const existing = merged.get(chat.id)
    if (!existing || chat.updatedAt > existing.updatedAt) merged.set(chat.id, chat)
  }
  return [...merged.values()]
}
const touched = (chat: AiConversation): string => new Date(Math.max(Date.now(), (Date.parse(chat.updatedAt) || 0) + 1)).toISOString()

export function useAiConversations(userId?: string) {
  const owner = userId || 'guest'
  const [store, setStore] = useState<Store>(() => empty(owner))
  const [hydratedOwner, setHydratedOwner] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    let next = empty(owner)
    let failed = false
    if (userId) {
      try {
        const raw = localStorage.getItem(key(owner))
        if (raw) {
          const parsed = JSON.parse(raw)
          const conversations = readChats(parsed.conversations)
          const current = conversations.find(c => c.id === parsed.activeId && !c.archived) || conversations.find(c => !c.archived) || fresh()
          if (!conversations.some(c => c.id === current.id)) conversations.push(current)
          next = { owner, activeId: current.id, conversations }
        } else {
          // Keep the original key intact so upgrading never discards the previous chat.
          const legacy = JSON.parse(localStorage.getItem(`titan-ai-history:v1:${owner}`) || '{}')
          if (Array.isArray(legacy.messages) && legacy.messages.length) {
            next.conversations[0].messages = legacy.messages.filter((m: AiMessage) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-50).map((m: AiMessage) => ({ ...m, timestamp: new Date(m.timestamp) }))
            next.conversations[0].title = 'Previous conversation'
          }
        }
      } catch { failed = true }
    }
    queueMicrotask(() => { setStore(next); setHydratedOwner(owner); setStorageError(failed) })
  }, [owner, userId])

  useEffect(() => {
    if (!userId || hydratedOwner !== owner || store.owner !== owner || storageError) return
    try {
      const existing = localStorage.getItem(key(owner))
      const conversations = mergeChats(store.conversations, existing ? readChats(JSON.parse(existing).conversations) : [])
      localStorage.setItem(key(owner), JSON.stringify({ ...store, conversations: conversations.map(c => ({ ...c, messages: c.messages.slice(-50) })) }))
    } catch { queueMicrotask(() => setStorageError(true)) }
  }, [store, owner, userId, hydratedOwner, storageError])

  useEffect(() => {
    if (!userId) return
    const receive = (event: StorageEvent) => {
      if (event.key !== key(owner) || !event.newValue) return
      try {
        const incoming = readChats(JSON.parse(event.newValue).conversations)
        setStore(previous => {
          if (previous.owner !== owner) return previous
          const conversations = mergeChats(previous.conversations, incoming)
          if (JSON.stringify(conversations) === JSON.stringify(previous.conversations)) return previous
          const active = conversations.find(c => c.id === previous.activeId && !c.archived) || conversations.find(c => !c.archived)
          return { ...previous, conversations, activeId: active?.id || previous.activeId }
        })
      } catch { setStorageError(true) }
    }
    window.addEventListener('storage', receive)
    return () => window.removeEventListener('storage', receive)
  }, [owner, userId])

  const ready = hydratedOwner === owner && store.owner === owner
  const conversation = ready ? store.conversations.find(c => c.id === store.activeId)! : undefined
  // Capture both owner and chat: a late reply must stay with the original conversation.
  const activeId = conversation?.id
  const update = useCallback((transform: (chat: AiConversation) => AiConversation) => setStore(previous => previous.owner !== owner ? previous : ({ ...previous, conversations: previous.conversations.map(c => c.id === activeId ? { ...transform(c), updatedAt: touched(c) } : c) })), [owner, activeId])
  const setMessages = (action: SetStateAction<AiMessage[]>) => update(c => {
    const messages = apply(action, c.messages)
    return { ...c, messages, title: c.title === 'New chat' ? messages.find(m => m.role === 'user')?.content.trim().slice(0, 80) || c.title : c.title, updatedAt: new Date().toISOString() }
  })
  const setInputText = useCallback((action: SetStateAction<string>) => update(c => ({ ...c, draft: apply(action, c.draft) })), [update])
  const newChat = () => setStore(previous => {
    if (previous.owner !== owner) return previous
    const chat = fresh()
    return { ...previous, activeId: chat.id, conversations: [...previous.conversations, chat] }
  })
  const openChat = (id: string) => setStore(previous => previous.owner !== owner ? previous : ({ ...previous, activeId: id, conversations: previous.conversations.map(c => c.id === id ? { ...c, archived: false, updatedAt: touched(c) } : c) }))
  const archiveChat = () => setStore(previous => {
    if (previous.owner !== owner) return previous
    const conversations = previous.conversations.map(c => c.id === activeId ? { ...c, archived: true, updatedAt: touched(c) } : c)
    const next = conversations.find(c => !c.archived) || fresh()
    if (!conversations.some(c => c.id === next.id)) conversations.push(next)
    return { ...previous, activeId: next.id, conversations }
  })
  return { ready, conversation, conversations: ready ? store.conversations : [], messages: conversation?.messages || [], inputText: conversation?.draft || '', setMessages, setInputText, newChat, openChat, archiveChat, renameChat: (title: string) => update(c => ({ ...c, title: title.slice(0, 80) })), storageError }
}
