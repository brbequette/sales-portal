import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAiConversations, type AiMessage } from './useAiConversations'
beforeEach(() => localStorage.clear())
afterEach(cleanup)
const message = (content: string): AiMessage => ({ role: 'user', content, timestamp: new Date() })
async function setup(id = 'user-a') { const hook = renderHook(() => useAiConversations(id)); await waitFor(() => expect(hook.result.current.ready).toBe(true)); return hook }
describe('AI topic conversations', () => {
  it('keeps separate messages and drafts, archives without deletion, restores and survives reload', async () => {
    const h = await setup(); const first = h.result.current.conversation!.id
    act(() => { h.result.current.setMessages([message('Shipping rates')]); h.result.current.setInputText('Unsent shipping question') })
    act(() => h.result.current.newChat()); const second = h.result.current.conversation!.id
    expect(h.result.current.messages).toEqual([]); expect(h.result.current.inputText).toBe('')
    act(() => h.result.current.setMessages([message('Commission questions')]))
    act(() => h.result.current.archiveChat())
    expect(h.result.current.conversations.find(c => c.id === second)?.archived).toBe(true)
    expect(h.result.current.conversation?.id).toBe(first)
    expect(h.result.current.inputText).toBe('Unsent shipping question')
    act(() => h.result.current.openChat(second))
    expect(h.result.current.messages[0].content).toBe('Commission questions')
    expect(h.result.current.conversation?.archived).toBe(false)
    act(() => h.result.current.renameChat('Commissions Q4'))
    h.unmount(); const reload = await setup()
    expect(reload.result.current.conversation?.title).toBe('Commissions Q4')
    expect(reload.result.current.conversations).toHaveLength(2)
  })
  it('migrates existing history and retains the original backup', async () => {
    const old = JSON.stringify({ messages: [message('Existing question')] })
    localStorage.setItem('titan-ai-history:v1:user-a', old)
    const h = await setup()
    expect(h.result.current.messages[0].content).toBe('Existing question')
    expect(h.result.current.messages[0].timestamp).toBeInstanceOf(Date)
    expect(localStorage.getItem('titan-ai-history:v1:user-a')).toBe(old)
  })
  it('routes a late response to its original topic after switching', async () => {
    const h = await setup(); const first = h.result.current.conversation!.id
    const reply = h.result.current.setMessages
    act(() => h.result.current.newChat())
    act(() => reply(previous => [...previous, { ...message('Original reply'), role: 'assistant' }]))
    expect(h.result.current.messages).toEqual([])
    expect(h.result.current.conversations.find(c => c.id === first)?.messages[0].content).toBe('Original reply')
  })
  it('isolates users and ignores a previous user’s late response', async () => {
    const h = renderHook(({id}) => useAiConversations(id), { initialProps: {id:'user-a'} })
    await waitFor(() => expect(h.result.current.ready).toBe(true))
    act(() => h.result.current.setMessages([message('Private A')]))
    const late = h.result.current.setMessages
    h.rerender({id:'user-b'}); await waitFor(() => expect(h.result.current.ready).toBe(true))
    act(() => late(previous => [...previous, message('Late A')]))
    expect(h.result.current.messages).toEqual([])
    expect(localStorage.getItem('titan-ai-conversations:v2:user-b')).not.toContain('Private A')
  })
  it('bounds saved history and does not overwrite unreadable stored chats', async () => {
    const h = await setup(); act(() => h.result.current.setMessages(Array.from({length:70}, (_,i) => message(`Question ${i}`))))
    expect(JSON.parse(localStorage.getItem('titan-ai-conversations:v2:user-a')!).conversations[0].messages).toHaveLength(50)
    h.unmount(); localStorage.setItem('titan-ai-conversations:v2:user-a', 'unreadable')
    const bad = await setup(); expect(bad.result.current.storageError).toBe(true)
    act(() => bad.result.current.setInputText('Still usable'))
    expect(localStorage.getItem('titan-ai-conversations:v2:user-a')).toBe('unreadable')
  })
})

it('preserves topics saved by another window and receives archive updates', async () => {
  const h = await setup(); const original = h.result.current.conversation!.id
  const external = {id:'second-window', title:'Other window topic', archived:false, messages:[message('Other topic')],draft:'',updatedAt:new Date(Date.now()+1000).toISOString()}
  const stored = JSON.parse(localStorage.getItem('titan-ai-conversations:v2:user-a')!)
  localStorage.setItem('titan-ai-conversations:v2:user-a', JSON.stringify({...stored,conversations:[...stored.conversations,external]}))
  act(() => h.result.current.setInputText('My draft'))
  expect(JSON.parse(localStorage.getItem('titan-ai-conversations:v2:user-a')!).conversations).toHaveLength(2)
  act(() => window.dispatchEvent(new StorageEvent('storage',{key:'titan-ai-conversations:v2:user-a',newValue:JSON.stringify({...stored,conversations:[...stored.conversations,{...external,archived:true}]})})))
  expect(h.result.current.conversations.find(c=>c.id==='second-window')?.archived).toBe(true)
  expect(h.result.current.conversation?.id).toBe(original)
  expect(h.result.current.inputText).toBe('My draft')
})
