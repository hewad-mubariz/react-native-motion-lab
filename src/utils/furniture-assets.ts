import { Asset } from "expo-asset";

const assetUriCache = new Map<number, Promise<string>>();

export const resolveFurnitureModelUri = (model: number): Promise<string> => {
  const cached = assetUriCache.get(model);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const asset = Asset.fromModule(model);
    await asset.downloadAsync();
    return asset.localUri ?? asset.uri;
  })().catch((error) => {
    assetUriCache.delete(model);
    throw error;
  });

  assetUriCache.set(model, promise);
  return promise;
};
