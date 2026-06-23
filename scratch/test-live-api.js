async function main() {
  const res = await fetch("https://sales-portal.netlify.app/api/get-commissions?repId=cmppb6nye01oi13bxf3r9bv8j")
  const data = await res.json()
  if (data.success) {
    const rep = data.byRep['cmppb6nye01oi13bxf3r9bv8j']
    if (rep) {
      console.log("Bonuses found:", rep.invoices.filter(i => i.id.startsWith('bonus')))
      console.log("Total earned:", rep.totalEarned)
      console.log("Balance:", rep.balance)
    } else {
      console.log("Rep not found in API")
    }
  } else {
    console.log("API error:", data)
  }
}
main()
