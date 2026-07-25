"use client";

import { useState } from "react";
import type { LayerNode } from "../types/editor";

type Props = {
  nodes: LayerNode[];
  onToggleVisibility: (id: string, visible: boolean) => void;
  onToggleCharacter: (id: string, selected: boolean) => void;
  characterSelectionLocked?: boolean;
};

function leafSelection(node: LayerNode): { selected: number; total: number } {
  if (node.kind === "layer") return { selected: node.characterSelected ? 1 : 0, total: 1 };
  return node.children.reduce(
    (result, child) => {
      const current = leafSelection(child);
      return { selected: result.selected + current.selected, total: result.total + current.total };
    },
    { selected: 0, total: 0 },
  );
}

function TreeRow({ node, onToggleVisibility, onToggleCharacter, characterSelectionLocked = false }: {
  node: LayerNode;
  onToggleVisibility: Props["onToggleVisibility"];
  onToggleCharacter: Props["onToggleCharacter"];
  characterSelectionLocked?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const isGroup = node.kind === "group";
  const selection = leafSelection(node);
  const allSelected = selection.total > 0 && selection.selected === selection.total;
  const partlySelected = selection.selected > 0 && !allSelected;

  return (
    <li>
      <div className={`layer-row ${selection.selected > 0 ? "is-character" : ""}`} style={{ paddingLeft: `${8 + node.depth * 17}px` }}>
        <button
          className={`disclosure ${isGroup ? "" : "is-leaf"}`}
          onClick={() => isGroup && setOpen((value) => !value)}
          aria-label={isGroup ? `${node.name}を${open ? "閉じる" : "開く"}` : undefined}
          type="button"
        >
          {isGroup ? (open ? "⌄" : "›") : ""}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={node.visible}
          className={`visibility ${node.visible ? "is-visible" : ""}`}
          onClick={() => onToggleVisibility(node.id, !node.visible)}
          aria-label={`${node.name}を${node.visible ? "非表示" : "表示"}にする`}
          title="表示・非表示"
        >
          <span aria-hidden="true">{node.visible ? "●" : ""}</span>
        </button>
        {characterSelectionLocked ? (
          <span className="character-check-placeholder" aria-hidden="true" />
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={partlySelected ? "mixed" : allSelected}
            className={`character-check ${allSelected ? "is-checked" : ""} ${partlySelected ? "is-mixed" : ""}`}
            onClick={() => onToggleCharacter(node.id, !allSelected)}
            aria-label={`${node.name}をキャラクター${allSelected ? "から外す" : "に選択する"}`}
            title="キャラクターに含める"
          >
            <span aria-hidden="true">{allSelected ? "✓" : partlySelected ? "−" : ""}</span>
          </button>
        )}
        <span className={`layer-icon ${isGroup ? "folder" : "sheet"}`} aria-hidden="true" />
        <span className="layer-name" title={node.name}>{node.name}</span>
        <span className="layer-opacity">{Math.round(node.opacity * 100)}%</span>
      </div>
      {isGroup && open && (
        <LayerTree nodes={node.children} onToggleVisibility={onToggleVisibility} onToggleCharacter={onToggleCharacter} characterSelectionLocked={characterSelectionLocked} />
      )}
    </li>
  );
}

export function LayerTree({ nodes, onToggleVisibility, onToggleCharacter, characterSelectionLocked = false }: Props) {
  // 一般的な画像編集ソフトと同じく、下のレイヤーから上へ積み重なる順で表示します。
  const displayNodes = [...nodes].reverse();

  return (
    <ul className="layer-tree">
      {displayNodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          onToggleVisibility={onToggleVisibility}
          onToggleCharacter={onToggleCharacter}
          characterSelectionLocked={characterSelectionLocked}
        />
      ))}
    </ul>
  );
}
