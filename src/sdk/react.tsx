import { createContext, useContext, type ReactNode } from "react";
import type { UiContext } from "./contracts.js";

const InstanceContext = createContext<UiContext | null>(null);

/** The shared SDK module owns this context, not an individual plugin bundle. */
export function UiContextProvider(props: {
  readonly value: UiContext;
  readonly children: ReactNode;
}) {
  return (
    <InstanceContext.Provider value={props.value}>
      {props.children}
    </InstanceContext.Provider>
  );
}

export function useUiContext(): UiContext {
  const context = useContext(InstanceContext);
  if (!context) throw new Error("This view needs a UI host instance");
  return context;
}
