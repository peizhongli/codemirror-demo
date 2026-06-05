import { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'

import { FormulaFunction } from './constants'
import { addVariableEffect } from './variableHighlight'
import { variableDictionary } from './variableDictionary'

/** 创建函数补全选项 */
export function createFunctionCompletions(functions: FormulaFunction[]): Completion[] {
  return functions.map((fn) => ({
    label: fn.name,
    type: 'function',
    detail: fn.label,
    info: () => {
      const div = document.createElement('div')
      div.style.padding = '4px 0'
      div.innerHTML = `<strong>${fn.signature}</strong><br/><span style="color:#666">${fn.detail}</span>`
      return div
    },
    apply(view: EditorView, completion: Completion, from: number, to: number) {
      const insertText = `${fn.name}()`
      view.dispatch({
        changes: [{ from, to, insert: insertText }],
        selection: { anchor: from + fn.name.length + 1, head: from + fn.name.length + 1 }
      })
    },
  }))
}

// 从动态字典中获取变量补全选项
const getVariableCompletions = (): Completion[] => {
  const elements = variableDictionary.getAllElements()
  return elements.map((element) => {
    const displayName = variableDictionary.getDisplayNameByCode(element.code)!
    return {
      label: displayName,
      type: 'variable',
      detail: element.variableName,
      info: `${element.dictName} (${element.type || 'unknown'})`,
      apply(view: EditorView, _completion: Completion, from: number, to: number) {
        const insertText = displayName
        const newTo = from + insertText.length
        view.dispatch({
          changes: [{ from, to, insert: insertText }],
          effects: [addVariableEffect.of({ from, to: newTo })],
          selection: { anchor: newTo, head: newTo }
        })
      },
    }
  })
}

/** 创建公式补全源 */
export function createFormulaCompletionSource(functions: FormulaFunction[]): CompletionSource {
  const functionCompletions = createFunctionCompletions(functions)

  return (context: CompletionContext) => {
    // 支持中文字符的正则表达式
    const fnMatch = context.matchBefore(/[A-Za-z_][\w]*/)
    const varMatch = context.matchBefore(/[\u4e00-\u9fa5a-zA-Z_][\u4e00-\u9fa5\w_.·]*/)

    const match = fnMatch || varMatch
    if (!match && !context.explicit) return null

    const from = match ? match.from : context.pos
    const text = (match?.text || '')

    const options: Completion[] = []

    if (text.length === 0 || /^[A-Z]/.test(match?.text || '') || context.explicit) {
      options.push(
        ...functionCompletions.filter(
          (c: Completion) => !text || c.label.toString().toUpperCase().startsWith(text.toUpperCase())
        )
      )
    }

    options.push(
      ...getVariableCompletions().filter(
        (c: Completion) => !text || c.label.toString().includes(text)
      )
    )

    if (options.length === 0) return null

    return {
      from,
      options,
      validFor: /^[\u4e00-\u9fa5\w_.·]*$/,
    }
  }
}

/** 默认的公式补全源（使用默认函数列表） */
export const formulaCompletionSource = createFormulaCompletionSource([])
