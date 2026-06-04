import { EditorState } from '@codemirror/state'
import { FormulaFunction } from './constants'

/**
 * 解析函数签名，提取参数列表
 * @param signature 函数签名，如 "SUM(数值 1, 数值 2, ...)"
 * @returns 参数列表，如 ["数值 1", "数值 2", "..."]
 */
export function parseSignature(signature: string): string[] {
  // 提取括号内的内容
  const match = signature.match(/\((.*)\)/)
  if (!match) return []
  
  const content = match[1]
  const params: string[] = []
  let currentParam = ''
  let depth = 0
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    
    if (char === '(') {
      depth++
      currentParam += char
    } else if (char === ')') {
      depth--
      currentParam += char
    } else if (char === ',' && depth === 0) {
      params.push(currentParam.trim())
      currentParam = ''
    } else {
      currentParam += char
    }
  }
  
  if (currentParam.trim()) {
    params.push(currentParam.trim())
  }
  
  return params
}

/**
 * 获取光标所在的函数参数索引
 * @param state 编辑器状态
 * @param cursorPos 光标位置
 * @returns { fnName: string, paramIndex: number, totalParams: number } | null
 */
export function getCurrentParamIndex(state: EditorState, cursorPos: number): { fnName: string; paramIndex: number; totalParams: number } | null {
  const text = state.doc.toString()
  
  // 从光标位置向左查找最近的左括号
  let openParenPos = -1
  let depth = 0
  
  for (let i = cursorPos - 1; i >= 0; i--) {
    const char = text[i]
    if (char === ')') {
      depth++
    } else if (char === '(') {
      if (depth > 0) {
        depth--
      } else {
        openParenPos = i
        break
      }
    }
  }
  
  if (openParenPos === -1) return null
  
  // 从左括号位置向左查找函数名
  let fnStart = openParenPos - 1
  while (fnStart >= 0 && /[a-zA-Z0-9_]/.test(text[fnStart])) {
    fnStart--
  }
  
  const fnName = text.slice(fnStart + 1, openParenPos)
  
  if (!fnName) return null
  
  // 找到对应的右括号位置
  let closeParenPos = openParenPos + 1
  depth = 1
  while (closeParenPos < text.length && depth > 0) {
    const char = text[closeParenPos]
    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
    }
    closeParenPos++
  }
  closeParenPos-- // 回到右括号的位置
  
  // 如果光标在右括号位置或之后，不进行高亮
  if (cursorPos > closeParenPos) {
    return null
  }
  
  // 如果光标在函数名上（不包括左括号），不高亮
  if (cursorPos < openParenPos) {
    return null
  }
  
  // 计算光标在函数参数中的位置：统计从左括号到光标位置之间的逗号数量
  let paramIndex = 0
  depth = 0
  let inString = false
  
  for (let i = openParenPos + 1; i < cursorPos; i++) {
    const char = text[i]
    
    if (char === '"') {
      inString = !inString
    }
    
    if (!inString) {
      if (char === '(') {
        depth++
      } else if (char === ')') {
        depth--
      } else if (char === ',' && depth === 0) {
        paramIndex++
      }
    }
  }
  
  return {
    fnName: fnName.toUpperCase(),
    paramIndex,
    totalParams: -1
  }
}

/**
 * 根据函数定义和参数索引获取应该高亮的参数名称
 * @param fn 函数定义
 * @param paramIndex 当前参数索引
 * @returns 应该高亮的参数名称，如果没有则返回 null
 */
export function getHighlightedParam(fn: FormulaFunction, paramIndex: number): string | null {
  const params = parseSignature(fn.signature)
  
  if (params.length === 0) return null
  
  // 如果参数索引小于参数列表长度，返回对应的参数
  if (paramIndex < params.length) {
    return params[paramIndex]
  }
  
  // 如果有可变参数（以...结尾），返回可变参数标记
  const lastParam = params[params.length - 1]
  if (lastParam && lastParam.includes('...')) {
    return lastParam
  }
  
  return null
}
