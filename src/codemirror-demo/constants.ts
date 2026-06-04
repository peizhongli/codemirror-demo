import { mockVariablesDefine } from '../mock'

/** 公式函数（Excel / 飞书多维表格常见语法） */
export interface FormulaFunction {
  name: string
  label: string
  signature: string
  detail: string
  category: string
}

/** 支持的函数类型 */
export type SupportedFunctionType = 'AVERAGE' | 'MAX' | 'MIN' | 'SUM'

/** 默认支持的函数列表 */
export const DEFAULT_SUPPORTED_FUNCTIONS: SupportedFunctionType[] = ['AVERAGE', 'MAX', 'MIN', 'SUM']

/** 完整的函数定义 */
const ALL_FORMULA_FUNCTIONS: FormulaFunction[] = [
  { name: 'IF', label: '条件判断', signature: 'IF(条件，真值，假值)', detail: '根据条件返回不同结果', category: '逻辑' },
  { name: 'AND', label: '且', signature: 'AND(条件 1, 条件 2, ...)', detail: '所有条件均为真时返回 TRUE', category: '逻辑' },
  { name: 'OR', label: '或', signature: 'OR(条件 1, 条件 2, ...)', detail: '任一条件为真时返回 TRUE', category: '逻辑' },
  { name: 'NOT', label: '非', signature: 'NOT(条件)', detail: '对条件取反', category: '逻辑' },
  { name: 'SUM', label: '求和', signature: 'SUM(数值 1, 数值 2, ...)', detail: '对数值求和', category: '数学' },
  { name: 'AVERAGE', label: '平均值', signature: 'AVERAGE(数值 1, 数值 2, ...)', detail: '计算平均值', category: '数学' },
  { name: 'MAX', label: '最大值', signature: 'MAX(数值 1, 数值 2, ...)', detail: '返回最大值', category: '数学' },
  { name: 'MIN', label: '最小值', signature: 'MIN(数值 1, 数值 2, ...)', detail: '返回最小值', category: '数学' },
  { name: 'ROUND', label: '四舍五入', signature: 'ROUND(数值，小数位)', detail: '四舍五入到指定小数位', category: '数学' },
  { name: 'ABS', label: '绝对值', signature: 'ABS(数值)', detail: '返回绝对值', category: '数学' },
  { name: 'CONCATENATE', label: '拼接文本', signature: 'CONCATENATE(文本 1, 文本 2, ...)', detail: '将多个文本拼接', category: '文本' },
  { name: 'LEN', label: '文本长度', signature: 'LEN(文本)', detail: '返回文本字符数', category: '文本' },
  { name: 'UPPER', label: '转大写', signature: 'UPPER(文本)', detail: '将文本转为大写', category: '文本' },
  { name: 'LOWER', label: '转小写', signature: 'LOWER(文本)', detail: '将文本转为小写', category: '文本' },
  { name: 'TODAY', label: '今天', signature: 'TODAY()', detail: '返回当前日期', category: '日期' },
  { name: 'NOW', label: '当前时间', signature: 'NOW()', detail: '返回当前日期时间', category: '日期' },
]

/**
 * 根据支持的函数类型获取函数列表
 * @param supportedFunctions 支持的函数类型数组，默认为 ['AVERAGE', 'MAX', 'MIN', 'SUM']
 */
export function getFormulaFunctions(supportedFunctions: SupportedFunctionType[] = DEFAULT_SUPPORTED_FUNCTIONS): FormulaFunction[] {
  return ALL_FORMULA_FUNCTIONS.filter(fn => supportedFunctions.includes(fn.name as SupportedFunctionType))
}

export const FORMULA_FUNCTIONS = getFormulaFunctions()

export interface FormulaVariable {
  /** HyperFormula 命名表达式名（路径中的 . 替换为 _） */
  name: string
  /** 原始路径，如 first.deep1 */
  path: string
  label: string
  type: string
}

/** 将 mock 变量展平为可引用的命名变量 */
export function flattenVariables(
  define: Record<string, { type: string; label: string; prototype?: Record<string, unknown>; item?: unknown }>,
  prefix = ''
): FormulaVariable[] {
  const result: FormulaVariable[] = []

  for (const [key, desc] of Object.entries(define)) {
    const path = prefix ? `${prefix}.${key}` : key
    const name = path.replace(/\./g, '_')

    if (desc.type === 'object' && desc.prototype) {
      result.push(...flattenVariables(desc.prototype as typeof define, path))
    } else {
      result.push({
        name,
        path,
        label: desc.label,
        type: desc.type,
      })
    }
  }

  return result
}

export const FORMULA_VARIABLES = flattenVariables(
  mockVariablesDefine as Record<
    string,
    { type: string; label: string; prototype?: Record<string, unknown>; item?: unknown }
  >
)
