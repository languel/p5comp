let clangReady;
export async function formatCode(source, language) {
  if (language === "cpp") {
    const clang = await import("@wasm-fmt/clang-format/vite");
    clangReady ||= clang.default();
    await clangReady;
    return clang.format(
      source,
      "sketch.cpp",
      JSON.stringify({ BasedOnStyle: "LLVM", IndentWidth: 2, ColumnLimit: 88 }),
    );
  }
  const prettier = await import("prettier/standalone");
  const plugins = await Promise.all([
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/html"),
    import("prettier/plugins/postcss"),
  ]);
  return prettier.format(source, {
    parser: language === "html" ? "html" : language === "css" ? "css" : "babel",
    plugins: plugins.map((p) => p.default || p),
    tabWidth: 2,
    printWidth: 88,
  });
}
