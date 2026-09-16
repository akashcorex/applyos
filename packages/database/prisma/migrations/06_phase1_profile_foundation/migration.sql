-- Phase 1 canonical Profile fields and soft-delete support.

ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS "preferredRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "preferredLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "workMode" TEXT,
ADD COLUMN IF NOT EXISTS "seniority" TEXT,
ADD COLUMN IF NOT EXISTS "totalExperienceYears" INTEGER;

ALTER TABLE "resume_files"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "profiles" p
SET "sourceResumeFileId" = NULL
WHERE "sourceResumeFileId" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "resume_files" rf
      WHERE rf."id" = p."sourceResumeFileId"
  );

WITH latest_resume AS (
    SELECT DISTINCT ON (rf."userId")
        rf."userId",
        rf."id" AS "resumeFileId",
        r."experience_years" AS "experienceYears",
        r."preferred_role" AS "preferredRole",
        r."preferred_locations" AS "preferredLocations"
    FROM "resume_files" rf
    JOIN "resumes" r ON r."id" = rf."resumeId"
    WHERE rf."deletedAt" IS NULL
    ORDER BY rf."userId", rf."createdAt" DESC
)
UPDATE "profiles" p
SET
    "preferredRoles" = CASE
        WHEN cardinality(p."preferredRoles") > 0 THEN p."preferredRoles"
        WHEN NULLIF(btrim(latest."preferredRole"), '') IS NULL THEN ARRAY[]::TEXT[]
        ELSE ARRAY[latest."preferredRole"]
    END,
    "preferredLocations" = CASE
        WHEN cardinality(p."preferredLocations") > 0 THEN p."preferredLocations"
        ELSE COALESCE(latest."preferredLocations", ARRAY[]::TEXT[])
    END,
    "totalExperienceYears" = COALESCE(
        p."totalExperienceYears",
        latest."experienceYears"
    ),
    "sourceResumeFileId" = COALESCE(
        p."sourceResumeFileId",
        latest."resumeFileId"
    )
FROM latest_resume latest
WHERE p."userId" = latest."userId";

CREATE INDEX IF NOT EXISTS "resume_files_deletedAt_idx"
ON "resume_files"("deletedAt");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_sourceResumeFileId_fkey'
    ) THEN
        ALTER TABLE "profiles"
        ADD CONSTRAINT "profiles_sourceResumeFileId_fkey"
        FOREIGN KEY ("sourceResumeFileId") REFERENCES "resume_files"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
