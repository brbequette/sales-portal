import { describe, expect, it } from "vitest"
import { transcriptText } from "./voice-transcript"

describe("Zoho Voice transcript extraction", () => {
  it("extracts documented serialized transcriptJson without analysis JSON", () => {
    expect(transcriptText({ code: "200", status: "SUCCESS", transcribeObj: JSON.stringify({
      callAnalytics: [{ feature: "summary", result: "Not verbatim evidence" }],
      transcriptJson: [{ start_time: 3, speaker: 1, transcript: "A pack of 14 inch blades." }, { start_time: 7, speaker: 2, transcript: "17 inch blades on grinder." }],
    }) })).toBe("A pack of 14 inch blades.\n17 inch blades on grinder.")
  })
  it("preserves uncertainty instead of substituting a product", () => {
    expect(transcriptText({ transcript: [{ text: "buy some PL" }] })).toBe("buy some PL")
  })
  it("supports existing object wrappers and plain strings", () => {
    expect(transcriptText({ transcription: { segments: ["hello", { text: "world" }] } })).toBe("hello\nworld")
  })
  it("does not turn empty transcript analysis or malformed JSON into text", () => {
    expect(transcriptText({ transcribeObj: '{"callAnalytics":[{"result":"summary"}],"transcriptJson":[]}' })).toBe("")
    expect(transcriptText({ transcribeObj: '{"transcriptJson":' })).toBe("")
    expect(transcriptText({ status: "ERROR", transcript: "denied" })).toBe("")
  })
  it("bounds nested input", () => {
    let payload: unknown = "hello"
    for (let i = 0; i < 20; i++) payload = { data: payload }
    expect(transcriptText(payload)).toBe("")
  })
})
