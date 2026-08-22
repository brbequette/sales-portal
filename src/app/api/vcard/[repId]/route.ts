import { prisma } from "@/lib/prisma"
import { COMPANY_CONFIG } from "@/lib/company-config"

export async function GET(req: Request, context: { params: Promise<{ repId: string }> }) {
  try {
    const params = await context.params
    const repId = params.repId
    const url = new URL(req.url)

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: repId },
          { email: repId },
          { zohoId: repId }
        ]
      }
    })

    // Allow query params override or fallback to user DB fields
    const queryName = url.searchParams.get("name")
    const queryTitle = url.searchParams.get("title")
    const queryPhone = url.searchParams.get("phone")
    const queryEmail = url.searchParams.get("email")
    const queryCompany = url.searchParams.get("company")
    const queryWebsite = url.searchParams.get("website")
    const queryPhotoUrl = url.searchParams.get("photoUrl")

    const fullName = queryName || user?.name || "Titan Diamond Representative"
    const nameParts = fullName.trim().split(/\s+/)
    const firstName = nameParts[0] || "Rep"
    const lastName = nameParts.slice(1).join(" ") || "Titan"
    const email = queryEmail || user?.email || ""
    const phone = queryPhone || user?.phone || "(480) 470-2577"
    const title = queryTitle || user?.title || "Sales Representative"
    const company = queryCompany || (user as any)?.vcardCompany || COMPANY_CONFIG.name
    const website = queryWebsite || (user as any)?.vcardWebsite || "https://tdusales.com"
    const photoUrl = queryPhotoUrl || (user as any)?.vcardPhotoUrl || ""

    const vCardLines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${fullName}`,
      `N:${lastName};${firstName};;;`,
      `ORG:${company}`,
      `TITLE:${title}`,
      `TEL;TYPE=CELL,VOICE:${phone}`,
      `EMAIL;TYPE=INTERNET:${email}`,
      `URL:${website}`
    ]

    if (photoUrl) {
      if (photoUrl.startsWith("data:image/")) {
        const parts = photoUrl.split(",")
        const mimeMatch = photoUrl.match(/data:image\/(.*?);/)
        const type = mimeMatch ? mimeMatch[1].toUpperCase() : "JPEG"
        const base64Data = parts[1] || ""
        if (base64Data) {
          vCardLines.push(`PHOTO;ENCODING=b;TYPE=${type}:${base64Data}`)
        }
      } else {
        vCardLines.push(`PHOTO;VALUE=URI:${photoUrl}`)
      }
    }

    vCardLines.push("END:VCARD")

    const vCardContent = vCardLines.join("\r\n")
    const safeName = fullName.replace(/[^a-zA-Z0-9]/g, "_")

    return new Response(vCardContent, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_Titan_Diamond.vcf"`,
        "Cache-Control": "no-store"
      }
    })
  } catch (error: any) {
    return new Response(`Error generating vCard: ${error.message}`, { status: 500 })
  }
}
