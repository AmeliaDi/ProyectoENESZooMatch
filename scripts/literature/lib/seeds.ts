import { readFileSync } from "node:fs";

import { z } from "zod";

const topic = z.string().min(1);

export const seedsSchema = z.object({
  maxRecords: z.number().int().positive(),
  namedStudies: z.array(z.object({ label: z.string(), author: z.string().min(2), query: z.string().min(10), year: z.number().int(), topic })),
  topicSearches: z.array(z.object({ topic, query: z.string().min(3), limit: z.number().int().positive() })),
  openAccessSearches: z.array(z.object({ topic, query: z.string().min(3), limit: z.number().int().positive() })),
  preprintSearches: z.array(z.object({ topic, titleWord: z.string().min(3), limit: z.number().int().positive() })),
  arxivSearches: z.array(z.object({ topic, query: z.string().min(3), limit: z.number().int().positive() })),
  licensePages: z.array(z.object({ topic, url: z.string().url() })),
  licenseSearches: z.array(z.object({ topic, query: z.string().min(3), includeDomains: z.array(z.string()) })),
  licenseKeywords: z.string().min(3),
});

export type Seeds = z.infer<typeof seedsSchema>;

export function loadSeeds(path: string): Seeds {
  return seedsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
