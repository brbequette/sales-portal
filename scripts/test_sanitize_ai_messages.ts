import { sanitizeMessagesForAI } from "../src/lib/ai-client"

function runSanitizeTests() {
  console.log("▶ Testing sanitizeMessagesForAI...")

  // Test 1: Empty messages
  const empty = sanitizeMessagesForAI([])
  if (empty.length !== 0) throw new Error("Expected empty array")

  // Test 2: Ends with user
  const endsWithUser = [
    { role: "system", content: "You are an assistant." },
    { role: "assistant", content: "Hello!" },
    { role: "user", content: "How are you?" }
  ]
  const res1 = sanitizeMessagesForAI(endsWithUser)
  if (res1.length !== 3 || res1[res1.length - 1].role !== "user") {
    throw new Error("Expected 3 messages ending with user")
  }

  // Test 3: Ends with assistant (e.g. from SMS thread ending with outbound message)
  const endsWithAssistant = [
    { role: "system", content: "You are an assistant." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Here is your invoice." }
  ]
  const res2 = sanitizeMessagesForAI(endsWithAssistant)
  if (res2.length !== 4) {
    throw new Error(`Expected 4 messages, got ${res2.length}`)
  }
  if (res2[res2.length - 1].role !== "user") {
    throw new Error(`Expected last message to be user, got ${res2[res2.length - 1].role}`)
  }

  // Test 4: Ends with model
  const endsWithModel = [
    { role: "user", content: "Hi" },
    { role: "model", content: "Hello" }
  ]
  const res3 = sanitizeMessagesForAI(endsWithModel)
  if (res3.length !== 3 || res3[res3.length - 1].role !== "user") {
    throw new Error("Expected message ending with user")
  }

  console.log("🎉 All sanitizeMessagesForAI tests passed!")
}

runSanitizeTests()
