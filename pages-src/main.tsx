import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CharacterMaker } from "../app/components/CharacterMaker";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("アプリの表示領域を初期化できませんでした。");
}

createRoot(root).render(
  <StrictMode>
    <CharacterMaker />
  </StrictMode>,
);
