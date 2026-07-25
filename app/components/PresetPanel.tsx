"use client";

import type { Preset } from "../types/editor";

type Props = {
  presets: Preset[];
  activePresetId: string | null;
  newName: string;
  message: string | null;
  onNewNameChange: (name: string) => void;
  onSaveNew: () => void;
  onSelect: (preset: Preset) => void;
  onOverwrite: () => void;
  onDelete: () => void;
};

export function PresetPanel({
  presets,
  activePresetId,
  newName,
  message,
  onNewNameChange,
  onSaveNew,
  onSelect,
  onOverwrite,
  onDelete,
}: Props) {
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? null;
  const hasDefault = presets.some((preset) => preset.isDefault);

  return (
    <section className={`presets-card ${hasDefault ? "" : "next-focus"}`}>
      <div className="panel-heading compact">
        <div><span className="step-dot">3</span><strong>立ち絵プリセット</strong></div>
        <span>{presets.length}件</span>
      </div>

      {!hasDefault ? (
        <div className="preset-empty">最初にデフォルトを保存してください</div>
      ) : (
        <>
          <div className="preset-list" role="listbox" aria-label="保存した立ち絵プリセット">
            {presets.map((preset) => (
              <button
                type="button"
                role="option"
                aria-selected={preset.id === activePresetId}
                className={`preset-row ${preset.id === activePresetId ? "is-active" : ""}`}
                key={preset.id}
                onClick={() => onSelect(preset)}
              >
                <span className="preset-thumbnail">{preset.isDefault ? "★" : "◐"}</span>
                <span>{preset.name}</span>
                {preset.isDefault && <small>デフォルト</small>}
              </button>
            ))}
          </div>

          <div className="new-preset-form">
            <input
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSaveNew()}
              placeholder="差分名（例：笑顔）"
              aria-label="新しい差分プリセット名"
            />
            <button type="button" onClick={onSaveNew}>差分を保存</button>
          </div>

          {activePreset && (
            <div className="preset-actions primary-preset-actions">
              <button type="button" onClick={onOverwrite}>上書き保存</button>
              <button type="button" onClick={onDelete} disabled={activePreset.isDefault}>削除</button>
            </div>
          )}
        </>
      )}
      {message && <div className="preset-message" role="status">{message}</div>}
    </section>
  );
}
