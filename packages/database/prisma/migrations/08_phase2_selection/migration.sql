CREATE TABLE "job_selections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_selections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_selection_items" (
    "id" TEXT NOT NULL,
    "selection_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "rank_position" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,

    CONSTRAINT "job_selection_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_job_selections_user_created_at"
ON "job_selections"("user_id", "created_at");

CREATE UNIQUE INDEX "uq_job_selection_items_selection_job"
ON "job_selection_items"("selection_id", "job_id");

CREATE INDEX "idx_job_selection_items_job_id"
ON "job_selection_items"("job_id");

ALTER TABLE "job_selections"
ADD CONSTRAINT "job_selections_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_selection_items"
ADD CONSTRAINT "job_selection_items_selection_id_fkey"
FOREIGN KEY ("selection_id") REFERENCES "job_selections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_selection_items"
ADD CONSTRAINT "job_selection_items_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
