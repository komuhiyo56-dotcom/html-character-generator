export type LayerId = string;

export type LayerBitmap = {
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LayerNode = {
  id: LayerId;
  name: string;
  kind: "group" | "layer";
  visible: boolean;
  characterSelected: boolean;
  opacity: number;
  depth: number;
  bitmap?: LayerBitmap;
  children: LayerNode[];
};

export type ParsedDocument = {
  name: string;
  width: number;
  height: number;
  rootLayers: LayerNode[];
  previewUrl: string;
  warnings: string[];
};

export type RenderLayer = {
  id: LayerId;
  name: string;
  opacity: number;
  characterSelected: boolean;
  bitmap: LayerBitmap;
};

export type Preset = {
  id: string;
  name: string;
  visibleCharacterLayerIds: string[];
  isDefault: boolean;
};

export type BreathMode = "none" | "subtle" | "standard";

export type GeneratedImageAsset = {
  fileName: string;
  label: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  cropLeft: number;
  cropTop: number;
};

export type ExportedLayer = {
  id: string;
  name: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  character: boolean;
  defaultVisible: boolean;
  groupPath: string[];
};

export type ExportedLayerTreeNode = {
  id: string;
  name: string;
  kind: "group" | "layer";
  visible: boolean;
  character: boolean;
  file?: string;
  children: ExportedLayerTreeNode[];
};

export type ExportedPreset = {
  id: string;
  name: string;
  visibleLayerIds: string[];
  isDefault: boolean;
};

export type ImageGenerationResult = {
  assets: GeneratedImageAsset[];
  outputWidth: number;
  outputHeight: number;
  scale: number;
  layers: ExportedLayer[];
  layerTree: ExportedLayerTreeNode[];
  presets: ExportedPreset[];
};
