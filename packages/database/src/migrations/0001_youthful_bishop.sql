CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location" text,
	"summary" text,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_role" text,
	"preferred_locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"raw_text" text,
	"file_name" text,
	"file_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resumes_user_id" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_resumes_skills" ON "resumes" USING gin ("skills");