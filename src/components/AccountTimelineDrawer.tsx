import React, { useEffect, useState } from "react";
import { FiPhone, FiMail, FiFileText, FiDollarSign, FiMessageSquare, FiX, FiCheckCircle } from "react-icons/fi";

type TimelineEvent = {
  id: string;
  eventType: string;
  sourceType: string;
  subject: string | null;
  summary: string | null;
  occurredAt: string;
  channel: string;
  metadata?: any;
};

type Props = {
  accountId: string;
  onClose: () => void;
};

export function AccountTimelineDrawer({ accountId, onClose }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);
        const res = await fetch(`/api/communications/timeline/${accountId}?limit=50`);
        const data = await res.json();
        if (data.success && data.events) {
          setEvents(data.events);
        }
      } catch (err) {
        console.error("Failed to fetch timeline", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, [accountId]);

  const getIcon = (eventType: string, channel: string, sourceType: string) => {
    if (channel === "CALL" || eventType === "CALL_RECORDED") return <FiPhone className="text-blue-500" />;
    if (channel === "EMAIL" || eventType === "EMAIL_RECORDED") return <FiMail className="text-purple-500" />;
    if (channel === "SMS" || eventType === "MESSAGE_RECORDED") return <FiMessageSquare className="text-green-500" />;
    if (sourceType === "Invoice" || sourceType === "Deal" || sourceType === "SalesOrder") return <FiDollarSign className="text-yellow-600" />;
    if (channel === "NOTE" || eventType === "NOTE_ADDED") return <FiFileText className="text-gray-500" />;
    return <FiCheckCircle className="text-gray-400" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 transition-opacity backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Activity Feed</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <FiX className="text-gray-600" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {loading ? (
            <div className="flex justify-center items-center h-32 text-gray-500">Loading timeline...</div>
          ) : events.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No activity found.</div>
          ) : (
            <div className="relative border-l-2 border-gray-100 ml-3 space-y-6">
              {events.map((ev) => (
                <div key={ev.id} className="relative pl-6">
                  <div className="absolute -left-[17px] top-1 bg-white p-1 rounded-full border border-gray-100 shadow-sm">
                    {getIcon(ev.eventType, ev.channel, ev.sourceType)}
                  </div>
                  <div className="bg-white border border-gray-100 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-gray-800">{ev.subject || ev.eventType.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {new Date(ev.occurredAt).toLocaleDateString()} {new Date(ev.occurredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    {ev.summary && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{ev.summary}</p>}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{ev.sourceType}</span>
                      {ev.metadata?.status && (
                        <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{ev.metadata.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
