import { useState, type KeyboardEvent } from "react";

export interface KeyboardReorderControls {
  readonly activeId: string | null;
  readonly announcement: string;
  readonly onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    id: string,
    label: string,
  ) => void;
}

export function useKeyboardReorder(
  ids: readonly string[],
  onMove: (activeId: string, overId: string) => void,
): KeyboardReorderControls {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function onKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    id: string,
    label: string,
  ) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (activeId === id) {
        setActiveId(null);
        setAnnouncement(`${label} dropped.`);
      } else {
        setActiveId(id);
        setAnnouncement(
          `${label} picked up. Use the up and down arrow keys to move it.`,
        );
      }
      return;
    }

    if (activeId !== id) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActiveId(null);
      setAnnouncement(`Reordering ${label} cancelled.`);
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = ids.indexOf(id);
    const offset = event.key === "ArrowUp" ? -1 : 1;
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ids.length) {
      setAnnouncement(`${label} is already at the end of the list.`);
      return;
    }

    onMove(id, ids[targetIndex]!);
    setAnnouncement(`${label} moved to position ${targetIndex + 1}.`);
  }

  return { activeId, announcement, onKeyDown };
}
