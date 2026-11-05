import { validateDiagram } from "./circuit.js";
export function validateProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project))
    throw new Error("Project must be a JSON object.");
  validateDiagram(project.diagram || project);
  if (project.arduino != null && typeof project.arduino !== "string")
    throw new Error("Arduino source must be text.");
  if (
    project.p5 != null &&
    (typeof project.p5 !== "object" ||
      Array.isArray(project.p5) ||
      Object.values(project.p5).some((s) => typeof s !== "string"))
  )
    throw new Error("p5 sketches must contain text sources.");
  const w = project.workbench;
  if (w != null && (typeof w !== "object" || Array.isArray(w)))
    throw new Error("Project workspace must be an object.");
  if (
    w?.files != null &&
    (typeof w.files !== "object" ||
      Array.isArray(w.files) ||
      Object.values(w.files).some((s) => typeof s !== "string"))
  )
    throw new Error("Project files must contain text sources.");
  return project;
}
