"use client"

import { useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { FiUser, FiMail, FiPhone, FiSmartphone, FiPlus, FiMessageSquare, FiCheck, FiFileText } from "react-icons/fi"

interface Contact {
  id: string
  zohoId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  mobilePhone: string | null
  isPrimary: boolean
}

interface Note {
  id: string
  content: string
  createdAt: string
  author?: {
    name: string | null
  } | null
}

interface ContactsViewProps {
  contacts: Contact[]
  notes: Note[]
  accountId: string
  onNoteAdded: (note: any) => void
}

export function ContactsView({ contacts = [], notes = [], accountId, onNoteAdded }: ContactsViewProps) {
  const { zohoContext: currentUser } = useZoho()
  const [selectedContactId, setSelectedContactId] = useState<string | null>("general")
  const [newNoteText, setNewNoteText] = useState("")
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [showNoteFormId, setShowNoteFormId] = useState<string | null>(null)

  const getContactNotes = (contact: Contact) => {
    const firstName = contact.firstName || ""
    const lastName = contact.lastName || ""
    const fullName = `${firstName} ${lastName}`.trim().toLowerCase()
    if (!fullName) return []

    return notes.filter(n => {
      if (!n.content) return false
      const contentLower = n.content.toLowerCase()
      return contentLower.includes(fullName) ||
             contentLower.includes(`[contact note: ${fullName}]`) ||
             (firstName && contentLower.includes(firstName.toLowerCase()) && lastName && contentLower.includes(lastName.toLowerCase()))
    })
  }

  const handleAddNote = async (contact: Contact | null) => {
    if (!newNoteText.trim()) return

    const key = contact ? contact.id : "general"
    setSavingNoteId(key)
    try {
      let formattedContent = newNoteText.trim()
      if (contact) {
        const fullName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim()
        formattedContent = `[Contact Note: ${fullName}] ${newNoteText.trim()}`
      }

      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_SMS', // Using SMS action to write a communication log note
          accountId,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          noteContent: formattedContent,
          sentiment: 'Neutral'
        })
      })

      const data = await response.json()
      if (data.success && data.note) {
        onNoteAdded(data.note)
        setNewNoteText("")
        setShowNoteFormId(null)
      } else {
        alert("Failed to save note. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("An error occurred while saving the note.")
    } finally {
      setSavingNoteId(null)
    }
  }

  const selectedContact = selectedContactId === "general" ? null : (contacts.find(c => c.id === selectedContactId) || null)
  const contactNotes = selectedContact ? getContactNotes(selectedContact) : notes

  const getNoteDisplay = (content: string) => {
    if (!content) return { tag: null, text: "" }
    const match = content.match(/^\[Contact Note:\s*([^\]]+)\]\s*(.*)/i)
    if (match) {
      return {
        tag: `Contact Note: ${match[1]}`,
        text: match[2]
      }
    }
    return {
      tag: null,
      text: content
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center mb-4">
        <FiUser className="mr-2 text-emerald-500" /> Contacts & Notes
      </h3>

      {/* Grid Layout: Left list of contacts, Right contact details and notes */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        
        {/* Contact List Sidebar */}
        <div className="md:col-span-2 space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
          {/* General Notes Row at the top */}
          <button
            onClick={() => {
              setSelectedContactId("general")
              setShowNoteFormId(null)
              setNewNoteText("")
            }}
            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
              selectedContactId === "general"
                ? "bg-neutral-800 border-emerald-500/40 shadow-lg"
                : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
            }`}
          >
            <div className="p-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/20">
              <FiFileText className="text-emerald-400" size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">General Account Notes</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{notes.length} log entries</p>
            </div>
          </button>

          {/* Section Divider */}
          <div className="pt-2 pb-1 px-1 border-t border-neutral-800">
            <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-500">Contacts</span>
          </div>

          {contacts.length === 0 ? (
            <div className="text-[10px] text-neutral-500 italic p-3 text-center">No contacts on record</div>
          ) : (
            contacts.map(c => {
              const isSelected = c.id === selectedContactId
              const isPrimary = c.isPrimary
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedContactId(c.id)
                    setShowNoteFormId(null)
                    setNewNoteText("")
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-neutral-800 border-emerald-500/40 shadow-lg"
                      : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="text-xs font-bold text-white truncate">
                      {c.firstName || ""} {c.lastName || "Contact"}
                    </span>
                    {isPrimary && (
                      <span className="text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                        Primary
                      </span>
                    )}
                  </div>
                  {c.email && (
                    <span className="text-[10px] text-neutral-400 truncate w-full flex items-center gap-1">
                      <FiMail className="shrink-0 text-neutral-500" size={10} />
                      {c.email}
                    </span>
                  )}
                  {(c.phone || c.mobilePhone) && (
                    <span className="text-[10px] text-neutral-400 truncate w-full flex items-center gap-1">
                      <FiPhone className="shrink-0 text-neutral-500" size={10} />
                      {c.phone || c.mobilePhone}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Selected Contact Details and Notes panel */}
        <div className="md:col-span-3 bg-neutral-900/30 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between space-y-5 min-h-[350px]">
          {selectedContactId === "general" ? (
            <>
              {/* General Account Notes View */}
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      General Account Notes
                    </h4>
                    <p className="text-neutral-500 text-xs mt-0.5">
                      Combined history of all notes and communication logs
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNoteFormId(showNoteFormId === "general" ? null : "general")}
                    className="flex items-center gap-1 bg-neutral-805 hover:bg-neutral-705 text-white font-bold px-2.5 py-1.5 rounded-lg text-[10px] border border-neutral-700 transition-colors cursor-pointer"
                  >
                    <FiPlus /> Note
                  </button>
                </div>

                {/* Note input expand block */}
                {showNoteFormId === "general" && (
                  <div className="bg-neutral-950/65 border border-neutral-850 p-3 rounded-xl space-y-2.5 animate-fadeIn">
                    <textarea
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      placeholder="Write a general note or log a communication..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 resize-none h-18"
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button
                        onClick={() => {
                          setShowNoteFormId(null)
                          setNewNoteText("")
                        }}
                        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAddNote(null)}
                        disabled={savingNoteId === "general" || !newNoteText.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        {savingNoteId === "general" ? "Saving..." : "Save Note"}
                      </button>
                    </div>
                  </div>
                )}

                {/* General Notes List */}
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin">
                  {contactNotes.length === 0 ? (
                    <p className="text-neutral-500 text-xs italic py-4 text-center">No logged notes for this account.</p>
                  ) : (
                    contactNotes.map(note => {
                      const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString() : "—"
                      const display = getNoteDisplay(note.content)
                      
                      return (
                        <div key={note.id} className="p-3 bg-neutral-950/30 border border-neutral-850 rounded-xl space-y-1.5">
                          <div className="flex justify-between items-center text-[9px] text-neutral-500">
                            <span className="font-bold text-neutral-400 flex items-center gap-1.5">
                              <span>{note.author?.name || "System Log"}</span>
                              {display.tag && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                  {display.tag}
                                </span>
                              )}
                            </span>
                            <span>{date}</span>
                          </div>
                          <p className="text-xs text-neutral-300 leading-relaxed font-sans">{display.text}</p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          ) : selectedContact ? (
            <>
              {/* Header Info */}
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      {selectedContact.firstName || ""} {selectedContact.lastName || ""}
                    </h4>
                    {selectedContact.isPrimary && (
                      <span className="text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full inline-block mt-1.5">
                        Primary Account Representative
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setShowNoteFormId(showNoteFormId === selectedContact.id ? null : selectedContact.id)}
                    className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-[10px] border border-neutral-700 transition-colors cursor-pointer"
                  >
                    <FiPlus /> Note
                  </button>
                </div>

                {/* Contact Data Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950/40 p-4 rounded-xl border border-neutral-800/80">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Email Address</span>
                    {selectedContact.email ? (
                      <a href={`mailto:${selectedContact.email}`} className="text-xs text-blue-400 hover:underline break-all block">
                        {selectedContact.email}
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-600 block">Not specified</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Office Phone</span>
                    {selectedContact.phone ? (
                      <a href={`tel:${selectedContact.phone}`} className="text-xs text-neutral-350 hover:underline block">
                        {selectedContact.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-600 block">Not specified</span>
                    )}
                  </div>
                  <div className="space-y-0.5 sm:col-span-2">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Mobile Phone</span>
                    {selectedContact.mobilePhone ? (
                      <a href={`tel:${selectedContact.mobilePhone}`} className="text-xs text-neutral-350 hover:underline block">
                        {selectedContact.mobilePhone}
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-600 block">Not specified</span>
                    )}
                  </div>
                </div>

                {/* Contact Specific Notes */}
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Contact Notes History</span>
                  
                  {/* Note input expand block */}
                  {showNoteFormId === selectedContact.id && (
                    <div className="bg-neutral-950/65 border border-neutral-850 p-3 rounded-xl space-y-2.5 animate-fadeIn">
                      <textarea
                        value={newNoteText}
                        onChange={e => setNewNoteText(e.target.value)}
                        placeholder={`Write notes regarding ${selectedContact.firstName}...`}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 resize-none h-18"
                      />
                      <div className="flex justify-end gap-2 text-[10px]">
                        <button
                          onClick={() => {
                            setShowNoteFormId(null)
                            setNewNoteText("")
                          }}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddNote(selectedContact)}
                          disabled={savingNoteId === selectedContact.id || !newNoteText.trim()}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                        >
                          {savingNoteId === selectedContact.id ? "Saving..." : "Save Note"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                    {contactNotes.length === 0 ? (
                      <p className="text-neutral-500 text-xs italic py-4 text-center">No logged notes for this contact.</p>
                    ) : (
                      contactNotes.map(note => {
                        const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString() : "—"
                        const display = getNoteDisplay(note.content)
                        
                        return (
                          <div key={note.id} className="p-3 bg-neutral-950/30 border border-neutral-850 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] text-neutral-500">
                              <span className="font-bold text-neutral-400">
                                {note.author?.name || "System Log"}
                              </span>
                              <span>{date}</span>
                            </div>
                            <p className="text-xs text-neutral-300 leading-relaxed font-sans">{display.text}</p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500 italic text-xs">
              Select a contact to view notes and information
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
