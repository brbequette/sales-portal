use client
import { useState, useEffect, useRef } from react
import { FiSend, FiArrowLeft, FiMessageSquare, FiUser, FiSearch, FiZap } from react-icons/fi

export default function MessagesPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [textInput, setTextInput] = useState(")
 const [sending, setSending] = useState(false)
 const [suggesting, setSuggesting] = useState(false)
 const [suggestions, setSuggestions] = useState<string[]>([])
 
 const messagesEndRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
 fetchAccounts()
 }, [])

 useEffect(() => {
 if (selectedAccountId) {
 fetchMessages(selectedAccountId)
 setSuggestions([])
 }
 }, [selectedAccountId])

 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
 }, [messages])

 const fetchAccounts = async () => {
 try {
 setLoadingAccounts(true)
 const res = await fetch('/api/messages')
 const data = await res.json()
 if (data.success) {
 setAccounts(data.accounts)
 }
 } catch (e) {
 console.error(e)
 } finally {
 setLoadingAccounts(false)
 }
 }

 const fetchMessages = async (accountId: string) => {
 try {
 setLoadingMessages(true)
 const res = await fetch(/api/messages/)
 const data = await res.json()
 if (data.success) {
 setMessages(data.messages)
 }
 } catch (e) {
 console.error(e)
 } finally {
 setLoadingMessages(false)
 }
 }

 const handleSend = async () => {
 if (!textInput.trim() || !selectedAccountId) return
 
 // We need to know which fromNumber to use. 
 // Ideally we'd have a dropdown, but for simplicity let's find the most recent fromNumber we used with them, 
 // or fallback to the first one in their history.
 const lastOurMsg = [...messages].reverse().find(m => m.direction === 'OUTBOUND')
 const fromNumber = lastOurMsg?.fromNumber || ''
 
 if (!fromNumber) {
 alert('Could not determine which number to send from. Please use the campaign sender first.')
 return
 }

 try {
 setSending(true)
 const res = await fetch(/api/messages/, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: textInput, fromNumber })
 })
 const data = await res.json()
 if (data.success) {
 setTextInput('')
 setSuggestions([])
 fetchMessages(selectedAccountId)
 } else {
 alert('Error sending message: ' + data.error)
 }
 } catch (e) {
 console.error(e)
 alert('Error sending message.')
 } finally {
 setSending(false)
 }
 }

 const handleAiSuggest = async () => {
 if (!selectedAccountId || messages.length === 0) return
 try {
 setSuggesting(true)
 const res = await fetch('/api/ai/suggest-reply', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ accountId: selectedAccountId, messages: messages.slice(-10) })
 })
 const data = await res.json()
 if (data.success) {
 setSuggestions(data.suggestions)
 } else {
 alert('AI Suggestion failed: ' + data.error)
 }
 } catch (e) {
 console.error(e)
 } finally {
 setSuggesting(false)
 }
 }

 const activeAccount = accounts.find(a => a.id === selectedAccountId)

 return (
 <div className=flex h-full bg-[#0a0a0a] overflow-hidden>
 
 {/* LEFT PANE - Account List */}
 <div className={w-full md:w-80 flex-shrink-0 flex flex-col border-r border-white/10 }>
 <div className=p-4 border-b border-white/10>
 <h1 className=text-xl font-bold text-white mb-4>Messages</h1>
 <div className=relative>
 <FiSearch className=absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 />
 <input 
 type=text
 placeholder=Search accounts...
 className=w-full pl-9 pr-4 py-2 bg-neutral-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500
 />
 </div>
 </div>
 
 <div className=flex-1 overflow-y-auto>
 {loadingAccounts ? (
 <div className=p-8 text-center text-neutral-500 text-sm>Loading conversations...</div>
 ) : accounts.length === 0 ? (
 <div className=p-8 text-center text-neutral-500 text-sm>No messages yet.</div>
 ) : (
 accounts.map(account => {
 const lastMsg = account.smsMessages?.[0]
 return (
 <div 
 key={account.id}
 onClick={() => setSelectedAccountId(account.id)}
 className={p-4 border-b border-white/5 cursor-pointer hover:bg-neutral-800/50 transition-colors }
 >
 <div className=flex justify-between items-start mb-1>
 <h3 className=font-bold text-white text-sm truncate>{account.name}</h3>
 {lastMsg && (
 <span className=text-xs text-neutral-500 flex-shrink-0 ml-2>
 {new Date(lastMsg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
 </span>
 )}
 </div>
 {lastMsg && (
 <p className=text-xs text-neutral-400 truncate>
 {lastMsg.direction === 'OUTBOUND' ? 'You: ' : ''}{lastMsg.body}
 </p>
 )}
 </div>
 )
 })
 )}
 </div>
 </div>

 {/* RIGHT PANE - Chat View */}
 <div className={flex-1 flex flex-col min-w-0 }>
 {!selectedAccountId ? (
 <div className=flex-1 flex flex-col items-center justify-center text-neutral-500>
 <FiMessageSquare size={48} className=mb-4 opacity-20 />
 <p>Select a conversation to start messaging</p>
 </div>
 ) : (
 <>
 <div className=h-16 border-b border-white/10 flex items-center px-4 shrink-0 bg-[#0f1013]>
 <button 
 className=md:hidden p-2 mr-2 text-neutral-400 hover:text-white
 onClick={() => setSelectedAccountId(null)}
 >
 <FiArrowLeft size={20} />
 </button>
 <div className=w-8 h-8 rounded-full bg-emerald-900/30 text-emerald-500 flex items-center justify-center mr-3>
 <FiUser size={16} />
 </div>
 <div>
 <h2 className=text-white font-bold text-sm>{activeAccount?.name}</h2>
 <p className=text-neutral-500 text-xs>{activeAccount?.zohoId}</p>
 </div>
 </div>

 <div className=flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#0a0a0a]>
 {loadingMessages ? (
 <div className=text-center text-neutral-500 text-sm mt-8>Loading messages...</div>
 ) : messages.length === 0 ? (
 <div className=text-center text-neutral-500 text-sm mt-8>No messages found.</div>
 ) : (
 messages.map((msg, idx) => {
 const isMine = msg.direction === 'OUTBOUND'
 return (
 <div key={msg.id || idx} className={flex flex-col max-w-[80%] }>
 <div className={px-4 py-2.5 rounded-2xl text-sm }>
 {msg.body}
 </div>
 <span className=text-[10px] text-neutral-500 mt-1 px-1>
 {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>
 )
 })
 )}
 <div ref={messagesEndRef} />
 </div>

 {/* AI Suggestions Box */}
 {suggestions.length > 0 && (
 <div className=px-4 py-3 bg-neutral-900 border-t border-white/10>
 <div className=text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5>
 <FiZap /> AI Suggestions
 </div>
 <div className=flex flex-wrap gap-2>
 {suggestions.map((sug, i) => (
 <button
 key={i}
 onClick={() => setTextInput(sug)}
 className=px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-full border border-white/10 transition-colors text-left max-w-full truncate
 >
 {sug}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Input Box */}
 <div className=p-4 bg-[#0f1013] border-t border-white/10 flex items-end gap-2 shrink-0>
 <button 
 onClick={handleAiSuggest}
 disabled={suggesting || messages.length === 0}
 className=p-3 rounded-xl bg-neutral-800 text-emerald-400 hover:bg-neutral-700 transition-colors disabled:opacity-50 shrink-0
 title=AI Suggest Reply
 >
 {suggesting ? <div className=w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin /> : <FiZap size={20} />}
 </button>
 <textarea
 value={textInput}
 onChange={e => setTextInput(e.target.value)}
 placeholder=Type a message...
 className=flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none
 rows={1}
 onKeyDown={e => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault()
 handleSend()
 }
 }}
 />
 <button 
 onClick={handleSend}
 disabled={!textInput.trim() || sending}
 className=p-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 shrink-0
 >
 {sending ? <div className=w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin /> : <FiSend size={20} />}
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 )
}
