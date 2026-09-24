import type { IconName } from "@/components/ui/Icon";

export type FeatureGroup = "List faster" | "Cut shipping cost";

export type Feature = {
  id: string;
  title: string;
  body: string;
  group: FeatureGroup;
  icon: IconName;
};

export const features: Feature[] = [
  {
    id: "autofill",
    title: "One-click autofill",
    body: "Save a template once, then autofill any catalog inside your supplier panel — instantly, field by field.",
    group: "List faster",
    icon: "bolt",
  },
  {
    id: "templates",
    title: "Templates & variants",
    body: "Reuse one listing across sizes and colours. Only the size, colour or price changes — the rest stays.",
    group: "List faster",
    icon: "template",
  },
  {
    id: "mapping",
    title: "Smart field mapping",
    body: "Category, HSN, GST and fabric are matched and filled for you — correctly, every time.",
    group: "List faster",
    icon: "mapping",
  },
  {
    id: "bulk",
    title: "Bulk CSV upload",
    body: "Match a CSV to a template and list hundreds of catalogs in one sitting. Then review them all as drafts.",
    group: "List faster",
    icon: "bulk",
  },
  {
    id: "images",
    title: "Reusable image library",
    body: "Store your product photos once, auto-resized to the exact listing spec. Drop them into any catalog.",
    group: "List faster",
    icon: "image",
  },
  {
    id: "draft",
    title: "Draft & review",
    body: "Nothing publishes on its own. Every listing lands as a draft for you to check first.",
    group: "List faster",
    icon: "draft",
  },
  {
    id: "shipgen",
    title: "Low-shipping image generator",
    body: "Generate clean, spec-correct product images tuned to keep your shipping band — and cost per order — low.",
    group: "Cut shipping cost",
    icon: "shipImage",
  },
];
