import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { variableDictionary } from './variableDictionary'

// 变量颜色配置
const TAG_COLORS = [
  {
    color: '#F65E55',
    bgColor: '#fee',
  },
  {
    color: '#5483F2',
    bgColor: '#DDE6FC',
  },
  {
    color: '#55C6EF',
    bgColor: '#DDF4FC',
  },
  {
    color: '#00B084',
    bgColor: '#D0EEE9',
  },
  {
    color: '#EB67B2',
    bgColor: '#FBE1F0',
  },
]

// 字典名到颜色索引的映射
const dictColorIndex = new Map<string, number>()
let nextColorIndex = 0

/**
 * 获取字典名对应的颜色配置
 */
function getDictColor(dictName: string): { color: string; bgColor: string } {
  if (!dictColorIndex.has(dictName)) {
    dictColorIndex.set(dictName, nextColorIndex % TAG_COLORS.length)
    nextColorIndex++
  }
  const index = dictColorIndex.get(dictName)!
  return TAG_COLORS[index]
}

/**
 * 根据显示名称获取颜色类名
 */
function getColorClassName(displayName: string): string {
  const element = variableDictionary.getElementByDisplayName(displayName)
  if (!element) return 'cm-formula-variable-default'
  
  const colorIndex = dictColorIndex.get(element.dictName) || 0
  return `cm-formula-variable-${colorIndex}`
}

/**
 * 创建变量装饰
 */
function createVariableDecoration(displayName: string): Decoration {
  const element = variableDictionary.getElementByDisplayName(displayName)
  if (!element) {
    return Decoration.mark({ class: 'cm-formula-variable-default' })
  }
  
  const color = getDictColor(element.dictName)
  return Decoration.mark({
    attributes: {
      style: `background-color: ${color.bgColor}; color: ${color.color}; border-color: ${color.color};`
    },
    class: 'cm-formula-variable'
  })
}

// 定义状态效果类型（导出供其他模块使用）
export const addVariableEffect = StateEffect.define<{ from: number; to: number; displayName: string }>()
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
    // 记录更新前的变量位置
    const oldVariables: Array<{ from: number; to: number; text: string }> = []
    value.between(0, tr.state.doc.length, (from, to) => {
      oldVariables.push({ from, to, text: tr.state.doc.sliceString(from, to) })
    })
    
    // 先调整现有 decoration 的位置以适应文档变化
    if (tr.docChanged) {
      value = value.map(tr.changes)
    }
    
    // 记录更新后的变量位置
    const newVariables: Array<{ from: number; to: number; text: string }> = []
    value.between(0, tr.newDoc.length, (from, to) => {
      newVariables.push({ from, to, text: tr.newDoc.sliceString(from, to) })
    })
    
    // 检测被删除的变量
    const deletedVariables = oldVariables.filter(oldVar => {
      return !newVariables.some(newVar => 
        newVar.from === oldVar.from && newVar.to === oldVar.to && newVar.text === oldVar.text
      )
    })
    
    // 对于被删除的变量，检查文档中是否还有其他位置使用
    for (const deletedVar of deletedVariables) {
      const variableText = deletedVar.text
      
      // 检查更新后的文档中是否还有该变量
      const stillExists = newVariables.some(v => v.text === variableText)
      
      // 如果文档中不再存在该变量，从字典中删除
      if (!stillExists && variableDictionary.hasDisplayName(variableText)) {
        console.log('🗑️ Removing variable from dictionary:', variableText)
        variableDictionary.removeByDisplayName(variableText)
      }
    }
    
    // 然后处理 effects
    for (const effect of tr.effects) {
      if (effect.is(addVariableEffect)) {
        const builder = new RangeSetBuilder<Decoration>()
        value.between(0, tr.newDoc.length, (from, to, decoration) => {
          builder.add(from, to, decoration)
        })
        // 根据 displayName 创建带有颜色的装饰
        const decoration = createVariableDecoration(effect.value.displayName)
        builder.add(effect.value.from, effect.value.to, decoration)
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
 * 检查文本是否是一个有效的变量名（在动态字典中存在）
 */
export function isValidVariableName(text: string): boolean {
  const isValid = variableDictionary.hasDisplayName(text)
  if (!isValid) {
    console.log('❌ Not a valid variable:', text, 'Available variables:', variableDictionary.getAllDisplayNames())
  }
  return isValid
}

/**
 * 插入变量时调用此函数，标记为真正的变量
 */
export function insertVariable(view: EditorView, variableName: string, from: number, to: number) {
  view.dispatch({
    changes: [{ from, to, insert: variableName }],
    effects: [addVariableEffect.of({ from, to: from + variableName.length, displayName: variableName })],
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
        const variables: Array<{ from: number; to: number; displayName: string }> = []
        let pos = 0
        
        while (pos < text.length) {
          // 查找下一个可能的变量开始位置
          // 支持中文字符、英文字母、下划线作为变量开头
          let start = pos
          while (start < text.length && !/[\u4e00-\u9fa5a-zA-Z_]/.test(text[start])) {
            start++
          }
          
          if (start >= text.length) break
          
          // 从当前位置开始，尝试匹配最长的有效变量
          let foundVariable: { text: string; length: number } | null = null
          let maxLength = 0
          
          // 尝试所有可能的结束位置，从最长到最短
          // 支持中文字符、英文字母、数字、下划线、点、中文句号作为变量组成部分
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
            variables.push({ from: start, to: start + foundVariable.length, displayName: foundVariable.text })
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
          addVariableEffect.of({ from: from + v.from, to: from + v.to, displayName: v.displayName })
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
      // 函数名样式
      '.cm-function': {
        color: '#5483F2',
        fontWeight: '600',
      },
      // 括号样式
      '.cm-paren': {
        color: '#86909c',
      },
      // 清除其他不必要的颜色样式
      '.cm-string': {
        color: 'inherit',
      },
      '.cm-number': {
        color: 'inherit',
      },
      '.cm-keyword': {
        color: 'inherit',
      },
      '.cm-operator': {
        color: 'inherit',
      },
      '.cm-comment': {
        color: 'inherit',
      },
      // 变量样式
      '.cm-formula-variable': {
        borderRadius: '3px',
        padding: '2px 4px',
        margin: '0 1px',
        position: 'relative',
        display: 'inline',
        lineHeight: '1.6',
        borderWidth: '1px',
        borderStyle: 'solid',
        // 确保没有伪元素样式
        '&::before': {
          display: 'none',
        },
      },
      '.cm-formula-variable-default': {
        backgroundColor: '#e8f4fd',
        borderRadius: '3px',
        padding: '2px 4px',
        margin: '0 1px',
        position: 'relative',
        display: 'inline',
        lineHeight: '1.6',
        border: '1px solid #7abaff',
        '&::before': {
          display: 'none',
        },
      }
    })
  ]
}
