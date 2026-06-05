import { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { FormulaFunction, FORMULA_VARIABLES } from './constants'
import { addVariableEffect } from './variableHighlight'

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

const variableCompletions = FORMULA_VARIABLES.map((v) => ({
  label: v.name,
  type: 'variable',
  detail: v.label,
  info: `${v.path} (${v.type})`,
  apply(view: EditorView, completion: Completion, from: number, to: number) {
    const insertText = v.name
    const newTo = from + insertText.length
    view.dispatch({
      changes: [{ from, to, insert: insertText }],
      effects: [addVariableEffect.of({ from, to: newTo })],
      selection: { anchor: newTo, head: newTo }
    })
  },
}))

/** 创建公式补全源 */
export function createFormulaCompletionSource(functions: FormulaFunction[]): CompletionSource {
  const functionCompletions = createFunctionCompletions(functions)

  return (context: CompletionContext) => {
    const fnMatch = context.matchBefore(/[A-Za-z_][\w]*/)
    const varMatch = context.matchBefore(/[A-Za-z_][\w_.]*/)

    const match = fnMatch || varMatch
    if (!match && !context.explicit) return null

    const from = match ? match.from : context.pos
    const text = (match?.text || '').toUpperCase()

    const options: Completion[] = []

    if (text.length === 0 || /^[A-Z]/.test(match?.text || '') || context.explicit) {
      options.push(
        ...functionCompletions.filter(
          (c) => !text || c.label.toString().toUpperCase().startsWith(text)
        )
      )
    }

    options.push(
      ...variableCompletions.filter(
        (c) => !text || c.label.toString().toUpperCase().includes(text)
      )
    )

    if (options.length === 0) return null

    return {
      from,
      options,
      validFor: /^[\w.]*$/,
    }
  }
}

/** 默认的公式补全源（使用默认函数列表） */
export const formulaCompletionSource = createFormulaCompletionSource([])
