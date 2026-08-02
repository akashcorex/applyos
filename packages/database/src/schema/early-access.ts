import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const earlyAccessEmail = pgTable('early_access_email', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
