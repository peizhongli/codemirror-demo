import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches } from '@codemirror/search'
import { keymap } from '@codemirror/view'
import { spreadsheet } from 'codemirror-lang-spreadsheet'

import {
  FormulaFunction,
  getFormulaFunctions,
  SupportedFunctionType,
  DEFAULT_SUPPORTED_FUNCTIONS,
} from './constants'
import { createFormulaCompletionSource } from './formulaCompletions'
import { atomicVariables } from './atomicVariable'
import { getCurrentParamIndex, getHighlightedParam } from './functionParams'
import { variableHighlight, insertVariable, generateFormulaParams } from './variableHighlight'
import { variableDictionary } from './variableDictionary'
import './index.scss'

interface Props {
  initialValue?: string
  onChange?: (value: string) => void
  /** 支持的函数类型，默认为 ['AVERAGE', 'MAX', 'MIN', 'SUM'] */
  supportedFunctions?: SupportedFunctionType[]
  /** 自定义函数列表，如果提供则忽略 supportedFunctions */
  customFunctions?: FormulaFunction[]
  /** 自定义示例公式 */
  exampleFormulas?: string[]
}

const DEFAULT_EXAMPLE_FORMULAS = [
  'SUM(`财务·收入`, `财务·支出`)',
  'AVERAGE(`人事·员工数`, `人事·工资`)',
  'MAX(`财务·收入`, `财务·支出`)',
  'MIN(`财务·收入`, `财务·支出`)',
]

