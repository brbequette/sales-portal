import React from "react"
import { PrismaClient } from "@prisma/client"
import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"

const prisma = new PrismaClient()

export default async function CommunicationsDashboard() {
  const session = await getServerSession()
  if (!session?.user?.email) {
    redirect("/")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  // Ensure only admins can see this
  if (user?.role !== "ADMIN") {
    redirect("/")
  }

  // Fetch recent call logs
  const callLogs = await prisma.callLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      account: { select: { name: true } },
      author: { select: { name: true, email: true } }
    }
  })

  // Fetch recent SMS messages
  const smsLogs = await prisma.smsMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      account: { select: { name: true } },
      author: { select: { name: true, email: true } }
    }
  })

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Communications Dashboard</h1>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Call Logs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent Call Logs</h2>
            <p className="text-sm text-slate-500">Tracked via Zoho Voice Softphone</p>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100/50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Agent</th>
                  <th className="px-6 py-3 font-medium">Account</th>
                  <th className="px-6 py-3 font-medium">Direction</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {callLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{log.author?.name || log.author?.email}</td>
                    <td className="px-6 py-4 text-blue-600 font-medium">{log.account?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.direction === 'INBOUND' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{Math.floor(log.duration / 60)}m {log.duration % 60}s</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-xs" title={log.notes || ''}>
                      {log.notes || '-'}
                    </td>
                  </tr>
                ))}
                {callLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No call logs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SMS Logs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent SMS Logs</h2>
            <p className="text-sm text-slate-500">Tracked via Zoho Voice SMS</p>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100/50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Agent</th>
                  <th className="px-6 py-3 font-medium">Account</th>
                  <th className="px-6 py-3 font-medium">Direction</th>
                  <th className="px-6 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {smsLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{log.author?.name || log.author?.email || 'System'}</td>
                    <td className="px-6 py-4 text-blue-600 font-medium">{log.account?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.direction === 'INBOUND' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-xs" title={log.body}>
                      {log.body}
                    </td>
                  </tr>
                ))}
                {smsLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No SMS logs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
