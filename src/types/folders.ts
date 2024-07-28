import { z } from 'zod';

export const FolderNameSchema = z.string().brand<'FolderName'>();
export type FolderName = z.infer<typeof FolderNameSchema>;

export const FolderSchema = z.object({
  title: FolderNameSchema,
  parentTitle: FolderNameSchema.nullable(),
  description: z.string().nullable(),
  date: z.string().nullable(),
  order: z.number()
});
export type Folder = z.infer<typeof FolderSchema>;
