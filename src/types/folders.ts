import { z } from 'zod';

export const FolderNameSchema = z.string().brand<'FolderName'>();
export type FolderName = z.infer<typeof FolderNameSchema>;

export const FolderSchema = z.object({
  title: FolderNameSchema,
  parent_title: FolderNameSchema,
  description: z.string().nullable(),
  date: z.string().nullable(),
  lat: z.number(),
  order: z.number()
});
export type Folder = z.infer<typeof FolderSchema>;
