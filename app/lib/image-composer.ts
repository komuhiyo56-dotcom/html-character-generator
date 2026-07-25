import type {
  ExportedLayer,
  ExportedLayerTreeNode,
  ExportedPreset,
  GeneratedImageAsset,
  ImageGenerationResult,
  LayerNode,
  Preset,
} from "../types/editor";

type SourceLayer = {
  id: string;
  name: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  character: boolean;
  defaultVisible: boolean;
  groupPath: string[];
  order: number;
};

function safeSegment(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "名称なし";
}

function collectSourceLayers(
  nodes: LayerNode[],
  groupPath: string[] = [],
  parentVisible = true,
  result: SourceLayer[] = [],
): SourceLayer[] {
  for (const node of nodes) {
    const visible = parentVisible && node.visible;
    if (node.kind === "group") {
      collectSourceLayers(node.children, [...groupPath, node.name], visible, result);
    } else if (node.bitmap) {
      result.push({
        id: node.id,
        name: node.name,
        url: node.bitmap.url,
        left: node.bitmap.left,
        top: node.bitmap.top,
        width: node.bitmap.width,
        height: node.bitmap.height,
        opacity: node.opacity,
        character: node.characterSelected,
        defaultVisible: visible,
        groupPath,
        order: result.length,
      });
    }
  }
  return result;
}

function buildLayerTree(nodes: LayerNode[], fileById: Map<string, string>): ExportedLayerTreeNode[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    visible: node.visible,
    character: node.characterSelected,
    file: node.kind === "layer" ? fileById.get(node.id) : undefined,
    children: buildLayerTree(node.children, fileById),
  }));
}

function collectVisibleCharacterLeafIds(
  nodes: LayerNode[],
  visibleIds: Set<string>,
  exportedIds: Set<string>,
  parentVisible = true,
): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    const ownVisible = node.characterSelected ? visibleIds.has(node.id) : node.visible;
    const visible = parentVisible && ownVisible;
    if (node.kind === "group") {
      result.push(...collectVisibleCharacterLeafIds(node.children, visibleIds, exportedIds, visible));
    } else if (visible && node.characterSelected && exportedIds.has(node.id)) {
      result.push(node.id);
    }
  }
  return result;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("レイヤー画像を読み込めませんでした。"));
    image.src = url;
  });
}

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像の書き出しに必要な描画領域を作成できませんでした。");
  return { canvas, context };
}

async function renderLayer(layer: SourceLayer, scale: number): Promise<HTMLCanvasElement> {
  const width = Math.max(1, Math.round(layer.width * scale));
  const height = Math.max(1, Math.round(layer.height * scale));
  const { canvas, context } = createCanvas(width, height);
  const image = await loadImage(layer.url);
  context.globalAlpha = layer.opacity;
  context.drawImage(image, 0, 0, width, height);
  context.globalAlpha = 1;
  return canvas;
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("WebP画像への変換に失敗しました。")), "image/webp", 0.9);
  });
}

const yieldToBrowser = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function generateWebpAssets(
  documentWidth: number,
  documentHeight: number,
  nodes: LayerNode[],
  presets: Preset[],
  onProgress: (current: number, total: number, label: string) => void,
): Promise<ImageGenerationResult> {
  const scale = Math.min(1, 2000 / Math.max(documentWidth, documentHeight));
  const outputWidth = Math.max(1, Math.round(documentWidth * scale));
  const outputHeight = Math.max(1, Math.round(documentHeight * scale));
  const sourceLayers = collectSourceLayers(nodes);
  const total = sourceLayers.length;
  const assets: GeneratedImageAsset[] = [];
  const layers: ExportedLayer[] = [];
  const fileById = new Map<string, string>();

  for (let index = 0; index < sourceLayers.length; index += 1) {
    const layer = sourceLayers[index];
    onProgress(index, total, `「${layer.name}」を書き出しています`);
    const canvas = await renderLayer(layer, scale);
    const blob = await canvasToWebp(canvas);
    const folders = layer.groupPath.map((name) => safeSegment(name));
    const fileName = `${safeSegment(layer.name)}__layer_${String(index + 1).padStart(3, "0")}.webp`;
    const relativeFile = ["layers", ...folders, fileName].join("/");
    const exportedFile = `assets/${relativeFile}`;
    fileById.set(layer.id, exportedFile);
    assets.push({
      fileName: relativeFile,
      label: `${layer.character ? "キャラクター" : "固定"}：${layer.name}`,
      blob,
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
      cropLeft: Math.round(layer.left * scale),
      cropTop: Math.round(layer.top * scale),
    });
    layers.push({
      id: layer.id,
      name: layer.name,
      file: exportedFile,
      x: Math.round(layer.left * scale),
      y: Math.round(layer.top * scale),
      width: canvas.width,
      height: canvas.height,
      order: layer.order,
      character: layer.character,
      defaultVisible: layer.defaultVisible,
      groupPath: layer.groupPath,
    });
    await yieldToBrowser();
  }

  const exportedIds = new Set(layers.filter((layer) => layer.character).map((layer) => layer.id));
  const exportedPresets: ExportedPreset[] = presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    visibleLayerIds: collectVisibleCharacterLeafIds(nodes, new Set(preset.visibleCharacterLayerIds), exportedIds),
    isDefault: preset.isDefault,
  }));

  onProgress(total, total, "全レイヤー画像を準備しました");
  return { assets, outputWidth, outputHeight, scale, layers, layerTree: buildLayerTree(nodes, fileById), presets: exportedPresets };
}
