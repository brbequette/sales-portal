import { describe, expect, it } from "vitest"
import { readVoicePreview, signVoicePreview, validateVoiceLog, type VoicePreview } from "./voice-call-preview"

const id = "3437f313-1e67-4745-af19-f5f3013cc26f"
const log = { logid: id, start_time: "1790337110000", call_type: "incoming", caller_id_number: "+16028479868", destination_number: "+19282645832", duration: "01:25", hangup_cause_displayname: "Successful call" }
const evidence = validateVoiceLog({ status: "200", logs: [log] }, id)
const preview: VoicePreview = { actorId: "admin", accountId: "test", contactId: null, retellCallId: "call_test", taskId: "task", reason: "Human-confirmed test", evidence, transcript: "14 and 17 inch", previousUpdatedAt: null, expiresAt: 1000 }
describe("scoped Voice preview", () => {
  it("accepts the live single-call envelope only with the exact UUID and nested provider filename", () => {
    const call = { ...log, logid: undefined, uuid: id, call_recording: { recording_filename: `${id}_recording.mp3` } }
    expect(validateVoiceLog({ status: "SUCCESS", call_log: call }, id)).toMatchObject({ recordingFilename: `${id}_recording.mp3`, duration: 85 })
    expect(() => validateVoiceLog({ status: "SUCCESS", call_log: { ...call, uuid: "wrong" } }, id)).toThrow()
    expect(() => validateVoiceLog({ status: "ERROR", call_log: call }, id)).toThrow()
  })
  it("selects the exact call and retains provider endpoints without treating them as customer identity", () => {
    expect(evidence.duration).toBe(85)
    expect(evidence.fromNumber).toBe("+16028479868")
    expect(evidence.recordingFilename).toBeNull()
  })
  it("rejects absent, duplicate and provider-error records", () => {
    for (const data of [{ status: "200", logs: [] }, { status: "200", logs: [log, log] }, { status: "200", logs: [{ ...log, logid: "wrong" }] }, { status: "ERROR", logs: [log] }]) expect(() => validateVoiceLog(data, id)).toThrow()
  })
  it("rejects unknown direction, missing outcomes and invalid times", () => {
    for (const patch of [{ call_type: "forward" }, { hangup_cause_displayname: "" }, { start_time: "NaN" }, { duration: "01:99" }]) expect(() => validateVoiceLog({ status: "200", logs: [{ ...log, ...patch }] }, id)).toThrow()
  })
  it("does not convert a provider failure into success or guess a recording filename", () => {
    expect(validateVoiceLog({ status: "200", logs: [{ ...log, hangup_cause_displayname: "Cancelled", recording_filename: "../../secret" }] }, id)).toMatchObject({ status: "Cancelled", recordingFilename: null })
  })
  it("binds preview to actor, expiry and signed contents", () => {
    const token = signVoicePreview(preview, "test-secret")
    expect(readVoicePreview(token, "test-secret", "admin", 999)).toEqual(preview)
    expect(() => readVoicePreview(token, "test-secret", "another", 999)).toThrow()
    expect(() => readVoicePreview(token, "test-secret", "admin", 1000)).toThrow()
    expect(() => readVoicePreview(token, "wrong-secret", "admin", 999)).toThrow()
    expect(() => readVoicePreview(token + ".extra", "test-secret", "admin", 999)).toThrow()
  })
})
