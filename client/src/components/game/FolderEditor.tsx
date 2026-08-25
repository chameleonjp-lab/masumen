import { useMemo, useState } from "react";
import "./FolderEditor.css";
import { CARD_CATALOG } from "@/game/deck";
import {
  activeFolder,
  cloneFolder,
  createStandardFolder,
  loadSaveData,
  saveSaveData,
  validateFolder,
  type SaveDataV1,
  type SavedFolder,
} from "@/game/folder";
import { getAllowedCodes, getFolderCardClass } from "@/game/data/cardCodes";
import type { ConnectionCode, FolderCardClass } from "@/game/types";

type CatalogFilter = "すべて" | FolderCardClass;

interface FolderEditorProps {
  onClose: () => void;
  onSaved: () => void;
}

const FILTERS: CatalogFilter[] = ["すべて", "standard", "upper", "trump"];
const FILTER_LABELS: Record<CatalogFilter, string> = {
  すべて: "すべて",
  standard: "標準",
  upper: "上位",
  trump: "切札",
  overload: "過負荷",
};
const CLASS_LABELS: Record<FolderCardClass, string> = {
  standard: "標準",
  upper: "上位",
  trump: "切札",
  overload: "過負荷",
};

function updateFolder(
  data: SaveDataV1,
  folderId: string,
  update: (folder: SavedFolder) => SavedFolder
): SaveDataV1 {
  return {
    ...data,
    folders: data.folders.map(folder =>
      folder.id === folderId ? update(folder) : folder
    ),
  };
}

