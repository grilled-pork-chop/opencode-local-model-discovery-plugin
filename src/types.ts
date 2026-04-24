/** Input provided by OpenCode when initializing the plugin. */
export interface PluginInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  directory?: string
  [key: string]: unknown
}

/** Async function called by OpenCode each time it loads its configuration. */
export type ConfigHook = (config: unknown) => Promise<void>

export interface PluginOutput {
  config: ConfigHook
}

/** Factory function signature for an OpenCode plugin. */
export type Plugin = (input: PluginInput) => Promise<PluginOutput>
