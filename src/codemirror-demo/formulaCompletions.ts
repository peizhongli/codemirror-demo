import { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'

import { FormulaFunction } from './constants'

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

/** 创建公式补全源（只包含函数，不包含变量） */
export function createFormulaCompletionSource(functions: FormulaFunction[]): CompletionSource {
  const functionCompletions = createFunctionCompletions(functions)

  return (context: CompletionContext) => {
    // 只匹配函数名（以大写字母开头）
    const fnMatch = context.matchBefore(/[A-Za-z_][\w]*/)

    const match = fnMatch
    if (!match && !context.explicit) return null

    const from = match ? match.from : context.pos
    const text = (match?.text || '')

    const options: Completion[] = []

    // 只添加函数补全（任何输入都匹配，不区分大小写）
    options.push(
      ...functionCompletions.filter(
        (c: Completion) => !text || c.label.toString().toUpperCase().startsWith(text.toUpperCase())
      )
    )

    if (options.length === 0) return null

    return {
      from,
      options,
      validFor: /^[\w]*$/,
    }
  }
}

/** 默认的公式补全源（使用默认函数列表） */
export const formulaCompletionSource = createFormulaCompletionSource([])