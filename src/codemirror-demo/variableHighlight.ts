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
 * 创建变量装饰
 */
function createVariableDecoration(displayName: string): Decoration {
  const element = variableDictionary.getElementByDisplayName(displayName)
  if (!element) {
    return Decoration.mark({ 
      class: 'cm-formula-variable-default',
      inclusiveLeft: true,
      inclusiveRight: true,
      exclusive: false
    })
  }
  
  const color = getDictColor(element.dictName)
  return Decoration.mark({
    attributes: {
      style: `background-color: ${color.bgColor}; color: ${color.color}; border-color: ${color.color};`
    },
    class: 'cm-formula-variable',
    inclusiveLeft: true,
    inclusiveRight: true,
    exclusive: false
  })
}

// 定义状态效果类型（导出供其他模块使用）
export const addVariableEffect = StateEffect.define<{ displayName: string }>()
const removeVariableEffect = StateEffect.define<{ from: number; to: number }>()
const clearVariablesEffect = StateEffect.define()

// 创建状态字段来跟踪变量位置
// 变量只能通过点选插入，手动输入的一定不是变量
// 所以变量位置是固定的，不受文档变化影响
// 变量用反引号 ` 包围来标记
const variableState = StateField.define<DecorationSet>({
  create(state) {
    // 初始化时扫描文档中的反引号包围的变量并添加装饰
    const builder = new RangeSetBuilder<Decoration>()
    const docText = state.doc.toString()
    
    // 使用正则表达式查找所有被反引号包围的内容
    const regex = /`([^`]+)`/g
    let match
    
    while ((match = regex.exec(docText)) !== null) {
      const content = match[1]
      // 检查是否是字典中的变量
      if (variableDictionary.hasDisplayName(content)) {
        // 装饰包括反引号，但只高亮内部内容
        const decoration = createVariableDecoration(content)
        builder.add(match.index, match.index + match[0].length, decoration)
      }
    }
    
    return builder.finish()
  },
  update(value, tr) {
    // 如果文档内容发生变化，重新扫描所有反引号标记的变量
    if (tr.docChanged) {
      const builder = new RangeSetBuilder<Decoration>()
      const docText = tr.newDoc.toString()
      
      // 使用正则表达式查找所有被反引号包围的内容
      const regex = /`([^`]+)`/g
      let match
      
      while ((match = regex.exec(docText)) !== null) {
        const content = match[1]
        // 检查是否是字典中的变量
        if (variableDictionary.hasDisplayName(content)) {
          // 装饰包括反引号，但只高亮内部内容
          const decoration = createVariableDecoration(content)
          builder.add(match.index, match.index + match[0].length, decoration)
        }
      }
      
      value = builder.finish()
    }
    
    // 记录更新后的变量位置
    const newVariables: Array<{ from: number; to: number; text: string }> = []
    value.between(0, tr.newDoc.length, (from, to) => {
      newVariables.push({ from, to, text: tr.newDoc.sliceString(from, to) })
    })
    
    // 处理 effects
    for (const effect of tr.effects) {
      if (effect.is(removeVariableEffect)) {
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
  // 在变量前后添加反引号标记
  const markedVariable = `\`${variableName}\``
  view.dispatch({
    changes: [{ from, to, insert: markedVariable }],
    effects: [addVariableEffect.of({ displayName: variableName })],
    selection: { anchor: from + markedVariable.length, head: from + markedVariable.length }
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
        if (!text) {
          console.log('📋 Paste cancelled: No text in clipboard')
          return false
        }
        
        console.log('========================================')
        console.log('📋 Paste detected')
        console.log('📋 Raw clipboard text:', JSON.stringify(text))
        
        // 获取当前选区信息
        const selection = view.state.selection.main
        const hasSelection = selection.from !== selection.to
        const selectedText = hasSelection ? view.state.doc.sliceString(selection.from, selection.to) : ''
        
        console.log('📋 Has selection:', hasSelection)
        console.log('📋 Selection range:', selection.from, '-', selection.to)
        console.log('📋 Selected text:', JSON.stringify(selectedText))
        
        // 检查剪贴板内容
        const trimmed = text.trim()
        const hasNewline = text.includes('\n')
        
        console.log('📋 Trimmed text:', JSON.stringify(trimmed))
        console.log('📋 Contains newline:', hasNewline)
        
        // 检查是否是单个变量（格式：`变量名`）
        const singleVarMatch = trimmed.match(/^`([^`]+)`$/)
        
        console.log('📋 Single var match:', singleVarMatch ? 'YES' : 'NO')
        if (singleVarMatch) {
          console.log('📋 Variable name extracted:', singleVarMatch[1])
          console.log('📋 Is valid variable:', variableDictionary.hasDisplayName(singleVarMatch[1]))
        }
        
        // 只处理单个被反引号包围的变量
        if (singleVarMatch) {
          const content = singleVarMatch[1]
          if (variableDictionary.hasDisplayName(content)) {
            console.log('✅ Processing single valid variable')
            
            const from = selection.from
            const to = selection.to
            
            console.log('📋 Inserting at:', from, '-', to)
            console.log('📋 Inserting text:', JSON.stringify(trimmed))
            
            view.dispatch({
              changes: [{ from, to, insert: trimmed }],
              selection: { anchor: from + trimmed.length, head: from + trimmed.length }
            })
            
            event.preventDefault()
            console.log('✅ Paste completed successfully')
            console.log('========================================')
            return true
          } else {
            console.log('❌ Variable not in dictionary:', content)
            console.log('❌ Available variables:', variableDictionary.getAllDisplayNames())
          }
        }
        
        // 对于其他情况，让默认粘贴处理
        console.log('📋 Falling back to default paste behavior')
        console.log('========================================')
        return false
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const selection = update.state.selection.main
        const hasSelection = selection.from !== selection.to
        
        if (hasSelection) {
          const selectedText = update.state.doc.sliceString(selection.from, selection.to)
          console.log('========================================')
          console.log('🎯 Selection changed')
          console.log('🎯 Selection range:', selection.from, '-', selection.to)
          console.log('🎯 Selected text:', JSON.stringify(selectedText))
          console.log('🎯 Selected text length:', selectedText.length)
          
          // 检查是否选中了单个变量
          const trimmed = selectedText.trim()
          const isSingleVar = trimmed.match(/^`([^`]+)`$/)
          console.log('🎯 Is single variable format:', isSingleVar ? 'YES' : 'NO')
          
          if (isSingleVar) {
            console.log('🎯 Variable name:', isSingleVar[1])
            console.log('🎯 Is valid variable:', variableDictionary.hasDisplayName(isSingleVar[1]))
          }
          console.log('========================================')
        }
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
