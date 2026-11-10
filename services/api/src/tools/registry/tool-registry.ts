import type { NexusTool, ToolRisk } from '../contracts/tool.interface.js';

type RegisteredTool = NexusTool<any, any>;

export interface ToolDescriptor {
  name: string;
  version: string;
  description: string;
  risk: ToolRisk;
  requiredPermissions: readonly string[];
}

export class ToolAlreadyRegisteredError extends Error {
  constructor(name: string, version: string) {
    super(`Tool ${name}@${version} is already registered.`);
    this.name = 'ToolAlreadyRegisteredError';
  }
}

export class ToolNotRegisteredError extends Error {
  constructor(name: string, version: string) {
    super(`Tool ${name}@${version} is not registered.`);
    this.name = 'ToolNotRegisteredError';
  }
}

const TOOL_NAME = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function toolKey(name: string, version: string): string {
  return `${name}@${version}`;
}

/**
 * In-process registry populated only by trusted application bootstrap code.
 * Dynamic registration from requests, LLM output, or event payloads is forbidden.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register<TInput, TOutput>(tool: NexusTool<TInput, TOutput>): void {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error('INVALID_TOOL_NAME');
    }
    if (!SEMVER.test(tool.version)) {
      throw new Error('INVALID_TOOL_VERSION');
    }
    if (!tool.description.trim()) {
      throw new Error('INVALID_TOOL_DESCRIPTION');
    }
    if (!Array.isArray(tool.requiredPermissions) ||
        tool.requiredPermissions.some((permission) => !permission.trim())) {
      throw new Error('INVALID_TOOL_PERMISSIONS');
    }

    const key = toolKey(tool.name, tool.version);
    if (this.tools.has(key)) {
      throw new ToolAlreadyRegisteredError(tool.name, tool.version);
    }

    const registered = Object.freeze({
      ...tool,
      requiredPermissions: Object.freeze([...new Set(tool.requiredPermissions)])
    }) as RegisteredTool;

    this.tools.set(key, registered);
  }

  get<TInput = unknown, TOutput = unknown>(
    name: string,
    version: string
  ): NexusTool<TInput, TOutput> {
    const tool = this.tools.get(toolKey(name, version));
    if (!tool) throw new ToolNotRegisteredError(name, version);
    return tool as NexusTool<TInput, TOutput>;
  }

  has(name: string, version: string): boolean {
    return this.tools.has(toolKey(name, version));
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()]
      .map((tool) => ({
        name: tool.name,
        version: tool.version,
        description: tool.description,
        risk: tool.risk,
        requiredPermissions: [...tool.requiredPermissions]
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  }
}
