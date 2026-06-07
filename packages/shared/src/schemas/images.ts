import { z } from 'zod';

export const processImageSchema = z.object({
  image: z.string().min(1),
});
