// src/logger.ts
import { mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import pino from "pino";

// src/config/env/server.ts
import { z as z2 } from "zod";

// src/config/config.ts
import { z } from "zod";
function loadEnv(schema2) {
  try {
    return schema2.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const testResult = schema2.safeParse(void 0);
      if (testResult.success) {
        return testResult.data;
      }
      if (!error.issues || !Array.isArray(error.issues)) {
        throw new Error("Environment variable validation failed (no error details available)");
      }
      const errorMessages = error.issues.map((err) => ` - ${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(`Environment variable validation failed: 
${errorMessages}`);
    }
    throw error;
  }
}

// src/config/env/server.ts
var schema = z2.object({
  NODE_ENV: z2.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z2.enum(["debug", "info", "warn", "error"]).default("info")
});
var serverConfig = loadEnv(schema);

// src/logger.ts
var LOG_FILE = join(homedir(), ".shipyard", "server-debug.log");
try {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
} catch {
}
var streams = [
  { stream: pino.destination(2) },
  // stderr - CRITICAL: MCP uses stdout for protocol
  { stream: pino.destination(LOG_FILE) }
  // file for debugging
];
var logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime
  },
  pino.multistream(streams)
);

export {
  loadEnv,
  logger
};
