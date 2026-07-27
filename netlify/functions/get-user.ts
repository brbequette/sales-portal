import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const email = event.queryStringParameters?.email
  if (!email) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing email" })
    }
  }

  try {
    let user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "User not found" })
      }
    }

    // Auto-heal Ben and Monty's roles/names in the database
    const lowerEmail = user.email?.toLowerCase() || "";
    let needsUpdate = false;
    let updateData: any = {};

    if ((
      lowerEmail.includes("ben") || 
      lowerEmail.includes("monty") || 
      lowerEmail.includes("bequette") || 
      lowerEmail.includes("morgan")
    ) && user.role !== "Administrator") {
      updateData.role = "Administrator";
      needsUpdate = true;
    }

    if (lowerEmail === "ben@titandiamond.net" && user.name !== "Benjamin Bequette") {
      updateData.name = "Benjamin Bequette";
      needsUpdate = true;
    }

    if (needsUpdate) {
      console.log(`Auto-healing role/name for ${user.email}...`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        id: user.zohoId || user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || null
      })
    }
  } catch (error: any) {
    console.error("Error fetching user:", error)
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message })
    }
  }
}
