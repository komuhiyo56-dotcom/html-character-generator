"use client";

import { ChangeEvent, CSSProperties, DragEvent, useRef, useState } from "react";
import { readPsdFile } from "../lib/psd-reader";
import { generateWebpAssets } from "../lib/image-composer";
import { generateProjectZip } from "../lib/project-generator";
import type { BreathMode, ImageGenerationResult, LayerNode, ParsedDocument, Preset } from "../types/editor";
import { LayeredPreview } from "./LayeredPreview";
import { LayerTree } from "./LayerTree";
import { PresetPanel } from "./PresetPanel";

function updateVisibility(nodes: LayerNode[], id: string, visible: boolean): LayerNode[] {
  return nodes.map((node) => node.id === id
    ? { ...node, visible }
    : { ...node, children: updateVisibility(node.children, id, visible) });
}

function updateCharacterSelection(nodes: LayerNode[], id: string, selected: boolean): LayerNode[] {
  const selectBranch = (node: LayerNode): LayerNode => ({
    ...node,
    characterSelected: selected,
    children: node.children.map(selectBranch),
  });
  return nodes.map((node) => node.id === id
    ? selectBranch(node)
    : { ...node, children: updateCharacterSelection(node.children, id, selected) });
}

function countSelectedLeaves(nodes: LayerNode[]): number {
  return nodes.reduce((count, node) => count + (
    node.kind === "layer" ? Number(node.characterSelected) : countSelectedLeaves(node.children)
  ), 0);
}

function captureVisibleCharacterIds(nodes: LayerNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.characterSelected && node.visible ? [node.id] : []),
    ...captureVisibleCharacterIds(node.children),
  ]);
}

function applyPresetVisibility(nodes: LayerNode[], visibleIds: Set<string>): LayerNode[] {
  return nodes.map((node) => ({
    ...node,
    visible: node.characterSelected ? visibleIds.has(node.id) : node.visible,
    children: applyPresetVisibility(node.children, visibleIds),
  }));
}

