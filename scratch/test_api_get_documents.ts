import { GET } from "../src/app/api/get-documents/route"

async function main() {
  const req = new Request("http://localhost:3000/api/get-documents?pageSize=1000&type=All")
  const res = await GET(req)
  const data = await res.json()
  console.log("Status:", res.status)
  if (data.error) {
    console.error("API Error:", data.error)
    return
  }
  console.log("Total Documents returned:", data.documents?.length)
  if (data.documents && data.documents.length > 0) {
    console.log("Sample Document:", JSON.stringify(data.documents[0], null, 2))
  }
}

main().catch(console.error)
