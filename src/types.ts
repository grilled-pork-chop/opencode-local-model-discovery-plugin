/** Input provided by OpenCode when initializing the plugin. */
export interface PluginInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  directory?: string
  [key: string]: unknown
}

/**
 * Async callback invoked by OpenCode each time it loads its configuration.
 * Implementations must mutate `config` in place; the return value is ignored.
 *
 * @param config - The raw, mutable config object. Shape is opaque.
 * @returns A promise that resolves when all mutations are complete.
 */
export type ConfigHook = (config: unknown) => Promise<void>

/**
 * The object a plugin must return from its factory function.
 * OpenCode calls `config` on every configuration load.
 */
export interface PluginOutput {
  config: ConfigHook
}

/** Factory function signature for an OpenCode plugin. */
export type Plugin = (input: PluginInput) => Promise<PluginOutput>
