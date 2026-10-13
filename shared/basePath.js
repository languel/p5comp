export const basePath = (path = "") =>
  import.meta.env.BASE_URL + path.replace(/^\//, "");
