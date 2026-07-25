import type { BreathMode, LayerNode, RenderLayer } from "../types/editor";

function collectVisibleLayers(nodes: LayerNode[], parentVisible = true): RenderLayer[] {
  const result: RenderLayer[] = [];
  // ag-psdは背面から前面の順で返すため、そのまま重ねます。
  for (const node of nodes) {
    const visible = parentVisible && node.visible;
    if (node.kind === "group") {
      result.push(...collectVisibleLayers(node.children, visible));
    } else if (visible && node.bitmap) {
      result.push({
        id: node.id,
        name: node.name,
        opacity: node.opacity,
        characterSelected: node.characterSelected,
        bitmap: node.bitmap,
      });
    }
  }
  return result;
}

function LayerImage({ layer, width, height }: { layer: RenderLayer; width: number; height: number }) {
  return (
    <img
      className="psd-layer-image"
      src={layer.bitmap.url}
      alt=""
      aria-hidden="true"
      style={{
        left: `${(layer.bitmap.left / width) * 100}%`,
        top: `${(layer.bitmap.top / height) * 100}%`,
        width: `${(layer.bitmap.width / width) * 100}%`,
        height: `${(layer.bitmap.height / height) * 100}%`,
        opacity: layer.opacity,
      }}
    />
  );
}

export function LayeredPreview({ nodes, width, height, fallbackUrl, breathMode }: {
  nodes: LayerNode[];
  width: number;
  height: number;
  fallbackUrl: string;
  breathMode: BreathMode;
}) {
  const layers = collectVisibleLayers(nodes);
  const firstCharacterIndex = layers.findIndex((layer) => layer.characterSelected);
  const fixedBackLayers = layers.filter((layer, index) => !layer.characterSelected && (firstCharacterIndex < 0 || index < firstCharacterIndex));
  const fixedFrontLayers = layers.filter((layer, index) => !layer.characterSelected && firstCharacterIndex >= 0 && index > firstCharacterIndex);
  const characterLayers = layers.filter((layer) => layer.characterSelected);

  return (
    <div className="preview-composite" aria-label="PSDレイヤーのプレビュー">
      {layers.length === 0 && (
        <img className="composite-fallback" src={fallbackUrl} alt="PSDの合成プレビュー" />
      )}
      <div className="fixed-layer-stack">
        {fixedBackLayers.map((layer) => <LayerImage key={layer.id} layer={layer} width={width} height={height} />)}
      </div>
      <div className={`character-layer-stack ${characterLayers.length ? `breath-${breathMode}` : ""}`}>
        {characterLayers.map((layer) => <LayerImage key={layer.id} layer={layer} width={width} height={height} />)}
      </div>
      <div className="fixed-front-layer-stack">
        {fixedFrontLayers.map((layer) => <LayerImage key={layer.id} layer={layer} width={width} height={height} />)}
      </div>
    </div>
  );
}
