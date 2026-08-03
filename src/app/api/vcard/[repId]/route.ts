import { prisma } from "@/lib/prisma"

export async function GET(req: Request, context: { params: Promise<{ repId: string }> }) {
  try {
    const params = await context.params
    const repId = params.repId

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: repId },
          { email: repId },
          { zohoId: repId }
        ]
      }
    })

    if (!user) {
      return new Response("Rep not found", { status: 404 })
    }

    const fullName = user.name || "Titan Diamond Representative"
    const nameParts = fullName.trim().split(/\s+/)
    const firstName = nameParts[0] || "Rep"
    const lastName = nameParts.slice(1).join(" ") || "Titan"
    const email = user.email || ""
    const phone = user.phone || "(800) 555-0199"
    const title = user.title || "Sales Representative"
    const company = "Titan Diamond USA"
    const website = "https://tdusales.com"

    const vCardContent = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${fullName}`,
      `N:${lastName};${firstName};;;`,
      `ORG:${company}`,
      `TITLE:${title}`,
      `TEL;TYPE=CELL,VOICE:${phone}`,
      `EMAIL;TYPE=INTERNET:${email}`,
      `URL:${website}`,
      "END:VCARD"
    ].join("\r\n")

    const safeName = fullName.replace(/[^a-zA-Z0-9]/g, "_")

    return new Response(vCardContent, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_Titan_Diamond.vcf"`,
        "Cache-Control": "public, max-age=86400"
      }
    })
  } catch (error: any) {
    return new Response(`Error generating vCard: ${error.message}`, { status: 500 })
  }
}
