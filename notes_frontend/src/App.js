import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { createNote, deleteNote, listNotes, updateNote } from "./api/notesApi";

function truncatePreview(text, maxLen = 80) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

function makeTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeNote(raw) {
  // Backend may use id/uuid; be flexible.
  const id = raw?.id ?? raw?.note_id ?? raw?.uuid ?? raw?._id;
  return {
    id,
    title: raw?.title ?? "",
    content: raw?.content ?? "",
    updated_at: raw?.updated_at ?? raw?.updatedAt ?? null,
    created_at: raw?.created_at ?? raw?.createdAt ?? null,
  };
}

// PUBLIC_INTERFACE
function App() {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const [filter, setFilter] = useState("");

  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const abortRef = useRef(null);

  const selectedNote = useMemo(
    () => notes.find((n) => String(n.id) === String(selectedId)) || null,
    [notes, selectedId]
  );

  const filteredNotes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const hay = `${n.title}\n${n.content}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notes, filter]);

  async function refreshNotes({ preserveSelection = true } = {}) {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingList(true);
    setError("");

    try {
      const data = await listNotes({ signal: controller.signal });

      // Allow backend to return either array directly or {items:[...]}
      const rawList = Array.isArray(data) ? data : data?.items || [];
      const normalized = rawList.map(normalizeNote);

      // Sort newest-ish first if timestamps exist, otherwise by title
      normalized.sort((a, b) => {
        const at = a.updated_at || a.created_at;
        const bt = b.updated_at || b.created_at;
        if (at && bt) return String(bt).localeCompare(String(at));
        return (b.id ?? 0) > (a.id ?? 0) ? 1 : -1;
      });

      setNotes(normalized);

      if (!preserveSelection) return;

      // If nothing selected, select first note if exists.
      if (selectedId == null && normalized.length > 0) {
        setSelectedId(normalized[0].id);
      } else if (selectedId != null) {
        const stillExists = normalized.some((n) => String(n.id) === String(selectedId));
        if (!stillExists) {
          setSelectedId(normalized[0]?.id ?? null);
        }
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setError(e?.message || "Failed to load notes.");
      }
    } finally {
      setIsLoadingList(false);
    }
  }

  useEffect(() => {
    refreshNotes();

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep editor in sync with selection (unless user is editing).
  useEffect(() => {
    if (!selectedNote) {
      setEditorTitle("");
      setEditorContent("");
      setDirty(false);
      return;
    }
    setEditorTitle(selectedNote.title || "");
    setEditorContent(selectedNote.content || "");
    setDirty(false);
  }, [selectedId]); // intentionally based on selection change

  function onSelectNote(id) {
    if (dirty) {
      const proceed = window.confirm("You have unsaved changes. Discard them and switch notes?");
      if (!proceed) return;
    }
    setSelectedId(id);
  }

  async function onNewNote() {
    if (dirty) {
      const proceed = window.confirm("You have unsaved changes. Discard them and create a new note?");
      if (!proceed) return;
    }

    const tempId = makeTempId();
    const temp = { id: tempId, title: "Untitled", content: "" };
    setNotes((prev) => [temp, ...prev]);
    setSelectedId(tempId);
    setEditorTitle(temp.title);
    setEditorContent("");
    setDirty(true);
    setError("");
  }

  async function onSave() {
    const title = editorTitle.trim();
    const content = editorContent;

    if (!title) {
      setError("Title is required.");
      return;
    }

    if (!selectedId) {
      setError("No note selected.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const isTemp = String(selectedId).startsWith("tmp_");

      if (isTemp) {
        const created = await createNote({ title, content });
        const createdNote = normalizeNote(created);

        // Replace temp note with real note
        setNotes((prev) =>
          prev.map((n) => (String(n.id) === String(selectedId) ? createdNote : n))
        );
        setSelectedId(createdNote.id);
        setDirty(false);
      } else {
        const updated = await updateNote(selectedId, { title, content });
        const updatedNote = normalizeNote(updated);

        setNotes((prev) =>
          prev.map((n) => (String(n.id) === String(selectedId) ? updatedNote : n))
        );
        setDirty(false);
      }

      // Keep list fresh (in case backend adds timestamps / ordering)
      await refreshNotes({ preserveSelection: true });
    } catch (e) {
      setError(e?.message || "Failed to save note.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedId) return;

    const isTemp = String(selectedId).startsWith("tmp_");
    const noteTitle = (selectedNote?.title || editorTitle || "this note").trim();

    const proceed = window.confirm(`Delete "${noteTitle}"? This cannot be undone.`);
    if (!proceed) return;

    setIsDeleting(true);
    setError("");

    try {
      if (!isTemp) {
        await deleteNote(selectedId);
      }

      setNotes((prev) => prev.filter((n) => String(n.id) !== String(selectedId)));

      // Move selection
      const remaining = notes.filter((n) => String(n.id) !== String(selectedId));
      setSelectedId(remaining[0]?.id ?? null);
      setDirty(false);

      await refreshNotes({ preserveSelection: true });
    } catch (e) {
      setError(e?.message || "Failed to delete note.");
    } finally {
      setIsDeleting(false);
    }
  }

  const savingDisabled = isSaving || isDeleting || isLoadingList;
  const deleteDisabled = isSaving || isDeleting || isLoadingList || !selectedId;

  return (
    <div className="App notesApp">
      <header className="notesHeader">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            NOTE
          </div>
          <div className="brandText">
            <h1 className="brandTitle">Retro Notes</h1>
            <p className="brandSub">A lightweight split-pane notes app</p>
          </div>
        </div>

        <div className="headerActions" role="toolbar" aria-label="Notes actions">
          <button className="retroBtn" type="button" onClick={onNewNote}>
            New
          </button>
          <button
            className="retroBtn retroBtnPrimary"
            type="button"
            onClick={onSave}
            disabled={savingDisabled || !dirty}
            aria-disabled={savingDisabled || !dirty}
            title={dirty ? "Save changes" : "No changes to save"}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            className="retroBtn retroBtnDanger"
            type="button"
            onClick={onDelete}
            disabled={deleteDisabled}
            aria-disabled={deleteDisabled}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </header>

      <main className="notesMain" aria-label="Notes workspace">
        <section className="notesPane notesListPane" aria-label="Notes list">
          <div className="listTop">
            <label className="searchLabel">
              <span className="srOnly">Search notes</span>
              <input
                className="retroInput"
                type="search"
                placeholder="Search…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>

            <div className="listMeta" aria-live="polite">
              {isLoadingList ? "Loading…" : `${filteredNotes.length} note(s)`}
            </div>
          </div>

          {error ? (
            <div className="retroAlert" role="alert">
              <div className="retroAlertTitle">Something went wrong</div>
              <div className="retroAlertBody">{error}</div>
            </div>
          ) : null}

          <div className="notesList" role="list">
            {filteredNotes.length === 0 && !isLoadingList ? (
              <div className="emptyState">
                <div className="emptyTitle">No notes yet</div>
                <div className="emptyBody">Click “New” to create your first note.</div>
              </div>
            ) : null}

            {filteredNotes.map((n) => {
              const isActive = String(n.id) === String(selectedId);
              return (
                <button
                  key={String(n.id)}
                  type="button"
                  className={`noteRow ${isActive ? "active" : ""}`}
                  onClick={() => onSelectNote(n.id)}
                  role="listitem"
                  aria-current={isActive ? "true" : "false"}
                  title={n.title}
                >
                  <div className="noteRowTitle">{n.title || "Untitled"}</div>
                  <div className="noteRowPreview">{truncatePreview(n.content)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="notesPane notesEditorPane" aria-label="Note editor">
          <div className="editorTop">
            <div className="editorBadge" aria-hidden="true">
              EDITOR
            </div>
            <div className="editorHint" aria-live="polite">
              {selectedId ? (dirty ? "Unsaved changes" : "All changes saved") : "Select a note"}
            </div>
          </div>

          <div className="editorForm">
            <label className="field">
              <span className="fieldLabel">Title</span>
              <input
                className="retroInput"
                type="text"
                placeholder="Note title"
                value={editorTitle}
                onChange={(e) => {
                  setEditorTitle(e.target.value);
                  setDirty(true);
                }}
                disabled={!selectedId || isSaving || isDeleting}
              />
            </label>

            <label className="field fieldGrow">
              <span className="fieldLabel">Content</span>
              <textarea
                className="retroTextarea"
                placeholder="Write something…"
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setDirty(true);
                }}
                disabled={!selectedId || isSaving || isDeleting}
              />
            </label>
          </div>

          <div className="editorFooter">
            <div className="kbdHints" aria-label="Tips">
              <span className="kbdPill">
                Tip: Save often.
              </span>
              <span className="kbdPill">
                Retro vibes included.
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
