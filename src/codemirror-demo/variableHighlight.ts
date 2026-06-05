import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { FORMULA_VARIABLES } from './constants'

// 创建一个标记变量的 decoration 类型
const variableDecoration = Decoration.mark({
  class: 'cm-formula-variable',
})

// 定义状态效果类型（导出供其他模块使用）
export const addVariableEffect = StateEffect.define<{ from: number; to: number }>()
const removeVariableEffect = StateEffect.define<{ from: number; to: number }>()
const clearVariablesEffect = StateEffect.define()

// 创建状态字段来跟踪变量位置
// 变量只能通过点选插入，手动输入的一定不是变量
// 所以变量位置是固定的，不受文档变化影响
const variableState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    // 先调整现有 decoration 的位置以适应文档变化
    if (tr.docChanged) {
      value = value.map(tr.changes)
    }
    
    // 然后处理 effects
    for (const effect of tr.effects) {
      if (effect.is(addVariableEffect)) {
        const builder = new RangeSetBuilder<Decoration>()
        value.between(0, tr.newDoc.length, (from, to, decoration) => {
          builder.add(from, to, decoration)
        })
        builder.add(effect.value.from, effect.value.to, variableDecoration)
        value = builder.finish()
      } else if (effect.is(removeVariableEffect)) {
        value = value.update({
          filter: (from, to) => !(from === effect.value.from && to === effect.value.to)
        })
      } else if (effect.is(clearVariablesEffect)) {
        value = Decoration.none
      }
    }
    
    return value
  },
  provide: f => EditorView.decorations.from(f)
})

/**
 * 检查给定位置是否是一个真正的变量（通过选择插入的）
 */
export function isRealVariable(state: EditorState, pos: number): boolean {
  const variables = state.field(variableState, false)
  if (!variables) return false
  
  let result = false
  variables.between(pos, pos, () => {
    result = true
    return false // 停止遍历
  })
  return result
}

/**
 * 获取文档中所有真正的变量位置
 */
export function getRealVariables(state: EditorState): Array<{ from: number; to: number }> {
  const variables = state.field(variableState, false)
  if (!variables) return []
  
  const result: Array<{ from: number; to: number }> = []
  variables.between(0, state.doc.length, (from, to) => {
    result.push({ from, to })
  })
  return result
}

/**
 * 检查文本是否是一个有效的变量名（在 FORMULA_VARIABLES 中定义）
 */
export function isValidVariableName(text: string): boolean {
  const isValid = FORMULA_VARIABLES.some(v => v.name === text)
  if (!isValid) {
    console.log('❌ Not a valid variable:', text, 'Available variables:', FORMULA_VARIABLES.map(v => v.name))
  }
  return isValid
}

/**
 * 插入变量时调用此函数，标记为真正的变量
 */
export function insertVariable(view: EditorView, variableName: string, from: number, to: number) {
  view.dispatch({
    changes: [{ from, to, insert: variableName }],
    effects: [addVariableEffect.of({ from, to: from + variableName.length })],
    selection: { anchor: from + variableName.length, head: from + variableName.length }
  })
}

/**
 * 创建变量高亮扩展
 */
export function variableHighlight(): Extension {
  return [
    variableState,
    EditorView.domEventHandlers({
      paste(event, view) {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false
        
        console.log('📋 Paste detected:', text)
        
        // 检查粘贴的文本中是否包含变量
        const variables: Array<{ from: number; to: number }> = []
        let pos = 0
        
        while (pos < text.length) {
          // 查找下一个可能的变量开始位置
          let start = pos
          while (start < text.length && !/[a-zA-Z_]/.test(text[start])) {
            start++
          }
          
          if (start >= text.length) break
          
          // 从当前位置开始，尝试匹配最长的有效变量
          let foundVariable: { text: string; length: number } | null = null
          let maxLength = 0
          
          // 尝试所有可能的结束位置，从最长到最短
          for (let end = Math.min(start + 100, text.length); end > start; end--) {
            const candidate = text.slice(start, end)
            if (isValidVariableName(candidate) && candidate.length > maxLength) {
              foundVariable = { text: candidate, length: end - start }
              maxLength = candidate.length
              break // 找到最长的有效变量就停止
            }
          }
          
          if (foundVariable) {
            console.log('✅ Valid variable found:', foundVariable.text, 'at', start, '-', start + foundVariable.length)
            variables.push({ from: start, to: start + foundVariable.length })
            pos = start + foundVariable.length
          } else {
            // 没有找到有效变量，跳过一个字符
            pos++
          }
        }
        
        console.log('📋 Total valid variables:', variables.length)
        
        if (variables.length === 0) {
          console.log('📋 No valid variables, letting default paste handle')
          return false
        }
        
        // 执行粘贴并添加变量标记
        const selection = view.state.selection.main
        const from = selection.from
        const to = selection.to
        
        // 创建变量标记效果
        const effects = variables.map(v => 
          addVariableEffect.of({ from: from + v.from, to: from + v.to })
        )
        
        console.log('📋 Dispatching with effects:', effects)
        
        // 在一个 dispatch 中完成粘贴和添加标记
        view.dispatch({
          changes: [{ from, to, insert: text }],
          effects,
          selection: { anchor: from + text.length, head: from + text.length }
        })
        
        event.preventDefault()
        console.log('📋 Paste completed')
        return true
      }
    }),
    EditorView.baseTheme({
      '.cm-formula-variable': {
        backgroundColor: '#e8f4fd',
        borderRadius: '3px',
        padding: '2px 4px',
        margin: '0 1px',
        position: 'relative',
        display: 'inline',
        lineHeight: '1.6',
      },
      '.cm-formula-variable::before': {
        content: '""',
        position: 'absolute',
        left: '0',
        right: '0',
        top: '0',
        bottom: '0',
        border: '1px solid #7abaff',
        borderRadius: '3px',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }
    })
  ]
}
