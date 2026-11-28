import { useSyncExternalStore } from "react";
import type { PakkaConnection } from "../../integrations/pakka/connection.js";

export function usePeopleSettings(connection: PakkaConnection) {
  return useSyncExternalStore(
    connection.subscribePeopleSettings,
    () => connection.peopleSettings,
  );
}
