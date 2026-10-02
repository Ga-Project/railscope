import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site.mjs";

// static export でも sitemap.xml をビルド時に書き出す。
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("rules/"), changeFrequency: "monthly", priority: 0.8 },
  ];
}