export default function FolderEditor({ onClose, onSaved }: FolderEditorProps) {
  const [saveData, setSaveData] = useState(() => loadSaveData());
  const [folderId, setFolderId] = useState(saveData.activeFolderId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("すべて");
  const [notice, setNotice] = useState("");
  const folder = saveData.folders.find(item => item.id === folderId) ?? activeFolder(saveData);
  const validation = validateFolder(folder);

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return CARD_CATALOG.filter(card => {
      const cardClass = getFolderCardClass(card);
      const matchesFilter = filter === "すべて" || cardClass === filter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [card.name, card.id, card.family, card.code, ...getAllowedCodes(card)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  const commonCodes = useMemo(() => {
    const counts = new Map<ConnectionCode, number>();
    folder.cards.forEach(entry => counts.set(entry.code, (counts.get(entry.code) ?? 0) + 1));
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([code]) => code)
      .join(" / ");
  }, [folder.cards]);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    folder.cards.forEach(entry => {
      const card = CARD_CATALOG.find(item => item.id === entry.cardId);
      if (card) counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([name]) => name)
      .slice(0, 3)
      .join(" / ");
  }, [folder.cards]);

  function apply(next: SaveDataV1): void {
    setSaveData(next);
    setNotice("");
  }

  function addCard(cardId: string): void {
    if (folder.cards.length >= 30) {
      setNotice("フォルダは30枚です。先にカードを削除してください。");
      return;
    }
    const card = CARD_CATALOG.find(item => item.id === cardId);
    if (!card) return;
    const next = updateFolder(saveData, folder.id, current => ({
      ...current,
      cards: [
        ...current.cards,
        {
          instanceId: (() => {
            const usedIds = new Set(current.cards.map(entry => entry.instanceId));
            let serial = current.cards.length + 1;
            while (usedIds.has(`${current.id}-${serial}`)) serial += 1;
            return `${current.id}-${serial}`;
          })(),
          cardId,
          code: getAllowedCodes(card)[0] ?? "*",
        },
      ],
    }));
    apply(next);
  }

  function removeCard(instanceId: string): void {
    apply(
      updateFolder(saveData, folder.id, current => ({
        ...current,
        cards: current.cards.filter(entry => entry.instanceId !== instanceId),
      }))
    );
  }

  function changeCode(instanceId: string, code: ConnectionCode): void {
    apply(
      updateFolder(saveData, folder.id, current => ({
        ...current,
        cards: current.cards.map(entry =>
          entry.instanceId === instanceId ? { ...entry, code } : entry
        ),
      }))
    );
  }

  function restoreStandard(): void {
    const standard = createStandardFolder(folder.id);
    apply(updateFolder(saveData, folder.id, current => ({ ...standard, name: current.name })));
    setNotice("標準フォルダの内容へ戻しました。保存ボタンで確定します。");
  }

  function duplicate(): void {
    const target = saveData.folders.find(item => item.id !== folder.id && item.id !== "standard");
    if (!target) {
      setNotice("複製先のフォルダ枠がありません。");
      return;
    }
    const copied = cloneFolder(folder, target.id, target.name);
    apply({
      ...saveData,
      folders: saveData.folders.map(item => (item.id === target.id ? copied : item)),
    });
    setFolderId(target.id);
    setNotice(`${target.name}へ複製しました。保存ボタンで確定します。`);
  }

  function save(): void {
    if (!validation.valid) {
      setNotice(validation.errors[0] ?? "フォルダを確認してください。");
      return;
    }
    const next = { ...saveData, activeFolderId: folder.id };
    saveSaveData(next);
    setSaveData(next);
    setNotice("フォルダを保存しました。");
    onSaved();
  }

  return (
    <section className="folder-editor" aria-modal="true" role="dialog" aria-label="フォルダ編集">
      <div className="folder-editor-panel">
        <header className="folder-editor-header">
          <div>
            <p className="eyebrow">CARD FOLDER / 30 SLOTS</p>
            <h2>フォルダ編集</h2>
            <span>使用する30枚と接続コードを準備します。</span>
          </div>
          <button type="button" className="folder-close" onClick={onClose} aria-label="フォルダ編集を閉じる">
            ×
          </button>
        </header>

        <nav className="folder-tabs" aria-label="フォルダ枠">
          {saveData.folders.map(item => (
            <button
              type="button"
              key={item.id}
              className={item.id === folder.id ? "is-active" : ""}
              onClick={() => {
                setFolderId(item.id);
                setNotice("");
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>

        <div className="folder-editor-grid">
          <section className="folder-list-panel">
            <div className="folder-list-heading">
              <div>
                <b>{folder.name}</b>
                <span>{folder.cards.length} / 30枚</span>
              </div>
              <div className="folder-actions">
                <button type="button" onClick={restoreStandard} disabled={folder.id === "standard"}>
                  標準へ戻す
                </button>
                <button type="button" onClick={duplicate}>
                  複製
                </button>
              </div>
            </div>
            <div className="folder-validation" role="status">
              {validation.valid ? (
                <span className="is-valid">検査済み — 戦闘を開始できます</span>
              ) : (
                validation.errors.map(error => <span key={error}>{error}</span>)
              )}
            </div>
            <div className="folder-connection-summary">
              <b>連結候補</b>
              <span>同じコード: {commonCodes || "なし"}</span>
              <span>同名カード: {duplicateNames || "なし"}</span>
            </div>
            <ol className="folder-slots">
              {folder.cards.map((entry, index) => {
                const card = CARD_CATALOG.find(item => item.id === entry.cardId);
                if (!card) return null;
                const allowedCodes = getAllowedCodes(card);
                return (
                  <li key={entry.instanceId}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{card.name}</strong>
                    <small>{card.family}</small>
                    <select
                      value={entry.code}
                      onChange={event => changeCode(entry.instanceId, event.target.value as ConnectionCode)}
                      aria-label={`${card.name}の接続コード`}
                    >
                      {allowedCodes.map(code => <option key={code} value={code}>コード {code}</option>)}
                    </select>
                    <button type="button" onClick={() => removeCard(entry.instanceId)} aria-label={`${card.name}を削除`}>
                      削除
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="catalog-panel">
            <div className="catalog-tools">
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="名前・属性・特性・コードで検索"
                aria-label="カード検索"
              />
              <div className="catalog-filters" role="group" aria-label="カード分類">
                {FILTERS.map(item => (
                  <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
                    {FILTER_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
            <div className="catalog-grid">
              {visibleCards.map(card => {
                const cardClass = getFolderCardClass(card);
                const allowedCodes = getAllowedCodes(card);
                return (
                  <button type="button" className={`catalog-card class-${cardClass}`} key={card.id} onClick={() => addCard(card.id)}>
                    <span>{CLASS_LABELS[cardClass]}</span>
                    <strong>{card.name}</strong>
                    <small>{card.family} / {allowedCodes.join("・")}</small>
                    <em>追加</em>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="folder-editor-footer">
          <span>{notice || "同名または接続条件がそろったカードだけ、まとめて送信できます。"}</span>
          <div>
            <button type="button" onClick={onClose}>戻る</button>
            <button type="button" className="engage-button" onClick={save} disabled={!validation.valid}>
              保存して使用 <span>↗</span>
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
