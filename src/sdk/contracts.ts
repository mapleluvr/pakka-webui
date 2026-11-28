import type { ComponentType } from "react";

/** UI references are opaque to the host and grant no service authority. */
export interface ResourceReference {
  readonly source: string;
  readonly type: string;
  readonly id: string;
  readonly version?: string;
}

export type UiValue =
  | null
  | boolean
  | number
  | string
  | readonly UiValue[]
  | { readonly [key: string]: UiValue };

export type SurfacePlacement = "page" | "panel" | "sheet" | "settings";

export interface ViewTarget {
  readonly plugin: string;
  readonly view: string;
  readonly resource?: ResourceReference;
  readonly input?: UiValue;
}

export type ResourceResolution =
  | {
      readonly status: "ready";
      readonly reference: ResourceReference;
      readonly view: ViewTarget;
    }
  | {
      readonly status: "unloaded";
      readonly reference: ResourceReference;
      readonly view?: ViewTarget;
    }
  | {
      readonly status:
        | "unavailable"
        | "forbidden"
        | "identity-mismatch"
        | "unsupported";
      readonly reference: ResourceReference;
      readonly message?: string;
    };

export interface UiNotice {
  /** Distinguishes otherwise identical feedback for different actions or targets in this instance. */
  readonly key?: string;
  readonly tone: "info" | "success" | "warning" | "error";
  readonly message: string;
}

export interface CommandTarget {
  readonly plugin: string;
  readonly command: string;
}

/** One open instance, not a global application object or a backend capability. */
export interface UiContext {
  readonly instanceId: string;
  readonly pluginId: string;
  readonly generation: string;
  readonly resource?: ResourceReference;
  /** Cancels UI subscriptions/reads; it is not cancellation of accepted service work. */
  readonly signal: AbortSignal;
  notice(notice: UiNotice): void;
  open(target: ViewTarget, placement?: SurfacePlacement): Promise<string>;
  navigate(reference: ResourceReference): Promise<ResourceResolution>;
  dispatch(target: CommandTarget, argumentsText: string): Promise<void>;
  close(): void;
  /** Cleanup must be synchronous; already disposed instances run it immediately. */
  onDispose(cleanup: () => void): () => void;
}

export interface UiViewProps<Bindings = undefined> {
  readonly ui: UiContext;
  /** Supplied explicitly by the integration/composition root, never discovered by the UI host. */
  readonly bindings: Bindings;
  readonly input?: UiValue;
}

export interface UiView<Bindings = undefined> {
  readonly id: string;
  readonly title: string;
  readonly placement: SurfacePlacement;
  readonly render: ComponentType<UiViewProps<Bindings>>;
  readonly resourceTypes?: readonly {
    readonly source: string;
    readonly type: string;
  }[];
  readonly navigation?: boolean;
}

export interface UiCommand<Bindings = undefined> {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  run(
    props: UiViewProps<Bindings>,
    argumentsText: string,
  ): void | Promise<void>;
}

export interface UiRuntimeRequirement {
  readonly api: 1;
  /** Explicit build-time requirement; do not infer it from the currently loaded SDK. */
  readonly runtime: "react19-astryx0.7.15";
}

export interface UiPlugin<Bindings = undefined> extends UiRuntimeRequirement {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly views: readonly UiView<Bindings>[];
  readonly commands?: readonly UiCommand<Bindings>[];
}
