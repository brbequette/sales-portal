import { redirect } from "next/navigation"

export default function LegacyGeofencesPage() {
  redirect("/admin/timeclock?tab=geofences")
}
