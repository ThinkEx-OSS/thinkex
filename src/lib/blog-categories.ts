export const blogCategories = ["Product", "Guides", "Engineering", "Company"] as const;

export type BlogCategory = (typeof blogCategories)[number];
