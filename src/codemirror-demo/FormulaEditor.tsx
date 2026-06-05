import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
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
import { variableHighlight, insertVariable } from './variableHighlight'
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
  'SUM(财务·收入, 财务·支出)',
  'AVERAGE(人事·员工数, 人事·工资)',
  'MAX(财务·收入, 财务·支出)',
  'MIN(财务·收入, 财务·支出)',
]



export default function FormulaEditor({
  initialValue = DEFAULT_EXAMPLE_FORMULAS[0],
  onChange,
  supportedFunctions = DEFAULT_SUPPORTED_FUNCTIONS,
  customFunctions,
  exampleFormulas = DEFAULT_EXAMPLE_FORMULAS,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [activeFn, setActiveFn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [highlightedParam, setHighlightedParam] = useState<string | null>(null)
  const editorRef = useRef<{ view: EditorView; state: unknown } | null>(null)

  // 初始化动态变量字典（示例）
  useEffect(() => {
    // 清空字典
    variableDictionary.clear()
    
    // 添加示例变量
    variableDictionary.addVariables([
      { code: 'var1', dictName: '财务', variableName: '收入', type: 'number' },
      { code: 'var2', dictName: '财务', variableName: '支出', type: 'number' },
      { code: 'var3', dictName: '人事', variableName: '员工数', type: 'number' },
      { code: 'var4', dictName: '人事', variableName: '工资', type: 'number' },
      { code: 'var5', dictName: '财务', variableName: '收入', type: 'number' }, // 重名测试
      { code: 'var6', dictName: '财务', variableName: '收入', type: 'number' }, // 重名测试
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

  // 创建补全源
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
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        defaultKeymap: true,
      }),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
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
    [completionSource, functions]
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
        const next = prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}${text}` : text
        onChange?.(next)
        return next
      })
    },
    [onChange]
  )

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
            placeholder="输入公式，如 SUM(first_deep1, second)"
            ref={editorRef}
          />
        </div>
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
