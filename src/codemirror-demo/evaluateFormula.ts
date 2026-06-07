import { HyperFormula } from 'hyperformula'

import { mockVariablesValue } from '../mock'
import { FORMULA_VARIABLES } from './constants'
import { variableDictionary } from './variableDictionary'

/** 从 mock 数据按路径取值 */
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

let hfInstance: HyperFormula | null = null

function getEngine(): HyperFormula {
  if (!hfInstance) {
    // buildEmpty 不会创建任何 sheet，需先 addSheet 才能使用 sheet: 0
    hfInstance = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
    })
    hfInstance.addSheet('Sheet1')

    for (const v of FORMULA_VARIABLES) {
      const value = getValueByPath(mockVariablesValue as Record<string, unknown>, v.path)
      const primitive =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      if (primitive) {
        hfInstance.addNamedExpression(v.name, value)
      }
    }
  }
  return hfInstance
}

/**
 * 处理公式中的反引号标记变量
 * 只检测公式语法合法性，不计算真实结果：
 * - 字典中能映射到的变量 → 替换为 1
 * - 字典中映射不到的非法变量 → 保持原样不替换（让 HyperFormula 报错）
 */
function processBacktickVariables(formula: string): string {
  return formula.replace(/`([^`]+)`/g, (_match, variableName) => {
    // 只替换字典中真实存在的变量
    if (variableDictionary.hasDisplayName(variableName)) {
      console.log('✅ Valid variable:', variableName, '-> replaced with 1')
      return '1'
    }
    // 非法输入不替换，保持原样
    console.log('⚠️ Invalid variable:', variableName, '-> kept as is')
    return _match
  })
}

export interface EvaluateResult {
  ok: boolean
  value?: unknown
  error?: string
}

/** 用 HyperFormula 计算 Excel 风格公式（以 = 开头或不以 = 开头均可） */
export function evaluateFormula(formula: string): EvaluateResult {
  const trimmed = formula.trim()
  if (!trimmed) {
    return { ok: true, value: undefined }
  }

  // 处理反引号标记的变量
  const processedFormula = processBacktickVariables(trimmed)
  console.log('📝 Original formula:', trimmed)
  console.log('📝 Processed formula:', processedFormula)

  const expression = processedFormula.startsWith('=') ? processedFormula : `=${processedFormula}`

  try {
    const hf = getEngine()
    const address = { sheet: 0, row: 0, col: 0 }

    hf.setCellContents(address, [[expression]])
    const value = hf.getCellValue(address)

    if (value && typeof value === 'object' && 'type' in value) {
      const err = value as { type: string; message?: string }
      return { ok: false, error: err.message || err.type }
    }

    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
