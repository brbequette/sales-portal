import { schedule } from "@netlify/functions"
import { generateOperationalTasks } from "../../src/lib/operational-automation"

export const handler = schedule("*/15 * * * *", async () => ({ statusCode: 200, body: JSON.stringify(await generateOperationalTasks({ apply: true })) }))
