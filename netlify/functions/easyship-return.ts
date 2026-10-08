import { withFunctionAuth } from "./lib/auth-middleware"
import { returnHandler } from "../../src/lib/invoice-return-service"
export const handler = withFunctionAuth(returnHandler)
