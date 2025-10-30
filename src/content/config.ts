import { defineCollection, z } from 'astro:content';

const projectsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    status: z.enum(['fundraising', 'in-progress', 'completed']),
    shortDescription: z.string(),
    location: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    funding: z.object({
      goal: z.number(),
      currency: z.string().default('USD'),
    }),
    installationDetails: z.string().optional(),
    order: z.number().default(0),
  }),
});

export const collections = {
  projects: projectsCollection,
};
