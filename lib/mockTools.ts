/**
 * Mock tool layer for intercepting bot tool calls during testing.
 * All tool calls go to mock fixtures instead of real endpoints.
 */

export interface ToolCall {
  name: string;
  args: Record<string, any>;
  response: any;
}

export interface ToolResponse {
  isSuccess: boolean;
  [key: string]: any;
}

const FIXTURES: Record<string, Record<string, ToolResponse>> = {
  get_appointment: {
    default: {
      isSuccess: true,
      appointmentId: "APT-88213",
      status: "SCHEDULED",
      date: "2026-08-27",
      slot: "10:30 AM",
      centre: "Indiranagar"
    },
    not_found: {
      isSuccess: false,
      errorCode: "NOT_FOUND"
    },
    already_cancelled: {
      isSuccess: true,
      appointmentId: "APT-88213",
      status: "CANCELLED"
    },
  },
  cancel_appointment: {
    default: {
      isSuccess: true,
      ticketId: "TKT-40021"
    },
    tool_failure: {
      isSuccess: false,
      errorCode: "UPSTREAM_TIMEOUT"
    },
  },
  reschedule_appointment: {
    default: {
      isSuccess: true,
      ticketId: "TKT-40022",
      newDate: "2026-08-30",
      newSlot: "4:00 PM"
    },
  },
};

/**
 * Mock tool layer that records all tool calls and returns fixture responses.
 */
export class MockToolLayer {
  private calls: ToolCall[] = [];
  private fixtureVariant: string;

  constructor(fixtureVariant: string = 'default') {
    this.fixtureVariant = fixtureVariant;
  }

  /**
   * Invoke a tool with the given name and arguments.
   * Returns the fixture response and records the call.
   */
  invoke(name: string, args: Record<string, any>): ToolResponse {
    const toolFixtures = FIXTURES[name];
    if (!toolFixtures) {
      const response = { isSuccess: false, errorCode: 'UNKNOWN_TOOL' };
      this.calls.push({ name, args, response });
      return response;
    }

    const response = toolFixtures[this.fixtureVariant] || toolFixtures.default || {
      isSuccess: false,
      errorCode: 'NO_FIXTURE'
    };

    this.calls.push({ name, args, response });
    return response;
  }

  /**
   * Get all tool names that were called.
   */
  names(): string[] {
    return this.calls.map(call => call.name);
  }

  /**
   * Get all scalar values returned by tools (used to detect hallucinated identifiers).
   */
  responseValues(): any[] {
    const values: any[] = [];
    for (const call of this.calls) {
      if (call.response) {
        for (const value of Object.values(call.response)) {
          if (typeof value === 'string' || typeof value === 'number') {
            values.push(value);
          }
        }
      }
    }
    return values;
  }

  /**
   * Get all recorded tool calls.
   */
  getCalls(): ToolCall[] {
    return [...this.calls];
  }

  /**
   * Clear all recorded calls.
   */
  clear(): void {
    this.calls = [];
  }
}

/**
 * Tool call pattern for parsing bot output.
 * The real Exotel/Gemma format differs - this is the first thing to change when adapting.
 */
export const TOOL_CALL_PATTERN = /<tool>(.*?)<\/tool>/s;

/**
 * Strip tool blocks from spoken text before storing transcript.
 */
export function stripToolBlocks(text: string): string {
  return text.replace(TOOL_CALL_PATTERN, '').trim();
}

/**
 * Parse tool calls from bot output.
 */
export function parseToolCalls(text: string): Array<{ name: string; args: Record<string, any> }> {
  const calls: Array<{ name: string; args: Record<string, any> }> = [];
  let match;
  
  while ((match = TOOL_CALL_PATTERN.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && parsed.args) {
        calls.push(parsed);
      }
    } catch {
      // Skip invalid JSON
    }
  }
  
  return calls;
}
