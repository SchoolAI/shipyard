import { useState, useCallback, useRef, useEffect } from "react";
import { LoroDoc, type PeerID } from "loro-crdt";
import { Editor } from "./Editor";

/**
 * Main App with two editors sharing a Loro document via manual export/import sync.
 *
 * This validates that Tiptap + loro-prosemirror works correctly.
 * Two separate LoroDoc instances simulate network peers.
 */
export function App() {
  const docARef = useRef<LoroDoc | null>(null);
  const docBRef = useRef<LoroDoc | null>(null);
  const [docKey, setDocKey] = useState(0);
  const syncIntervalRef = useRef<number | null>(null);

  // Initialize both docs
  if (!docARef.current) {
    const docA = new LoroDoc();
    docA.setPeerId(BigInt(1));
    console.log("[App] Created LoroDoc A (peer 1)");
    docARef.current = docA;
  }

  if (!docBRef.current) {
    const docB = new LoroDoc();
    docB.setPeerId(BigInt(2));
    console.log("[App] Created LoroDoc B (peer 2)");
    docBRef.current = docB;
  }

  // Bidirectional sync
  useEffect(() => {
    const docA = docARef.current;
    const docB = docBRef.current;
    if (!docA || !docB) return;

    const sync = () => {
      try {
        const updatesFromA = docA.export({ mode: "update" });
        const updatesFromB = docB.export({ mode: "update" });

        if (updatesFromA.byteLength > 0) {
          docB.import(updatesFromA);
        }
        if (updatesFromB.byteLength > 0) {
          docA.import(updatesFromB);
        }
      } catch (err) {
        console.error("[Sync] Error:", err);
      }
    };

    syncIntervalRef.current = window.setInterval(sync, 50);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [docKey]);

  const resetDocs = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    const docA = new LoroDoc();
    docA.setPeerId(BigInt(Date.now()));
    const docB = new LoroDoc();
    docB.setPeerId(BigInt(Date.now() + 1));

    console.log("[App] Reset both LoroDoc instances");
    docARef.current = docA;
    docBRef.current = docB;
    setDocKey((k) => k + 1);
  }, []);

  const logDocState = useCallback(() => {
    if (!docARef.current || !docBRef.current) return;
    console.log("[App] Doc A:", docARef.current.toJSON());
    console.log("[App] Doc B:", docBRef.current.toJSON());
  }, []);

  return (
    <div>
      <h1>Tiptap + Loro Validation Spike</h1>

      <div className="controls">
        <button onClick={resetDocs}>Reset Documents</button>
        <button onClick={logDocState}>Log Doc State</button>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: "#e8f4f8", borderRadius: 8, fontSize: 13 }}>
        <strong>Status:</strong> ✅ All P0 and P1 criteria validated
        <br />
        <strong>Architecture:</strong> Two separate LoroDoc instances with manual sync (50ms)
        <br /><br />
        <strong>Keyboard Shortcuts:</strong>
        <br />
        <code>Cmd+B</code> Bold | <code>Cmd+I</code> Italic | <code>Cmd+Z</code> Undo | <code>Cmd+Shift+Z</code> Redo
        <br />
        <code>Cmd+Shift+C</code> Apply Comment Mark
        <br /><br />
        <strong>Validated:</strong>
        <br />
        ✅ Content sync | ✅ Formatting | ✅ Undo/redo | ✅ Comment marks | ✅ Cursor API | ✅ Drag handle
      </div>

      <div className="container" key={docKey}>
        <Editor name="Editor A" loroDoc={docARef.current!} color="#007aff" />
        <Editor name="Editor B" loroDoc={docBRef.current!} color="#34c759" />
      </div>
    </div>
  );
}
