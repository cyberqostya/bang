const assetModules = import.meta.glob("../assets/**/*", {
  eager: true,
  import: "default",
});

const assetUrlsByPath = Object.fromEntries(
  Object.entries(assetModules).map(([path, url]) => [
    path.replace(/^..\/assets/, ""),
    url,
  ]),
);

export function resolveAssetUrl(path = "") {
  if (!path) return "";
  if (/^(https?:)?\/\//.test(path)) return path;

  return assetUrlsByPath[path] || path;
}
