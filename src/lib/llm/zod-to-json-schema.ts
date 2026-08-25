/**
 * Zod Schema ↔ JSON Schema 互转
 *
 * 取代 AI SDK 内置的 Zod → JSON Schema 自动转换。
 * 也包含从 tool-definitions.ts 迁入的 jsonSchemaToZod()。
 */

import {
  ZodType,
  ZodObject,
  ZodOptional,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodArray,
  ZodEnum,
  ZodLiteral,
  ZodNullable,
  ZodDefault,
  ZodEffects,
  ZodUnion,
  ZodNativeEnum
} from "zod"
import * as z from "zod"

// ═══════════════ Zod → JSON Schema ═══════════════

/**
 * 将 ZodType 转换为 JSON Schema 对象。
 * 支持 Lumino 工具中使用的常见 Zod 类型：
 * object, string, number, integer, boolean, array, enum, optional, nullable, default, effects
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  return processSchema(schema)
}

function processSchema(schema: ZodType): Record<string, unknown> {
  // ZodOptional → 解包底层类型
  if (schema instanceof ZodOptional) {
    return processSchema(schema.unwrap())
  }

  // ZodNullable → 底层类型 + nullable
  if (schema instanceof ZodNullable) {
    return { ...processSchema(schema.unwrap()), nullable: true }
  }

  // ZodDefault → 底层类型 + default 值
  if (schema instanceof ZodDefault) {
    const inner = processSchema(schema.removeDefault())
    const defaultVal = schema._def.defaultValue
    inner.default = typeof defaultVal === "function" ? defaultVal() : defaultVal
    return inner
  }

  // ZodEffects (refine / transform / pipe) → 解包内部类型
  if (schema instanceof ZodEffects) {
    return processSchema(schema.innerType())
  }

  // ZodObject
  if (schema instanceof ZodObject) {
    const shape = schema._def.shape() as Record<string, ZodType>
    const props: Record<string, Record<string, unknown>> = {}
    const required: string[] = []

    for (const [key, fieldSchema] of Object.entries(shape)) {
      let isOptional = false
      let unwrapped = fieldSchema

      if (fieldSchema instanceof ZodOptional) {
        isOptional = true
        unwrapped = fieldSchema.unwrap()
      }

      const fieldJsonSchema = processSchema(unwrapped)

      // 携带 Zod 的 description
      if (unwrapped.description) {
        fieldJsonSchema.description = unwrapped.description
      }

      props[key] = fieldJsonSchema
      if (!isOptional) required.push(key)
    }

    const result: Record<string, unknown> = { type: "object", properties: props }
    if (required.length > 0) result.required = required
    return result
  }

  // ZodString
  if (schema instanceof ZodString) {
    return { type: "string" }
  }

  // ZodNumber
  if (schema instanceof ZodNumber) {
    const checks = (schema._def.checks || []) as Array<{ kind: string }>
    const isInt = checks.some((c) => c.kind === "int")
    return { type: isInt ? "integer" : "number" }
  }

  // ZodBoolean
  if (schema instanceof ZodBoolean) {
    return { type: "boolean" }
  }

  // ZodEnum
  if (schema instanceof ZodEnum) {
    const values = schema.options as readonly string[]
    return { type: "string", enum: [...values] }
  }

  // ZodNativeEnum
  if (schema instanceof ZodNativeEnum) {
    const values = Object.values(schema.enum).filter((v) => typeof v === "string") as string[]
    return { type: "string", enum: values }
  }

  // ZodArray
  if (schema instanceof ZodArray) {
    const itemType = schema._def.type as ZodType
    return { type: "array", items: processSchema(itemType) }
  }

  // ZodLiteral
  if (schema instanceof ZodLiteral) {
    const val = schema._def.value
    if (typeof val === "string") return { type: "string", const: val }
    if (typeof val === "number") return { type: "number", const: val }
    if (typeof val === "boolean") return { type: "boolean", const: val }
    return { type: "string" }
  }

  // ZodUnion — 简化为 anyOf
  if (schema instanceof ZodUnion) {
    const options = schema._def.options as ZodType[]
    return { anyOf: options.map((o) => processSchema(o)) }
  }

  // 兜底
  return { type: "string" }
}

// ═══════════════ JSON Schema → Zod ═══════════════

/**
 * 将 JSON Schema 对象动态转换为 Zod schema。
 * 用于 Obsidian MCP 工具：服务端返回的 inputSchema 是 JSON Schema 格式，
 * 需要转换为 Zod schema 才能传给 luminoTool()。
 *
 * 支持的类型：object, string, number, integer, boolean, array, enum
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") return z.z.any()

  const s = schema as Record<string, unknown>
  const type = s.type as string

  if (type === "object") {
    const props = (s.properties || {}) as Record<string, Record<string, unknown>>
    const required = (s.required || []) as string[]
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, propSchema] of Object.entries(props)) {
      let field = jsonSchemaToZod(propSchema)
      if (propSchema.description) {
        field = field.describe(propSchema.description as string)
      }
      if (!required.includes(key)) {
        field = field.optional()
      }
      shape[key] = field
    }
    return z.z.object(shape)
  }

  if (type === "string") {
    if (s.enum) return z.z.enum(s.enum as [string, ...string[]])
    return z.z.string()
  }

  if (type === "number" || type === "integer") return z.z.number()
  if (type === "boolean") return z.z.boolean()
  if (type === "array") {
    const items = s.items as Record<string, unknown> | undefined
    return z.z.array(items ? jsonSchemaToZod(items) : z.z.any())
  }

  return z.z.any()
}