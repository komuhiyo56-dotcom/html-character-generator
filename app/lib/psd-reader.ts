import type { Layer, Psd } from "ag-psd";
import type { LayerBitmap, LayerNode, ParsedDocument } from "../types/editor";

type ImageDataLike = { width: number; height: number; data: Uint8ClampedArray };

function createId(path: number[]): string {
  return `layer-${path.map((value) => value.toString(36)).join("-")}`;
}

function imageDataToUrl(imageData: ImageDataLike): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("プレビュー用の描画領域を作成できませんでした。");
  const copy = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  context.putImageData(copy, 0, 0);
  return canvas.toDataURL("image/png");
}

function toBitmap(layer: Layer): LayerBitmap | undefined {
  if (!layer.imageData || !layer.imageData.width || !layer.imageData.height) return undefined;
  return {
    url: imageDataToUrl(layer.imageData as ImageDataLike),
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width: layer.imageData.width,
    height: layer.imageData.height,
  };
}

function toLayerNode(layer: Layer, path: number[], depth: number): LayerNode {
  const children = layer.children?.map((child, index) =>
    toLayerNode(child, [...path, index], depth + 1),
  ) ?? [];

  return {
    id: createId(path),
    name: layer.name?.trim() || "名称なしレイヤー",
    kind: children.length > 0 ? "group" : "layer",
    visible: !layer.hidden,
    characterSelected: false,
    // ag-psdの透明度は0～1で返されます。
    opacity: layer.opacity ?? 1,
    depth,
    bitmap: children.length > 0 ? undefined : toBitmap(layer),
    children,
  };
}

function collectWarnings(psd: Psd): string[] {
  const warnings: string[] = [];
  const inspect = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.adjustment || layer.effects || layer.mask || layer.clipping) {
        warnings.push("完全には再現できないレイヤー効果が含まれています。プレビューを確認してください。");
      }
      if (layer.children) inspect(layer.children);
    }
  };
  inspect(psd.children ?? []);
  return [...new Set(warnings)];
}

export async function readPsdFile(file: File): Promise<ParsedDocument> {
  if (!file.name.toLowerCase().endsWith(".psd")) {
    throw new Error("PSDファイルを選択してください。");
  }

  const { readPsd } = await import("ag-psd");
  const data = new Uint8Array(await file.arrayBuffer());
  const psd = readPsd(data, {
    useImageData: true,
    skipLayerImageData: false,
    skipCompositeImageData: false,
  });

  if (!psd.imageData) {
    throw new Error("PSDのプレビュー画像を読み込めませんでした。");
  }

  return {
    name: file.name,
    width: psd.width,
    height: psd.height,
    rootLayers: (psd.children ?? []).map((layer, index) => toLayerNode(layer, [index], 0)),
    previewUrl: imageDataToUrl(psd.imageData as ImageDataLike),
    warnings: collectWarnings(psd),
  };
}
