import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { SearchCursor } from "../../integrations/pakka/content.js";

export type ReadingAnchor = { index: number; offset: number };
export type OriginalPosition = {
  offset: number;
  back: number[];
  query: string;
  cursor: { query: string; value: SearchCursor };
  scroll: number;
  anchor: ReadingAnchor | null;
};
const freshPosition = (): OriginalPosition => ({
  offset: 0,
  back: [],
  query: "",
  cursor: { query: "", value: { offset: 0, index: 0 } },
  scroll: 0,
  anchor: null,
});
type ReadingMemory = {
  open: Map<string, boolean>;
  originals: Map<string, OriginalPosition>;
};
type ReadingScope = ReadingMemory & {
  original: string | null;
  setOriginal: Dispatch<SetStateAction<string | null>>;
  controls: HTMLElement | null;
};
const ReadingContext = createContext<ReadingScope | null>(null);

/** View-local control positions only. Body bytes never enter storage or this retained map. */
export function ReadingState({
  children,
  controls = null,
  followRevision = 0,
}: {
  children: ReactNode;
  controls?: HTMLElement | null;
  followRevision?: number;
}) {
  const [memory] = useState<ReadingMemory>(() => ({
    open: new Map(),
    originals: new Map(),
  }));
  const [original, setOriginal] = useState<string | null>(null);
  useEffect(() => {
    if (followRevision > 0) setOriginal(null);
  }, [followRevision]);
  const scope = useMemo(
    () => ({ ...memory, original, setOriginal, controls }),
    [memory, original, controls],
  );
  return (
    <ReadingContext.Provider value={scope}>{children}</ReadingContext.Provider>
  );
}
export function useReadingControls() {
  return useContext(ReadingContext)?.controls ?? null;
}
export function useOriginalDisclosure(key: string) {
  const scope = useContext(ReadingContext);
  const [local, setLocal] = useState(false);
  return [
    scope ? scope.original === key : local,
    (value: boolean) => {
      if (scope)
        scope.setOriginal((current) =>
          value ? key : current === key ? null : current,
        );
      else setLocal(value);
    },
  ] as const;
}
function trim<T>(map: Map<string, T>) {
  while (map.size > 256) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}
export function useDisclosure(key: string) {
  const memory = useContext(ReadingContext);
  const [open, setOpen] = useState(() => memory?.open.get(key) ?? false);
  return [
    open,
    (value: boolean) => {
      if (memory) {
        memory.open.set(key, value);
        trim(memory.open);
      }
      setOpen(value);
    },
  ] as const;
}
export function useOriginalPosition(key: string) {
  const memory = useContext(ReadingContext);
  const [position] = useState(() => {
    const saved = memory?.originals.get(key) ?? freshPosition();
    if (memory) {
      memory.originals.set(key, saved);
      trim(memory.originals);
    }
    return saved;
  });
  return position;
}