export function CharacterMaker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentData, setDocumentData] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [characterSelectionConfirmed, setCharacterSelectionConfirmed] = useState(false);
  const [breathMode, setBreathMode] = useState<BreathMode>("subtle");
  const [generatedImages, setGeneratedImages] = useState<ImageGenerationResult | null>(null);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, label: "" });
  const [exportingProject, setExportingProject] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  const selectedCount = documentData ? countSelectedLeaves(documentData.rootLayers) : 0;
  const hasDefaultPreset = presets.some((preset) => preset.isDefault);

  const clearGeneratedImages = () => {
    generatedImages?.assets.forEach((asset) => URL.revokeObjectURL(asset.url));
    setGeneratedImages(null);
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPresets([]);
    setActivePresetId(null);
    setPresetMessage(null);
    setCharacterSelectionConfirmed(false);
    setBreathMode("subtle");
    clearGeneratedImages();
    setExportComplete(false);
    try {
      setDocumentData(await readPsdFile(file));
    } catch (reason) {
      setDocumentData(null);
      setError(reason instanceof Error ? reason.message : "PSDを読み込めませんでした。別のファイルを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => loadFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const changeCharacterSelection = (id: string, selected: boolean) => {
    clearGeneratedImages();
    setDocumentData((current) => current ? {
      ...current,
      rootLayers: updateCharacterSelection(current.rootLayers, id, selected),
    } : current);
    if (presets.length > 0) {
      setPresets([]);
      setActivePresetId(null);
      setPresetMessage("キャラクターを選び直したため、プリセットを作り直してください。");
    }
  };

  const changeLayerVisibility = (id: string, visible: boolean) => {
    clearGeneratedImages();
    setDocumentData((current) => current ? {
      ...current,
      rootLayers: updateVisibility(current.rootLayers, id, visible),
    } : current);
  };

  const snapshot = () => documentData ? captureVisibleCharacterIds(documentData.rootLayers) : [];

  const selectPreset = (preset: Preset) => {
    setDocumentData((current) => current ? {
      ...current,
      rootLayers: applyPresetVisibility(current.rootLayers, new Set(preset.visibleCharacterLayerIds)),
    } : current);
    setActivePresetId(preset.id);
    setPresetMessage(`「${preset.name}」をプレビューに反映しました。`);
  };

  const saveDefaultPreset = () => {
    if (!documentData || selectedCount === 0) return;
    clearGeneratedImages();
    const currentDefault = presets.find((preset) => preset.isDefault);
    const saved: Preset = {
      id: currentDefault?.id ?? "preset-default",
      name: currentDefault?.name ?? "デフォルト",
      visibleCharacterLayerIds: snapshot(),
      isDefault: true,
    };
    setPresets((current) => currentDefault
      ? current.map((preset) => preset.id === currentDefault.id ? saved : preset)
      : [saved, ...current]);
    setActivePresetId(saved.id);
    setPresetMessage(currentDefault ? "デフォルトを上書きしました。" : "デフォルトを保存しました。");
  };

  const validatedName = (value: string, exceptId?: string): string | null => {
    const name = value.trim();
    if (!name) {
      setPresetMessage("プリセット名を入力してください。");
      return null;
    }
    if (presets.some((preset) => preset.name === name && preset.id !== exceptId)) {
      setPresetMessage(`「${name}」というプリセットはすでにあります。別の名前を入力してください。`);
      return null;
    }
    return name;
  };

  const saveDifferencePreset = () => {
    const name = validatedName(newPresetName);
    if (!name) return;
    clearGeneratedImages();
    const preset: Preset = {
      id: `preset-${crypto.randomUUID()}`,
      name,
      visibleCharacterLayerIds: snapshot(),
      isDefault: false,
    };
    setPresets((current) => [...current, preset]);
    setActivePresetId(preset.id);
    setNewPresetName("");
    setPresetMessage(`差分「${name}」を保存しました。`);
  };

  const overwriteActivePreset = () => {
    if (!activePresetId) return;
    clearGeneratedImages();
    setPresets((current) => current.map((preset) => preset.id === activePresetId
      ? { ...preset, visibleCharacterLayerIds: snapshot() }
      : preset));
    setPresetMessage("選択中のプリセットを現在の表示状態で上書きしました。");
  };

  const deleteActivePreset = () => {
    const target = presets.find((preset) => preset.id === activePresetId);
    if (!target || target.isDefault) return;
    clearGeneratedImages();
    const defaultPreset = presets.find((preset) => preset.isDefault);
    setPresets((current) => current.filter((preset) => preset.id !== target.id));
    if (defaultPreset) selectPreset(defaultPreset);
    setPresetMessage(`「${target.name}」を削除しました。`);
  };

  const exportHtmlProject = async () => {
    if (!documentData || !hasDefaultPreset || exportingProject) return;
    setExportingProject(true);
    setExportComplete(false);
    setZipProgress(0);
    setError(null);
    try {
      let images = generatedImages;
      if (!images) {
        setGeneratingImages(true);
        images = await generateWebpAssets(
          documentData.width,
          documentData.height,
          documentData.rootLayers,
          presets,
          (current, total, label) => setGenerationProgress({ current, total, label }),
        );
        setGeneratedImages(images);
        setGeneratingImages(false);
      }
      const project = await generateProjectZip({
        psdName: documentData.name,
        images,
        breathMode,
        onProgress: setZipProgress,
      });
      const url = URL.createObjectURL(project.blob);
      downloadGeneratedImage(url, project.fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setExportComplete(true);
    } catch (reason) {
      setGeneratingImages(false);
      setError(reason instanceof Error ? reason.message : "ZIPファイルの作成に失敗しました。もう一度お試しください。");
    } finally {
      setExportingProject(false);
    }
  };

  const downloadGeneratedImage = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <div
          className={`preview-card ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="preview-toolbar">
            <div><span className="step-dot">1</span><strong>プレビュー</strong></div>
            {documentData && (
              <div className="preview-status">
                <span><i className="fixed-dot" />固定部分</span>
                <span><i className="character-dot" />キャラクター</span>
                <span className="document-size">{documentData.width} × {documentData.height}px</span>
              </div>
            )}
          </div>
          <div className="canvas-stage">
            {documentData ? (
              <div
                className="artboard"
                style={{
                  aspectRatio: `${documentData.width}/${documentData.height}`,
                  "--artboard-ratio": documentData.width / documentData.height,
                } as CSSProperties}
              >
                <LayeredPreview
                  nodes={documentData.rootLayers}
                  width={documentData.width}
                  height={documentData.height}
                  fallbackUrl={documentData.previewUrl}
                  breathMode={breathMode}
                />
              </div>
            ) : (
              <button className="drop-prompt" type="button" onClick={() => inputRef.current?.click()}>
                <span className="drop-icon">PSD</span>
                <strong>{loading ? "PSDを読み込んでいます…" : "ここにPSDをドロップ"}</strong>
                <span>またはクリックしてファイルを選択</span>
                <small>素材は外部へ送信されません</small>
              </button>
            )}
          </div>
          {documentData && characterSelectionConfirmed && (
            <div className="preview-controls breath-only">
              <div className="breath-control" aria-label="呼吸の強さ">
                <span>呼吸</span>
                {(["none", "subtle", "standard"] as BreathMode[]).map((mode) => (
                  <button type="button" className={breathMode === mode ? "is-active" : ""} onClick={() => setBreathMode(mode)} key={mode}>
                    {{ none: "なし", subtle: "控えめ", standard: "標準" }[mode]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="side-panel">
          <section className={`layers-card ${documentData && selectedCount === 0 ? "next-focus" : ""}`}>
            <div className="panel-heading">
              <div><span className="step-dot">2</span><strong>レイヤー</strong></div>
              {documentData && (
                characterSelectionConfirmed
                  ? <button className="reselect-button" type="button" onClick={() => setCharacterSelectionConfirmed(false)}>選び直す</button>
                  : <span>{selectedCount}件をキャラクターに選択</span>
              )}
            </div>
            <div className="layer-body">
              {documentData ? (
                <LayerTree
                  nodes={documentData.rootLayers}
                  onToggleVisibility={changeLayerVisibility}
                  onToggleCharacter={changeCharacterSelection}
                  characterSelectionLocked={characterSelectionConfirmed}
                />
              ) : (
                <div className="empty-layers">
                  <span>◫</span>
                  <p>PSDを読み込むと<br />レイヤーがここに表示されます</p>
                </div>
              )}
            </div>
          </section>

          {documentData && selectedCount > 0 && characterSelectionConfirmed && hasDefaultPreset && (
            <PresetPanel
              presets={presets}
              activePresetId={activePresetId}
              newName={newPresetName}
              message={presetMessage}
              onNewNameChange={setNewPresetName}
              onSaveNew={saveDifferencePreset}
              onSelect={selectPreset}
              onOverwrite={overwriteActivePreset}
              onDelete={deleteActivePreset}
            />
          )}

          <section className="guide-card" aria-live="polite">
            {!documentData ? (
              <>
                <p>作品に使用するPSDを<br />読み込んでください。</p>
                <button className="primary-action" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>
                  {loading ? "読み込み中…" : "PSDを読み込む"}<b>→</b>
                </button>
              </>
            ) : selectedCount === 0 ? (
              <>
                <p>呼吸させるキャラクターのレイヤーを<br />すべて選択してください。</p>
                <div className="guide-hint">レイヤーの横の□を押して選択します</div>
                <div className="message neutral">選択しなかったレイヤーは、背景などの固定部分として扱われます。</div>
              </>
            ) : !characterSelectionConfirmed ? (
              <>
                <div className="complete-line"><span>✓</span>{selectedCount}件を選択しています</div>
                <p>呼吸させるレイヤーをすべて選べたら、<br />キャラクター選択を確定してください。</p>
                <button className="primary-action" type="button" onClick={() => setCharacterSelectionConfirmed(true)}>
                  キャラクター選択を確定<b>→</b>
                </button>
              </>
            ) : !hasDefaultPreset ? (
              <>
                <div className="complete-line"><span>✓</span>キャラクターを選択しました</div>
                <p><strong>レイヤー欄の「表示」をオン・オフ</strong>して、<br />最初に見せたい状態を作ってください。</p>
                <div className="visibility-guide">レイヤーの横の□を押して切り替えます</div>
                <button className="primary-action" type="button" onClick={saveDefaultPreset}>
                  <span>状態ができたら</span>デフォルトを保存<b>→</b>
                </button>
              </>
            ) : (
              <>
                <div className="complete-line"><span>✓</span>デフォルトを保存しました</div>
                <p>レイヤーの表示を切り替えて、<br />差分プリセットを追加できます。</p>
                <div className="coming-next">差分名を入力して「差分を保存」を押します</div>
                {generatingImages && (
                  <div className="generation-progress">
                    <div><span style={{ width: `${generationProgress.total ? (generationProgress.current / generationProgress.total) * 100 : 0}%` }} /></div>
                    <p>{generationProgress.label}<b>{generationProgress.current} / {generationProgress.total}</b></p>
                  </div>
                )}
                <button className="primary-action export-action" type="button" onClick={exportHtmlProject} disabled={exportingProject || generatingImages}>
                  {exportingProject ? "作品を書き出しています…" : "HTML作品を書き出す"}<b>→</b>
                </button>
                {exportingProject && !generatingImages && (
                  <div className="generation-progress zip-progress">
                    <div><span style={{ width: `${zipProgress}%` }} /></div>
                    <p>ZIPファイルを作成しています<b>{zipProgress}%</b></p>
                  </div>
                )}
                {exportComplete && <div className="export-complete"><span>✓</span>書き出しが完了しました。ZIPファイルを保存してください。</div>}
              </>
            )}
            {error && <div className="message error">{error}</div>}
            {documentData?.warnings.map((warning) => <div className="message warning" key={warning}>{warning}</div>)}
          </section>
        </aside>
      </section>

      <input ref={inputRef} className="visually-hidden" type="file" accept=".psd,image/vnd.adobe.photoshop" onChange={onInput} />
    </main>
  );
}
