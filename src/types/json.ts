export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

// JSONB payloads may be objects or arrays; their application schema is not fixed yet.
export type JsonData = JsonObject | JsonValue[];
