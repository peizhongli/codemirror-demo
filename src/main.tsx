import { useCallback, useRef, useState } from "react";
import { Button, Tabs } from "@arco-design/web-react";
import CodemirrorFormulaDemo from "./codemirror-demo";

export default function Main() {
  const cmCodeRef = useRef('IF(first_deep1, "条件为真", "条件为假")');

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 0",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "75vw", maxWidth: 960 }}>
        <CodemirrorFormulaDemo formulaRef={cmCodeRef} />
      </div>
    </div>
  );
}