export default function FormulaEditor({
  initialValue = '', // 初始值设置为空
  onChange,
  supportedFunctions = DEFAULT_SUPPORTED_FUNCTIONS,
  customFunctions,
  exampleFormulas = DEFAULT_EXAMPLE_FORMULAS,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [activeFn, setActiveFn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [highlightedParam, setHighlightedParam] = useState<string | null>(null)
  const [calculationResult, setCalculationResult] = useState<{ param1: string; param2: Array<{ dictName: string; dictCode: string; elementName: string; elementCode: string; serialNumber: string }> } | null>(null)
  const [showVariableSelector, setShowVariableSelector] = useState(false) // 控制变量选择器显示
  const editorRef = useRef<{ view: EditorView; state?: EditorState } | null>(null)

  // 初始化动态变量字典（示例）
  useEffect(() => {
    // 清空字典
    variableDictionary.clear()
    
    // 添加示例变量（允许重名）
    variableDictionary.addVariables([
      { code: 'finance_var1', dictName: '财务', variableName: '收入', type: 'number' },
      { code: 'finance_var2', dictName: '财务', variableName: '支出', type: 'number' },
      { code: 'hr_var1', dictName: '人事', variableName: '员工数', type: 'number' },
      { code: 'hr_var2', dictName: '人事', variableName: '工资', type: 'number' },
      { code: 'finance_var3', dictName: '财务', variableName: '收入', type: 'number' }, // 重名测试
      { code: 'finance_var4', dictName: '财务', variableName: '收入', type: 'number' }, // 重名测试
    ])
  }, [])

  // 计算实际使用的函数列表
  const functions = useMemo(() => {
    return customFunctions || getFormulaFunctions(supportedFunctions)
  }, [customFunctions, supportedFunctions])

  // 获取支持的函数名称集合
  const supportedFunctionNames = useMemo(() => {
    return new Set(functions.map(f => f.name.toUpperCase()))
  }, [functions])

  // 创建补全源（只包含函数，不包含变量）
  const completionSource = useMemo(() => {
    return createFormulaCompletionSource(functions)
  }, [functions])

  const extensions = useMemo(
    () => [
      spreadsheet({ idiom: 'en-US', decimalSeparator: '.' }),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      highlightSelectionMatches(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
      autocompletion({ override: [completionSource] }),
      atomicVariables(),
      variableHighlight(),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          const view = update.view
          const state = view.state
          const selection = state.selection.main
          
          // 只有当没有选中内容时才更新高亮
          if (selection.from === selection.to) {
            const cursorPos = selection.from
            const paramInfo = getCurrentParamIndex(state, cursorPos)
            
            if (paramInfo) {
              const fn = functions.find(f => f.name.toUpperCase() === paramInfo.fnName)
              if (fn) {
                const highlighted = getHighlightedParam(fn, paramInfo.paramIndex)
                setHighlightedParam(highlighted)
                return
              }
            }
            
            setHighlightedParam(null)
          } else {
            // 如果有选中内容，不高亮
            setHighlightedParam(null)
          }
        }
      }),
    ],
    [functions]
  )

  const handleChange = useCallback(
    (val: string) => {
      setValue(val)

      const fnMatch = val.slice(0, 200).match(/\b([A-Z][A-Z0-9]*)\s*\(/i)
      const functionName = fnMatch ? fnMatch[1].toUpperCase() : null
      setActiveFn(functionName)

      // 验证函数是否在支持的列表中
      if (functionName && !supportedFunctionNames.has(functionName)) {
        setError(`不支持的函数: ${functionName}，仅支持: ${Array.from(supportedFunctionNames).join(', ')}`)
      } else {
        setError(null)
        onChange?.(val)
      }
    },
    [onChange, supportedFunctionNames]
  )

  const handleInsert = useCallback(
    (text: string) => {
      const ref = editorRef.current
      if (ref && ref.view) {
        const view = ref.view
        const state = view.state
        const selection = state.selection
        
        if (selection && selection.main) {
          const from = selection.main.from
          const to = selection.main.to
          
          // 判断是否是函数（以()结尾）
          const isFunction = text.endsWith('()')
          
          if (isFunction) {
            // 如果是函数，光标放在括号之间
            const cursorPosition = from + text.length - 1
            
            view.dispatch({
              changes: [{ from, to, insert: text }],
              selection: { anchor: cursorPosition, head: cursorPosition }
            })
          } else {
            // 如果是变量，使用 insertVariable 来标记
            insertVariable(view, text, from, to)
          }
          
          // 重新聚焦编辑器
          view.focus()
          
          const nextValue = view.state.doc.toString()
          setValue(nextValue)
          onChange?.(nextValue)
          return
        }
      }
      
      setValue((prev) => {
        const isFunction = text.endsWith('()')
        const insertText = isFunction ? text : `\`${text}\``
        const next = prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}${insertText}` : insertText
        onChange?.(next)
        return next
      })
    },
    [onChange]
  )

  // 计算按钮点击事件
  const handleCalculate = useCallback(() => {
    const ref = editorRef.current
    if (ref && ref.view) {
      const state = ref.view.state
      const params = generateFormulaParams(state)
      
      if (params.error) {
        setCalculationResult(null)
        setError(params.error)
        return
      }
      
      setError(null)
      setCalculationResult(params)
      
      // 输出到控制台
      console.log('========================================')
      console.log('计算参数输出：')
      console.log('参数1 (替换后的公式):', params.param1)
      console.log('参数2 (变量映射数组):')
      console.log(JSON.stringify(params.param2, null, 2))
      console.log('========================================')
    }
  }, [])

  const activeFnDef = activeFn ? functions.find((f) => f.name === activeFn) : null

  return (
    <div className="cm-formula-editor">
      <div className="cm-formula-editor__main">
        <div className="cm-formula-editor__input-wrap">
          <CodeMirror
            value={value}
            height="120px"
            className="cm-formula-editor__codemirror"
            extensions={extensions}
            onChange={handleChange}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
            }}
            placeholder="输入公式，如 SUM(`财务·收入`, `财务·支出`)"
            ref={editorRef}
          />
        </div>
        
        {/* 操作按钮 */}
        <div className="cm-formula-editor__actions">
          {/* 外部变量选择按钮 */}
          <button 
            type="button" 
            className="cm-formula-editor__select-btn" 
            onClick={() => setShowVariableSelector(!showVariableSelector)}
          >
            {showVariableSelector ? '收起变量' : '选择变量'}
          </button>
          
          {/* 计算按钮 */}
          <button type="button" className="cm-formula-editor__calculate-btn" onClick={handleCalculate}>
            计算
          </button>
        </div>
        
        {/* 外部变量选择器 */}
        {showVariableSelector && (
          <div className="cm-formula-editor__variable-selector">
            <h4>选择变量插入</h4>
            <div className="cm-formula-editor__variable-grid">
              {variableDictionary.getAllElements().map((element) => {
                const displayName = variableDictionary.getDisplayNameByCode(element.code)!
                return (
                  <button 
                    key={element.code} 
                    type="button" 
                    className="cm-formula-editor__variable-item"
                    onClick={() => {
                      handleInsert(displayName)
                    }}
                  >
                    <span className="label">{element.dictName}</span>
                    <span className="name">{element.variableName}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        {/* 计算结果展示 */}
        {calculationResult && (
          <div className="cm-formula-editor__result">
            <h4>计算参数</h4>
            <div className="cm-formula-editor__result-param">
              <span className="label">参数1（替换后的公式）:</span>
              <code>{calculationResult.param1}</code>
            </div>
            <div className="cm-formula-editor__result-param">
              <span className="label">参数2（变量映射数组）:</span>
              <pre>{JSON.stringify(calculationResult.param2, null, 2)}</pre>
            </div>
          </div>
        )}
        
        {error && (
          <div className="cm-formula-editor__error">
            <span className="cm-formula-editor__error-icon">⚠️</span>
            <span className="cm-formula-editor__error-text">{error}</span>
          </div>
        )}
        {activeFnDef && (
          <div className="cm-formula-editor__signature">
            <span className="cm-formula-editor__signature-name">{activeFnDef.name}</span>
            <span className="cm-formula-editor__signature-text">
              {(() => {
                const sig = activeFnDef.signature
                if (!highlightedParam) return sig
                
                // 找到高亮参数在签名中的位置并高亮显示
                const paramIndex = sig.indexOf(highlightedParam)
                if (paramIndex === -1) return sig
                
                return (
                  <>
                    {sig.slice(0, paramIndex)}
                    <span className="cm-formula-editor__signature-highlight">
                      {highlightedParam}
                    </span>
                    {sig.slice(paramIndex + highlightedParam.length)}
                  </>
                )
              })()}
            </span>
            <span className="cm-formula-editor__signature-detail">{activeFnDef.detail}</span>
          </div>
        )}
      </div>

      <aside className="cm-formula-editor__sidebar">
        <section>
          <h4>变量</h4>
          <ul>
            {variableDictionary.getAllElements().map((element) => {
              const displayName = variableDictionary.getDisplayNameByCode(element.code)!
              return (
                <li key={element.code}>
                  <button type="button" onClick={() => handleInsert(displayName)} title={`${element.dictName}·${element.variableName}`}>
                    <span className="label">{element.variableName}</span>
                    <code>{displayName}</code>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <section>
          <h4>函数</h4>
          <ul>
            {functions.map((fn) => (
              <li key={fn.name}>
                <button type="button" onClick={() => handleInsert(`${fn.name}()`)}>
                  <span className="label">{fn.label}</span>
                  <code>{fn.name}</code>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>示例</h4>
          <ul className="examples">
            {exampleFormulas.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(ex)
                    onChange?.(ex)
                  }}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

export { DEFAULT_EXAMPLE_FORMULAS }