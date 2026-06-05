import { EditorState, Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getRealVariables } from './variableHighlight'

/**
 * 检查位置是否在变量内部或边界上
 * 只检查通过点选插入的真正变量，不检查手动输入的文本
 */
function findVariableAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const variables = getRealVariables(state)
  
  // 查找包含该位置的变量
  for (const variable of variables) {
    if (pos >= variable.from && pos <= variable.to) {
      return variable
    }
  }
  
  return null
}

/**
 * 获取光标位置左边最近的变量
 */
function getVariableBefore(state: EditorState, pos: number): { from: number; to: number } | null {
  if (pos <= 0) return null
  
  const variable = findVariableAt(state, pos - 1)
  if (variable && variable.to === pos) {
    return variable
  }
  
  return null
}

/**
 * 创建原子化变量扩展
 */
export function atomicVariables(): Extension {
  // 使用 inputHandler 在最底层拦截输入
  const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
    // console.log('🚀🚀🚀 inputHandler:', { from, to, text })
    // 返回 false 表示不处理，让默认处理继续
    return false
  })
  
  // 直接在 DOM 上添加事件监听
  const domPlugin = EditorView.updateListener.of((update) => {
    // 只在第一次更新时添加事件监听
    if (update.docChanged || update.selectionSet) {
      const view = update.view
      const dom = view.dom
      
      // 添加 keydown 事件监听
      const handleKeyDown = (event: KeyboardEvent) => {
        // console.log('🚀🚀🚀 DOM keydown:', event.key, event.code)
        
        const { from, to } = view.state.selection.main
        const pos = from === to ? from : Math.min(from, to)
        
        // 处理左箭头
        if (event.key === 'ArrowLeft') {
          // console.log('🚀🚀🚀 ArrowLeft detected, pos:', pos)
          
          if (pos > 0) {
            const variable = findVariableAt(view.state, pos)
            // console.log('🚀🚀🚀 variable at pos:', variable)
            
            if (variable) {
              if (pos === variable.to) {
                // console.log('🚀🚀🚀 moving to variable left:', variable.from)
                view.dispatch({
                  selection: { anchor: variable.from, head: variable.from }
                })
                event.preventDefault()
                event.stopPropagation()
                return
              } else if (pos > variable.from) {
                // console.log('🚀🚀🚀 moving from inside to left:', variable.from)
                view.dispatch({
                  selection: { anchor: variable.from, head: variable.from }
                })
                event.preventDefault()
                event.stopPropagation()
                return
              }
            }
            
            const prevVariable = getVariableBefore(view.state, pos)
            // console.log('🚀🚀🚀 prevVariable:', prevVariable)
            
            if (prevVariable) {
              // console.log('🚀🚀🚀 moving to prevVariable left:', prevVariable.from)
              view.dispatch({
                selection: { anchor: prevVariable.from, head: prevVariable.from }
              })
              event.preventDefault()
              event.stopPropagation()
              return
            }
          }
        }
        
        // 处理右箭头
        if (event.key === 'ArrowRight') {
          // console.log('🚀🚀🚀 ArrowRight detected, pos:', pos)
          
          // 如果有选区（不是单纯的光标），让默认行为处理
          if (from !== to) {
            return
          }
          
          const docLength = view.state.doc.length
          if (pos < docLength) {
            const variable = findVariableAt(view.state, pos)
            // console.log('🚀🚀🚀 variable at pos:', variable)
            
            if (variable) {
              if (pos === variable.from) {
                // console.log('🚀🚀🚀 moving to variable right:', variable.to)
                view.dispatch({
                  selection: { anchor: variable.to, head: variable.to }
                })
                event.preventDefault()
                event.stopPropagation()
                return
              } else if (pos < variable.to) {
                // console.log('🚀🚀🚀 moving from inside to right:', variable.to)
                view.dispatch({
                  selection: { anchor: variable.to, head: variable.to }
                })
                event.preventDefault()
                event.stopPropagation()
                return
              }
            }
          }
        }
        
        // 处理退格键
        if (event.key === 'Backspace') {
          // console.log('🚀🚀🚀 Backspace detected, pos:', pos)
          
          if (from !== to) return
          
          if (pos > 0) {
            const variable = findVariableAt(view.state, pos)
            // console.log('🚀🚀🚀 variable at pos:', variable)
            
            if (variable && pos === variable.to) {
              // console.log('🚀🚀🚀 deleting variable:', variable)
              view.dispatch({
                changes: { from: variable.from, to: variable.to, insert: '' },
                selection: { anchor: variable.from, head: variable.from }
              })
              event.preventDefault()
              event.stopPropagation()
              return
            }
            
            const prevVariable = getVariableBefore(view.state, pos)
            // console.log('🚀🚀🚀 prevVariable:', prevVariable)
            
            if (prevVariable) {
              // console.log('🚀🚀🚀 deleting prevVariable:', prevVariable)
              view.dispatch({
                changes: { from: prevVariable.from, to: prevVariable.to, insert: '' },
                selection: { anchor: prevVariable.from, head: prevVariable.from }
              })
              event.preventDefault()
              event.stopPropagation()
              return
            }
          }
        }
        
        // 处理删除键
        if (event.key === 'Delete') {
          // console.log('🚀🚀🚀 Delete detected, pos:', pos)
          
          if (from !== to) return
          
          const docLength = view.state.doc.length
          if (pos < docLength) {
            const variable = findVariableAt(view.state, pos)
            // console.log('🚀🚀🚀 variable at pos:', variable)
            
            if (variable) {
              // console.log('🚀🚀🚀 deleting variable:', variable)
              view.dispatch({
                changes: { from: variable.from, to: variable.to, insert: '' },
                selection: { anchor: variable.from, head: variable.from }
              })
              event.preventDefault()
              event.stopPropagation()
              return
            }
            
            const prevVariable = getVariableBefore(view.state, pos)
            // console.log('🚀🚀🚀 prevVariable:', prevVariable)
            
            if (prevVariable) {
              // console.log('🚀🚀🚀 deleting prevVariable:', prevVariable)
              view.dispatch({
                changes: { from: prevVariable.from, to: prevVariable.to, insert: '' },
                selection: { anchor: prevVariable.from, head: prevVariable.from }
              })
              event.preventDefault()
              event.stopPropagation()
              return
            }
          }
        }
      }
      
      // 移除旧的监听
      dom.removeEventListener('keydown', handleKeyDown)
      // 添加新的监听，使用捕获阶段
      dom.addEventListener('keydown', handleKeyDown, true)
    }
  })

  // 点击处理
  const clickHandler = EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false

      const variable = findVariableAt(view.state, pos)
      if (variable) {
        let cursorPos: number
        
        // 如果点击位置恰好是变量起始位置，光标落在左侧
        if (pos === variable.from) {
          cursorPos = variable.from
        } else {
          // 否则（包括点击变量中间或右侧），光标落在右侧
          cursorPos = variable.to
        }
        
        view.dispatch({
          selection: { anchor: cursorPos, head: cursorPos }
        })
        view.focus()
        return true
      }
      return false
    },
    mousedown(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false

      const variable = findVariableAt(view.state, pos)
      if (variable) {
        let cursorPos: number
        
        // 如果点击位置恰好是变量起始位置，光标落在左侧
        if (pos === variable.from) {
          cursorPos = variable.from
        } else {
          // 否则（包括点击变量中间或右侧），光标落在右侧
          cursorPos = variable.to
        }
        
        view.dispatch({
          selection: { anchor: cursorPos, head: cursorPos }
        })
        return true
      }
      return false
    }
  })

  return [inputHandler, domPlugin, clickHandler] as Extension
}
