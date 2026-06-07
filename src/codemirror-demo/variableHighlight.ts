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

// 当前编辑区变量的映射（显示名称 -> 流水号 -> 变量元素）
interface EditorVariableInfo {
  displayName: string
  elementCode: string
  serialNumber: string
}

// 维护当前编辑区变量的状态字段
const editorVariablesState = StateField.define<Map<string, EditorVariableInfo[]>>({
  create() {
    return new Map()
  },
  update(value, tr) {
    if (tr.docChanged) {
      const docText = tr.newDoc.toString()
      const newVariables = new Map<string, EditorVariableInfo[]>()
      
      // 扫描所有被反引号包围的变量
      const regex = /`([^`]+)`/g
      let match
      let serialCounter = new Map<string, number>()
      
      while ((match = regex.exec(docText)) !== null) {
        const displayName = match[1]
        const elements = variableDictionary.getElementsByDisplayName(displayName)
        
        if (elements.length > 0) {
          // 获取当前字典的序列号
          const dictName = elements[0].dictName
          const currentCount = serialCounter.get(dictName) || 0
          serialCounter.set(dictName, currentCount + 1)
          
          // 生成流水号（字典code+序号）
          const serialNumber = `${elements[0].code}_${currentCount + 1}`
          
          // 获取对应的变量元素（按顺序分配）
          const elementIndex = currentCount % elements.length
          const element = elements[elementIndex]
          
          // 添加到映射
          if (!newVariables.has(displayName)) {
            newVariables.set(displayName, [])
          }
          newVariables.get(displayName)!.push({
            displayName,
            elementCode: element.code,
            serialNumber
          })
        }
      }
      
      return newVariables
    }
    
    return value
  }
})

// 定义状态效果类型（导出供其他模块使用）
export const addVariableEffect = StateEffect.define<{ displayName: string }>()
const removeVariableEffect = StateEffect.define<{ from: number; to: number }>()
const clearVariablesEffect = StateEffect.define()

// 创建状态字段来跟踪变量位置
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
 * 获取文档中所有变量的位置（保持兼容性）
 */
export function getRealVariables(state: EditorState): Array<{ from: number; to: number }> {
  const variables = state.field(editorVariablesState, false)
  if (!variables) return []
  
  const result: Array<{ from: number; to: number }> = []
  const docText = state.doc.toString()
  const regex = /`([^`]+)`/g
  let match
  
  while ((match = regex.exec(docText)) !== null) {
    const displayName = match[1]
    if (variableDictionary.hasDisplayName(displayName)) {
      result.push({ from: match.index, to: match.index + match[0].length })
    }
  }
  
  return result
}

/**
 * 获取当前编辑区所有变量信息（按出现顺序）
 */
export function getEditorVariables(state: EditorState): EditorVariableInfo[] {
  const variables = state.field(editorVariablesState, false)
  if (!variables) return []
  
  const result: EditorVariableInfo[] = []
  const docText = state.doc.toString()
  const regex = /`([^`]+)`/g
  let match
  
  while ((match = regex.exec(docText)) !== null) {
    const displayName = match[1]
    const infos = variables.get(displayName)
    
    if (infos && infos.length > 0) {
      // 找到第一个未使用的info
      const usedIndices = new Set<number>()
      for (const r of result) {
        if (r.displayName === displayName) {
          const idx = infos.findIndex(i => i.serialNumber === r.serialNumber)
          if (idx !== -1) usedIndices.add(idx)
        }
      }
      
      for (let i = 0; i < infos.length; i++) {
        if (!usedIndices.has(i)) {
          result.push(infos[i])
          break
        }
      }
    }
  }
  
  return result
}

/**
 * 生成公式参数（参数1：替换后的公式，参数2：变量映射数组）
 * @returns { param1, param2, error } 参数对象或错误信息
 */
export function generateFormulaParams(state: EditorState): { 
  param1: string; 
  param2: Array<{ dictName: string; dictCode: string; elementName: string; elementCode: string; serialNumber: string }>;
  error?: string;
} {
  const docText = state.doc.toString()
  
  // 1. 校验：不支持有除变量以外的中文字符
  // 提取所有被反引号包围的内容
  const backtickContent = new Set<string>()
  
  // 提取反引号内的内容
  const backtickRegex = /`([^`]+)`/g
  let match
  while ((match = backtickRegex.exec(docText)) !== null) {
    backtickContent.add(match[1])
  }
  
  // 移除所有反引号及其中的内容，检查剩余文本中是否有中文字符
  const textWithoutVariables = docText.replace(/`[^`]+`/g, '')
  const chineseRegex = /[\u4e00-\u9fa5]/g
  const chineseMatch = textWithoutVariables.match(chineseRegex)
  if (chineseMatch && chineseMatch.length > 0) {
    return { 
      param1: '', 
      param2: [],
      error: `非法输入：不支持有除变量以外的中文字符（发现: ${chineseMatch.join(', ')}）`
    }
  }
  
  // 2. 校验：不支持有除函数和变量以外的英文字符
  // 支持的函数名
  const supportedFunctions = ['SUM', 'AVERAGE', 'MAX', 'MIN']
  
  // 移除函数名和变量后检查剩余英文字符
  let textWithoutFunctions = textWithoutVariables
  for (const fn of supportedFunctions) {
    textWithoutFunctions = textWithoutFunctions.replace(new RegExp(fn, 'gi'), '')
  }
  
  // 移除括号、逗号、空格、数字、运算符等合法字符
  const cleanedText = textWithoutFunctions.replace(/[(),\s\d+\-*/.%]/g, '')
  
  // 检查是否有剩余的英文字符
  const letterRegex = /[a-zA-Z_]/g
  const letterMatch = cleanedText.match(letterRegex)
  if (letterMatch && letterMatch.length > 0) {
    return { 
      param1: '', 
      param2: [],
      error: `非法输入：不支持有除函数和变量以外的英文字符（发现: ${letterMatch.join('')}）`
    }
  }
  
  // 获取编辑区变量
  const editorVariables = getEditorVariables(state)
  
  // 校验：编辑区中的变量必须都在字典中存在
  for (const info of editorVariables) {
    const element = variableDictionary.getElementByCode(info.elementCode)
    if (!element) {
      return { 
        param1: '', 
        param2: [],
        error: `非法输入：变量 "${info.displayName}" 不存在于字典中`
      }
    }
  }
  
  // 构建变量到流水号的映射（按出现顺序）
  const param2: Array<{ dictName: string; dictCode: string; elementName: string; elementCode: string; serialNumber: string }> = []
  
  for (const info of editorVariables) {
    const element = variableDictionary.getElementByCode(info.elementCode)
    if (element) {
      param2.push({
        dictName: element.dictName,
        dictCode: element.code.split('_')[0], // 提取字典code
        elementName: element.variableName,
        elementCode: element.code,
        serialNumber: info.serialNumber
      })
    }
  }
  
  // 替换公式中的变量为流水号
  let param1 = docText
  const indexTracker = new Map<string, number>()
  
  param1 = param1.replace(/`([^`]+)`/g, (match, displayName) => {
    // 获取当前显示名称的索引
    const currentIndex = indexTracker.get(displayName) || 0
    indexTracker.set(displayName, currentIndex + 1)
    
    // 获取该显示名称对应的变量信息
    const variables = state.field(editorVariablesState, false)?.get(displayName)
    if (variables && variables.length > currentIndex) {
      return `\`${variables[currentIndex].serialNumber}\``
    }
    
    // 如果找不到对应的变量，返回原始值（带反引号）
    return match
  })
  
  return { param1, param2 }
}

/**
 * 检查文本是否是一个有效的变量名（在动态字典中存在）
 */
export function isValidVariableName(text: string): boolean {
  return variableDictionary.hasDisplayName(text)
}

/**
 * 插入变量时调用此函数
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
    editorVariablesState,
    EditorView.domEventHandlers({
      paste(event, view) {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) {
          return false
        }
        
        // 检查是否是单个变量（格式：`变量名`）
        const trimmed = text.trim()
        const singleVarMatch = trimmed.match(/^`([^`]+)`$/)
        
        if (singleVarMatch) {
          const content = singleVarMatch[1]
          if (variableDictionary.hasDisplayName(content)) {
            const selection = view.state.selection.main
            const from = selection.from
            const to = selection.to
            
            view.dispatch({
              changes: [{ from, to, insert: trimmed }],
              selection: { anchor: from + trimmed.length, head: from + trimmed.length }
            })
            
            event.preventDefault()
            return true
          }
        }
        
        // 对于其他情况，让默认粘贴处理
        return false
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
        userSelect: 'text',
        cursor: 'text',
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
        userSelect: 'text',
        cursor: 'text',
        '&::before': {
          display: 'none',
        },
      }
    })
  ]
}