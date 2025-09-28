import { z } from 'zod';

export const visibilityEnum = z.enum(['public', 'private']);

export const uploadUrlInput = z.object({
  folderId: z.string().min(1),
  folderName: z.string().min(1),
  visibility: visibilityEnum,
  fileName: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const ingestInput = z.object({
  fileId: z.string().min(1),
});

export const chatInput = z.object({
  question: z.string().min(1, 'Question is required'),
});

export const listFilesQuery = z.object({
  folder_id: z.string().optional(),
  visibility: visibilityEnum.optional(),
});
