import { ModelPicker } from "./ModelPicker.js";
import { usePersonalModelDefaults } from "../settings/usePersonalModelDefaults.js";
import type { ComponentProps } from "react";

export function ConversationModelPicker(
  props: Omit<ComponentProps<typeof ModelPicker>, "personal">,
) {
  const personal = usePersonalModelDefaults(props.ui, props.connection);
  return <ModelPicker {...props} personal={personal} />;
}
