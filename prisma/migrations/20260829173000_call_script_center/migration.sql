ALTER TABLE "CallScript"
  ADD COLUMN "department" TEXT NOT NULL DEFAULT 'SALES',
  ADD COLUMN "scenario" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "objective" TEXT,
  ADD COLUMN "discoveryPrompts" JSONB,
  ADD COLUMN "objectionResponses" JSONB,
  ADD COLUMN "closingPrompt" TEXT,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "CallScript_department_scenario_isActive_idx"
  ON "CallScript"("department", "scenario", "isActive");
