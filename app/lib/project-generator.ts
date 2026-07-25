import JSZip from "jszip";
import type { BreathMode, ImageGenerationResult } from "../types/editor";

type ProjectOptions = {
  psdName: string;
  images: ImageGenerationResult;
  breathMode: BreathMode;
  onProgress?: (percent: number) => void;
};

export type GeneratedProject = { blob: Blob; fileName: string };

function safeProjectName(psdName: string): string {
  return psdName.replace(/\.psd$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "HTML作品";
}

function createScenario(images: ImageGenerationResult): string {
  const entries = [...images.presets]
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .map((preset) => `  {\n    preset: ${JSON.stringify(preset.name)},\n    text: ${JSON.stringify(`現在の立ち絵プリセット：${preset.name}`)}\n  }`)
    .join(",\n");
  return `// このファイルで、表示するセリフと立ち絵プリセットを編集できます。\n// text：画面に表示するセリフです。\n// preset：表示する立ち絵プリセット名です。\n// 下のデータを複製すると、セリフを増やせます。\n// 引用符やカンマを削除すると動作しなくなるため注意してください。\n\nconst scenario = [\n${entries}\n];\n`;
}

function createGameScript(images: ImageGenerationResult): string {
  const presetMap = Object.fromEntries(images.presets.map((preset) => [preset.name, { visibleLayerIds: preset.visibleLayerIds }]));
  const defaultPreset = images.presets.find((preset) => preset.isDefault)?.name ?? images.presets[0]?.name ?? "";
  return `// 元PSDの全レイヤーです。固定・キャラクターの区別、座標、重なり順を保持しています。\nconst layers = ${JSON.stringify(images.layers, null, 2)};\n\n// 元PSDのグループ階層とレイヤー名です。\nconst layerTree = ${JSON.stringify(images.layerTree, null, 2)};\n\n// 各プリセットで表示するキャラクターレイヤーIDです。\nconst presets = ${JSON.stringify(presetMap, null, 2)};\n\nconst canvasSize = { width: ${images.outputWidth}, height: ${images.outputHeight} };\nconst defaultPresetName = ${JSON.stringify(defaultPreset)};\nlet currentDialogueIndex = 0;\n\n// PSDの重なり順を保ちながら、固定レイヤーとキャラクターを配置する\nfunction createLayers() {\n  const characterOrders = layers.filter((layer) => layer.character).map((layer) => layer.order);\n  const firstCharacterOrder = characterOrders.length ? Math.min(...characterOrders) : Infinity;\n  layers.forEach((layer) => {\n    const image = document.createElement("img");\n    image.src = layer.file;\n    image.alt = "";\n    image.dataset.layerId = layer.id;\n    image.dataset.layerName = layer.name;\n    image.style.left = (layer.x / canvasSize.width * 100) + "%";\n    image.style.top = (layer.y / canvasSize.height * 100) + "%";\n    image.style.width = (layer.width / canvasSize.width * 100) + "%";\n    image.style.height = (layer.height / canvasSize.height * 100) + "%";\n    image.style.zIndex = String(layer.order);\n    if (layer.character) {\n      document.getElementById("character").appendChild(image);\n    } else {\n      image.hidden = !layer.defaultVisible;\n      const container = layer.order < firstCharacterOrder ? "fixed-back" : "fixed-front";\n      document.getElementById(container).appendChild(image);\n    }\n  });\n}\n\n// 表示する立ち絵プリセットを変更する\nfunction setPreset(name) {\n  const preset = presets[name];\n  const warning = document.getElementById("warning");\n  if (!preset) {\n    warning.textContent = "指定された立ち絵プリセット「" + name + "」を見つけられませんでした。scenario.jsのpreset名を確認してください。";\n    warning.hidden = false;\n    return;\n  }\n  warning.hidden = true;\n  const visibleIds = new Set(preset.visibleLayerIds);\n  document.querySelectorAll("#character [data-layer-id]").forEach((element) => {\n    element.hidden = !visibleIds.has(element.dataset.layerId);\n  });\n}\n\nfunction showDialogue() {\n  if (typeof scenario === "undefined" || !Array.isArray(scenario) || scenario.length === 0) {\n    const warning = document.getElementById("warning");\n    warning.textContent = "scenario.jsを読み込めませんでした。引用符やカンマを確認してください。";\n    warning.hidden = false;\n    return;\n  }\n  const dialogue = scenario[currentDialogueIndex];\n  document.getElementById("dialogue-text").textContent = dialogue.text;\n  document.getElementById("progress").textContent = (currentDialogueIndex + 1) + " / " + scenario.length;\n  setPreset(dialogue.preset);\n}\n\n// 台詞ウインドウを押したときだけ、次のセリフへ進みます。\nfunction nextDialogue() {\n  if (typeof scenario === "undefined" || currentDialogueIndex >= scenario.length - 1) return;\n  currentDialogueIndex += 1;\n  showDialogue();\n}\n\nfunction initialize() {\n  createLayers();\n  const scene = document.getElementById("scene");\n  const dialogueWindow = document.getElementById("dialogue");\n  dialogueWindow.addEventListener("pointerup", (event) => {\n    event.stopPropagation();\n    nextDialogue();\n  });\n  scene.addEventListener("pointerup", () => {\n    dialogueWindow.hidden = !dialogueWindow.hidden;\n  });\n  if (typeof scenario !== "undefined" && Array.isArray(scenario) && scenario.length > 0) showDialogue();\n  else { setPreset(defaultPresetName); showDialogue(); }\n}\n\ndocument.addEventListener("DOMContentLoaded", initialize);\n`;
}

function createHtml(projectName: string): string {
  return `<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main id="scene" class="scene" aria-label="メイン画面をクリックまたはタップすると台詞ウインドウを表示・非表示にします">\n    <div id="fixed-back" class="layer-stack fixed-back"></div>\n    <div id="character" class="layer-stack character"></div>\n    <div id="fixed-front" class="layer-stack fixed-front"></div>\n    <div id="warning" class="warning" hidden></div>\n    <section id="dialogue" class="dialogue" aria-label="クリックまたはタップで次のセリフへ進みます">\n      <p id="dialogue-text"></p>\n      <div class="dialogue-footer"><span id="progress"></span><span>クリック・タップで次へ</span></div>\n    </section>\n  </main>\n  <script src="scenario.js"></script>\n  <script src="game.js"></script>\n</body>\n</html>\n`;
}

function createStyle(images: ImageGenerationResult, breathMode: BreathMode): string {
  const aspect = images.outputWidth / images.outputHeight;
  return `* { box-sizing: border-box; }\nhtml, body { width:100%; height:100%; margin:0; }\nbody { display:grid; place-items:center; overflow:hidden; background:#171715; color:#fff; font-family:"Yu Gothic UI","Hiragino Sans",sans-serif; }\n.scene { position:relative; width:min(100vw,calc(100vh * ${aspect})); aspect-ratio:${images.outputWidth}/${images.outputHeight}; overflow:hidden; cursor:pointer; user-select:none; touch-action:manipulation; }\n.layer-stack { position:absolute; inset:0; width:100%; height:100%; }\n.fixed-back { z-index:0; }\n.character { z-index:1; transform-origin:50% 100%; animation:breath-${breathMode} 3.6s ease-in-out infinite; }\n.fixed-front { z-index:2; }\n.layer-stack img { position:absolute; display:block; object-fit:fill; pointer-events:none; }\n.layer-stack img[hidden] { display:none; }\n.dialogue { position:absolute; z-index:1000; left:50%; bottom:20px; width:min(calc(100% - 32px),720px); max-height:min(42%,320px); overflow:auto; transform:translateX(-50%); padding:18px 20px; border:1px solid rgba(255,255,255,.58); border-radius:14px; background:rgba(18,18,20,.82); box-shadow:0 8px 30px rgba(0,0,0,.3); backdrop-filter:blur(5px); cursor:pointer; }\n.dialogue[hidden] { display:none; }\n.dialogue p { margin:0; font-size:18px; line-height:1.7; white-space:pre-wrap; }\n.dialogue-footer { display:flex; justify-content:space-between; margin-top:12px; color:rgba(255,255,255,.62); font-size:11px; }\n.warning { position:absolute; z-index:2000; top:16px; left:50%; width:min(90%,620px); transform:translateX(-50%); padding:12px 16px; border-radius:8px; background:#8b342d; color:#fff; font-size:13px; }\n@keyframes breath-none { from,to { transform:none; } }\n@keyframes breath-subtle { 0%,100% { transform:translateY(0) scaleY(1); } 50% { transform:translateY(-.18%) scaleY(1.008); } }\n@keyframes breath-standard { 0%,100% { transform:translateY(0) scaleY(1); } 50% { transform:translateY(-.35%) scaleY(1.015); } }\n@media (max-width:600px) { .dialogue { bottom:12px; width:calc(100% - 20px); max-height:45%; padding:14px 16px; } .dialogue p { font-size:16px; } }\n@media (prefers-reduced-motion:reduce) { .character { animation:none; } }\n`;
}

function createLockedViewportScript(): string {
  return `

// 開いた時点の作品と台詞ウインドウの表示サイズを固定します。
function lockInitialViewportSize() {
  const scene = document.getElementById("scene");
  const dialogueWindow = document.getElementById("dialogue");
  const dialogueText = document.getElementById("dialogue-text");
  const dialogueFooter = dialogueWindow.querySelector(".dialogue-footer");
  const sceneRect = scene.getBoundingClientRect();
  const dialogueRect = dialogueWindow.getBoundingClientRect();
  const dialogueStyle = getComputedStyle(dialogueWindow);

  scene.style.width = sceneRect.width + "px";
  scene.style.height = sceneRect.height + "px";
  scene.style.aspectRatio = "auto";

  dialogueWindow.style.width = dialogueRect.width + "px";
  dialogueWindow.style.height = dialogueRect.height + "px";
  dialogueWindow.style.maxHeight = "none";
  dialogueWindow.style.padding = dialogueStyle.padding;
  dialogueWindow.style.bottom = dialogueStyle.bottom;
  dialogueText.style.fontSize = getComputedStyle(dialogueText).fontSize;
  dialogueFooter.style.fontSize = getComputedStyle(dialogueFooter).fontSize;
}
document.addEventListener("DOMContentLoaded", lockInitialViewportSize);
`;
}

function createReadme(projectName: string, images: ImageGenerationResult): string {
  const presetNames = images.presets.map((preset) => `・${preset.name}${preset.isDefault ? "（デフォルト）" : ""}`).join("\n");
  return `【まず作品を見る】\n\nindex.htmlをダブルクリックしてください。\nブラウザで「${projectName}」が開きます。\n\n【セリフを変更する】\n\nscenario.jsをメモ帳やコードエディタで開いてください。\ntext：表示するセリフ\npreset：使用する立ち絵プリセット名\n\n【利用できるプリセット】\n${presetNames}\n\n【レイヤーについて】\nassets/layers内は、元PSDのグループ階層と名前が分かる形で保存されています。\ngame.jsのlayersには座標・重なり順・固定／キャラクターの区別があります。\nlayerTreeには元PSDの階層構造とレイヤー名があります。\n同名レイヤーは一意IDとファイル末尾の連番で区別しています。\n\n【セリフを増やす】\nscenario.jsの { preset: ..., text: ... } を複製します。引用符やカンマを削除しないでください。\n\n【編集後の確認】\nファイルを保存し、index.htmlを開き直してください。ファイル名やフォルダを変更する場合はgame.jsのパスも変更してください。\n\n【エラー時】\nscenario.jsの引用符・カンマ、preset名、assetsフォルダ、保存状態を確認してください。\n\nHTML、CSS、JavaScriptは生成AIへ渡して拡張できます。編集前にフォルダ全体をバックアップしてください。\n`;
}

export async function generateProjectZip({ psdName, images, breathMode, onProgress }: ProjectOptions): Promise<GeneratedProject> {
  const projectName = safeProjectName(psdName);
  const zip = new JSZip();
  const root = zip.folder(projectName);
  if (!root) throw new Error("ZIPの作成を開始できませんでした。");
  root.file("index.html", createHtml(projectName));
  root.file("style.css", createStyle(images, breathMode));
  root.file("game.js", createGameScript(images) + createLockedViewportScript());
  root.file("scenario.js", createScenario(images));
  root.file("README.txt", createReadme(projectName, images));
  images.assets.forEach((asset) => root.file(`assets/${asset.fileName}`, asset.blob));
  const blob = await zip.generateAsync(
    { type:"blob", compression:"DEFLATE", compressionOptions:{ level:6 } },
    (metadata) => onProgress?.(Math.round(metadata.percent)),
  );
  return { blob, fileName:`${projectName}.zip` };
}
