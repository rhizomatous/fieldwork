export const PROJECT_FILES = ["index.html", "style.css", "script.js"] as const;

export type ProjectFile = (typeof PROJECT_FILES)[number];
export type ProjectFiles = Record<ProjectFile, string>;
